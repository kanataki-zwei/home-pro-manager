import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token
from app.models.user import User
from app.models.trusted_device import TrustedDevice, parse_device_label

router = APIRouter()

_COOKIE = dict(httponly=True, samesite="lax", secure=not settings.DEBUG)
_DEVICE_COOKIE = dict(httponly=True, samesite="lax", secure=not settings.DEBUG, max_age=365 * 24 * 3600)


def _set_auth_cookies(response: Response, user_id: str) -> None:
    access = create_access_token(user_id, settings.JWT_SECRET_KEY)
    refresh = create_refresh_token(user_id, settings.JWT_SECRET_KEY)
    response.set_cookie("access_token", access, max_age=3600, **_COOKIE)
    response.set_cookie(
        "refresh_token", refresh,
        max_age=60 * 60 * 24 * 30,
        path="/api/auth/refresh",
        **_COOKIE,
    )


class LoginPayload(BaseModel):
    email: str
    password: str


class VerifyPasswordPayload(BaseModel):
    password: str


class NicknamePayload(BaseModel):
    nickname: str


@router.post("/login")
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: LoginPayload,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    # Resolve or generate device_id
    device_id = request.cookies.get("device_id") or str(uuid.uuid4())
    ua = request.headers.get("user-agent", "")
    ip = (request.client.host if request.client else "") or ""

    # Look up existing device record for this user
    td_result = await db.execute(
        select(TrustedDevice).where(
            TrustedDevice.user_id == user.id,
            TrustedDevice.device_id == device_id,
        )
    )
    device = td_result.scalar_one_or_none()

    if device is None:
        # Check if the user already has any approved device (bootstrap check)
        approved = await db.execute(
            select(TrustedDevice).where(
                TrustedDevice.user_id == user.id,
                TrustedDevice.status == "approved",
            ).limit(1)
        )
        is_first_device = approved.scalar_one_or_none() is None

        new_device = TrustedDevice(
            user_id=user.id,
            device_id=device_id,
            label=parse_device_label(ua),
            user_agent=ua[:500] or None,
            ip_address=ip[:45] or None,
            status="approved" if is_first_device else "pending",
            reviewed_at=datetime.now(timezone.utc) if is_first_device else None,
            reviewed_by=user.id if is_first_device else None,
        )
        db.add(new_device)
        await db.commit()
        device = new_device

    if device.status == "pending":
        resp = JSONResponse(status_code=403, content={"detail": "device_pending"})
        resp.set_cookie("device_id", device_id, **_DEVICE_COOKIE)
        return resp

    if device.status == "rejected":
        resp = JSONResponse(status_code=403, content={"detail": "device_rejected"})
        resp.set_cookie("device_id", device_id, **_DEVICE_COOKIE)
        return resp

    # Approved — issue auth cookies
    _set_auth_cookies(response, str(user.id))
    response.set_cookie("device_id", device_id, **_DEVICE_COOKIE)
    return {"id": str(user.id), "email": user.email, "name": user.name}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", **_COOKIE)
    response.delete_cookie("refresh_token", path="/api/auth/refresh", **_COOKIE)
    return {"message": "Logged out"}


@router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    try:
        payload = decode_token(token, settings.JWT_SECRET_KEY)
        if payload.get("type") != "refresh":
            raise ValueError("wrong type")
        user_id: str = payload["sub"]
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    result = await db.execute(select(User).where(User.id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

    access = create_access_token(user_id, settings.JWT_SECRET_KEY)
    response.set_cookie("access_token", access, max_age=3600, **_COOKIE)
    return {"message": "Token refreshed"}


@router.patch("/device/nickname")
async def set_device_nickname(
    request: Request,
    payload: NicknamePayload,
    db: AsyncSession = Depends(get_db),
):
    device_id = request.cookies.get("device_id")
    if not device_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No device cookie")
    name = payload.nickname.strip()[:100]
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nickname cannot be empty")
    result = await db.execute(
        select(TrustedDevice).where(TrustedDevice.device_id == device_id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    device.nickname = name
    await db.commit()
    return {"message": "Nickname saved"}


@router.post("/verify-password")
async def verify_password_endpoint(
    payload: VerifyPasswordPayload,
    current_user: User = Depends(get_current_user),
):
    if not current_user.password_hash or not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    return {"message": "Password verified"}
