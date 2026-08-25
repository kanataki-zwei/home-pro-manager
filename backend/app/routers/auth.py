from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token
from app.models.user import User

router = APIRouter()

_COOKIE = dict(httponly=True, samesite="lax", secure=not settings.DEBUG)


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


@router.post("/login")
async def login(
    payload: LoginPayload,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    _set_auth_cookies(response, str(user.id))
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


@router.post("/verify-password")
async def verify_password_endpoint(
    payload: VerifyPasswordPayload,
    current_user: User = Depends(get_current_user),
):
    if not current_user.password_hash or not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    return {"message": "Password verified"}
