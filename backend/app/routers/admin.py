from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, field_validator

from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.security import hash_password
from app.models.user import User
from app.models.trusted_device import TrustedDevice
from app.models.household import Household, HouseholdMember, MemberType

router = APIRouter(prefix="/api/admin", tags=["Admin"])


class DeviceResponse(BaseModel):
    id: str
    user_id: str
    user_email: str
    user_name: str | None
    nickname: str | None
    label: str
    ip_address: str | None
    status: str
    requested_at: str
    reviewed_at: str | None

    model_config = {"from_attributes": True}


class NicknamePayload(BaseModel):
    nickname: str


def _device_response(d: TrustedDevice) -> DeviceResponse:
    return DeviceResponse(
        id=str(d.id),
        user_id=str(d.user_id),
        user_email=d.user.email,
        user_name=d.user.name,
        nickname=d.nickname,
        label=d.label,
        ip_address=d.ip_address,
        status=d.status,
        requested_at=d.requested_at.isoformat(),
        reviewed_at=d.reviewed_at.isoformat() if d.reviewed_at else None,
    )


@router.get("/devices", response_model=list[DeviceResponse])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TrustedDevice)
        .options(selectinload(TrustedDevice.user))
        .order_by(TrustedDevice.requested_at.desc())
    )
    return [_device_response(d) for d in result.scalars().all()]


@router.patch("/devices/{device_id}/approve", response_model=DeviceResponse)
async def approve_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TrustedDevice).options(selectinload(TrustedDevice.user)).where(TrustedDevice.id == device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    device.status = "approved"
    device.reviewed_at = datetime.now(timezone.utc)
    device.reviewed_by = current_user.id
    await db.commit()
    await db.refresh(device)
    return _device_response(device)


@router.patch("/devices/{device_id}/reject", response_model=DeviceResponse)
async def reject_device(
    device_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TrustedDevice).options(selectinload(TrustedDevice.user)).where(TrustedDevice.id == device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    device.status = "rejected"
    device.reviewed_at = datetime.now(timezone.utc)
    device.reviewed_by = current_user.id
    await db.commit()
    await db.refresh(device)
    return _device_response(device)


async def _require_owner(current_user: User, db: AsyncSession) -> Household:
    result = await db.execute(
        select(Household).where(Household.created_by == current_user.id)
    )
    household = result.scalar_one_or_none()
    if not household:
        raise HTTPException(status_code=403, detail="Only the household owner can manage accounts")
    return household


class HouseholdAccountResponse(BaseModel):
    member_id: str
    member_name: str
    member_type_name: str
    member_type_bg_color: str | None
    member_type_text_color: str | None
    user_id: str
    email: str
    is_self: bool


class ResetPasswordPayload(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


@router.get("/household-accounts", response_model=list[HouseholdAccountResponse])
async def list_household_accounts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    household = await _require_owner(current_user, db)

    rows = await db.execute(
        select(HouseholdMember, User, MemberType)
        .join(User, HouseholdMember.user_id == User.id)
        .join(MemberType, HouseholdMember.member_type_id == MemberType.id)
        .where(
            HouseholdMember.household_id == household.id,
            HouseholdMember.user_id.isnot(None),
            HouseholdMember.is_active == True,
        )
        .order_by(HouseholdMember.name)
    )

    return [
        HouseholdAccountResponse(
            member_id=str(member.id),
            member_name=member.name,
            member_type_name=mt.name,
            member_type_bg_color=mt.bg_color,
            member_type_text_color=mt.text_color,
            user_id=str(user.id),
            email=user.email,
            is_self=user.id == current_user.id,
        )
        for member, user, mt in rows.all()
    ]


@router.post("/household-accounts/{user_id}/reset-password")
async def reset_member_password(
    user_id: UUID,
    payload: ResetPasswordPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    household = await _require_owner(current_user, db)

    # Verify the target user is actually a member of this household
    membership = await db.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household.id,
            HouseholdMember.user_id == user_id,
            HouseholdMember.is_active == True,
        )
    )
    if not membership.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="User is not a member of this household")

    target = await db.execute(select(User).where(User.id == user_id))
    target_user = target.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    target_user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"message": f"Password reset for {target_user.email}"}


@router.patch("/devices/{device_id}/rename", response_model=DeviceResponse)
async def rename_device(
    device_id: UUID,
    payload: NicknamePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TrustedDevice).options(selectinload(TrustedDevice.user)).where(TrustedDevice.id == device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    name = payload.nickname.strip()[:100]
    if not name:
        raise HTTPException(status_code=422, detail="Nickname cannot be empty")
    device.nickname = name
    await db.commit()
    await db.refresh(device)
    return _device_response(device)
