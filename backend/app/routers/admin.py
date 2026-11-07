from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.trusted_device import TrustedDevice

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
