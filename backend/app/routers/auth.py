import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

import jwt as pyjwt
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    base64url_to_bytes,
    options_to_json,
)
from webauthn.helpers import bytes_to_base64url
from webauthn.helpers.structs import (
    PublicKeyCredentialDescriptor,
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    RegistrationCredential,
    AuthenticatorAttestationResponse,
    AuthenticationCredential,
    AuthenticatorAssertionResponse,
)

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token
from app.models.user import User
from app.models.trusted_device import TrustedDevice, parse_device_label
from app.models.webauthn import WebAuthnCredential


def _webauthn_rp_id() -> str:
    return urlparse(settings.FRONTEND_URL).hostname or "localhost"


def _webauthn_origin() -> str:
    return settings.FRONTEND_URL


def _create_challenge_token(challenge_b64url: str, secret: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=5)
    return pyjwt.encode(
        {"type": "webauthn_challenge", "ch": challenge_b64url, "exp": exp},
        secret,
        algorithm="HS256",
    )


def _decode_challenge_token(token: str, secret: str) -> str:
    payload = pyjwt.decode(token, secret, algorithms=["HS256"])
    if payload.get("type") != "webauthn_challenge":
        raise ValueError("wrong token type")
    return payload["ch"]


def create_reauth_token(user_id: str, secret: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=2)
    return pyjwt.encode(
        {"type": "reauth", "sub": user_id, "exp": exp},
        secret,
        algorithm="HS256",
    )


def verify_reauth_token(token: str, expected_user_id: str, secret: str) -> None:
    """Raises HTTPException if the token is invalid, expired, or for a different user."""
    try:
        payload = pyjwt.decode(token, secret, algorithms=["HS256"])
        if payload.get("type") != "reauth":
            raise ValueError("wrong type")
        if payload.get("sub") != expected_user_id:
            raise ValueError("wrong user")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Re-authentication required or expired",
        )

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


# ── WebAuthn ──────────────────────────────────────────────────────────────────

class WebAuthnRegisterCompletePayload(BaseModel):
    challenge_token: str
    credential: dict[str, Any]


class WebAuthnLoginBeginPayload(BaseModel):
    email: str


class WebAuthnLoginCompletePayload(BaseModel):
    challenge_token: str
    credential: dict[str, Any]


@router.post("/webauthn/register/begin")
async def webauthn_register_begin(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.user_id == current_user.id)
    )).scalars().all()

    exclude = [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
        for c in existing
    ]

    user_id_bytes = current_user.id.bytes if hasattr(current_user.id, 'bytes') else uuid.UUID(str(current_user.id)).bytes

    opts = generate_registration_options(
        rp_id=_webauthn_rp_id(),
        rp_name="HomePro Manager",
        user_id=user_id_bytes,
        user_name=current_user.email,
        user_display_name=current_user.name or current_user.email,
        exclude_credentials=exclude,
        authenticator_selection=AuthenticatorSelectionCriteria(
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )

    challenge_token = _create_challenge_token(bytes_to_base64url(opts.challenge), settings.JWT_SECRET_KEY)
    return {"options": json.loads(options_to_json(opts)), "challenge_token": challenge_token}


@router.post("/webauthn/register/complete")
async def webauthn_register_complete(
    request: Request,
    payload: WebAuthnRegisterCompletePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        expected_challenge_b64 = _decode_challenge_token(payload.challenge_token, settings.JWT_SECRET_KEY)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired challenge")

    cred_data = payload.credential
    try:
        credential = RegistrationCredential(
            id=cred_data["id"],
            raw_id=base64url_to_bytes(cred_data["rawId"]),
            response=AuthenticatorAttestationResponse(
                client_data_json=base64url_to_bytes(cred_data["response"]["clientDataJSON"]),
                attestation_object=base64url_to_bytes(cred_data["response"]["attestationObject"]),
            ),
            type=cred_data.get("type", "public-key"),
        )
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(expected_challenge_b64),
            expected_rp_id=_webauthn_rp_id(),
            expected_origin=_webauthn_origin(),
        )
    except Exception as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Registration verification failed: {e}")

    device_id = request.cookies.get("device_id")
    new_cred = WebAuthnCredential(
        user_id=current_user.id,
        credential_id=bytes_to_base64url(verification.credential_id),
        public_key=bytes_to_base64url(verification.credential_public_key),
        sign_count=verification.sign_count,
        device_id=device_id,
    )
    db.add(new_cred)
    await db.commit()
    return {"message": "Biometric registered", "credential_id": bytes_to_base64url(verification.credential_id)}


@router.post("/webauthn/login/begin")
@limiter.limit("10/minute")
async def webauthn_login_begin(
    request: Request,
    payload: WebAuthnLoginBeginPayload,
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No biometric registered for this account")

    creds = (await db.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.user_id == user.id)
    )).scalars().all()
    if not creds:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No biometric registered for this account")

    allow = [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id))
        for c in creds
    ]

    opts = generate_authentication_options(
        rp_id=_webauthn_rp_id(),
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.REQUIRED,
    )

    challenge_token = _create_challenge_token(bytes_to_base64url(opts.challenge), settings.JWT_SECRET_KEY)
    return {"options": json.loads(options_to_json(opts)), "challenge_token": challenge_token}


@router.post("/webauthn/login/complete")
async def webauthn_login_complete(
    request: Request,
    payload: WebAuthnLoginCompletePayload,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    try:
        expected_challenge_b64 = _decode_challenge_token(payload.challenge_token, settings.JWT_SECRET_KEY)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired challenge")

    credential_id_str = payload.credential.get("id", "")
    cred = (await db.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id_str)
    )).scalar_one_or_none()
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown credential")

    cred_data = payload.credential
    try:
        user_handle = cred_data["response"].get("userHandle")
        credential = AuthenticationCredential(
            id=cred_data["id"],
            raw_id=base64url_to_bytes(cred_data["rawId"]),
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(cred_data["response"]["clientDataJSON"]),
                authenticator_data=base64url_to_bytes(cred_data["response"]["authenticatorData"]),
                signature=base64url_to_bytes(cred_data["response"]["signature"]),
                user_handle=base64url_to_bytes(user_handle) if user_handle else None,
            ),
            type=cred_data.get("type", "public-key"),
        )
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(expected_challenge_b64),
            expected_rp_id=_webauthn_rp_id(),
            expected_origin=_webauthn_origin(),
            credential_public_key=base64url_to_bytes(cred.public_key),
            credential_current_sign_count=cred.sign_count,
        )
    except Exception as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Authentication failed: {e}")

    cred.sign_count = verification.new_sign_count

    user = (await db.execute(select(User).where(User.id == cred.user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

    # Device trust — same logic as password login
    device_id = request.cookies.get("device_id") or str(uuid.uuid4())
    ua = request.headers.get("user-agent", "")
    ip = (request.client.host if request.client else "") or ""

    td_result = await db.execute(
        select(TrustedDevice).where(
            TrustedDevice.user_id == user.id,
            TrustedDevice.device_id == device_id,
        )
    )
    device = td_result.scalar_one_or_none()

    if device is None:
        approved_check = await db.execute(
            select(TrustedDevice).where(
                TrustedDevice.user_id == user.id,
                TrustedDevice.status == "approved",
            ).limit(1)
        )
        is_first = approved_check.scalar_one_or_none() is None
        device = TrustedDevice(
            user_id=user.id,
            device_id=device_id,
            label=parse_device_label(ua),
            user_agent=ua[:500] or None,
            ip_address=ip[:45] or None,
            status="approved" if is_first else "pending",
            reviewed_at=datetime.now(timezone.utc) if is_first else None,
            reviewed_by=user.id if is_first else None,
        )
        db.add(device)

    await db.commit()

    if device.status == "pending":
        resp = JSONResponse(status_code=403, content={"detail": "device_pending"})
        resp.set_cookie("device_id", device_id, **_DEVICE_COOKIE)
        return resp
    if device.status == "rejected":
        resp = JSONResponse(status_code=403, content={"detail": "device_rejected"})
        resp.set_cookie("device_id", device_id, **_DEVICE_COOKIE)
        return resp

    _set_auth_cookies(response, str(user.id))
    response.set_cookie("device_id", device_id, **_DEVICE_COOKIE)
    return {"id": str(user.id), "email": user.email, "name": user.name}


@router.get("/webauthn/credentials")
async def list_webauthn_credentials(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device_id = request.cookies.get("device_id")
    creds = (await db.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.user_id == current_user.id)
    )).scalars().all()
    return [
        {
            "id": str(c.id),
            "credential_id": c.credential_id,
            "device_id": c.device_id,
            "is_this_device": c.device_id == device_id,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in creds
    ]


@router.delete("/webauthn/credentials/{credential_id}")
async def delete_webauthn_credential(
    credential_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cred = (await db.execute(
        select(WebAuthnCredential).where(
            WebAuthnCredential.id == credential_id,
            WebAuthnCredential.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not cred:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Credential not found")
    await db.delete(cred)
    await db.commit()
    return {"message": "Credential removed"}


# ── Re-authentication (produces a short-lived reauth token) ──────────────────

@router.post("/reauth/password")
async def reauth_password(
    payload: VerifyPasswordPayload,
    current_user: User = Depends(get_current_user),
):
    if not current_user.password_hash or not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
    return {"reauth_token": create_reauth_token(str(current_user.id), settings.JWT_SECRET_KEY)}


@router.post("/webauthn/reauth/begin")
async def webauthn_reauth_begin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    creds = (await db.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.user_id == current_user.id)
    )).scalars().all()
    if not creds:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No biometric registered")

    allow = [PublicKeyCredentialDescriptor(id=base64url_to_bytes(c.credential_id)) for c in creds]
    opts = generate_authentication_options(
        rp_id=_webauthn_rp_id(),
        allow_credentials=allow,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    challenge_token = _create_challenge_token(bytes_to_base64url(opts.challenge), settings.JWT_SECRET_KEY)
    return {"options": json.loads(options_to_json(opts)), "challenge_token": challenge_token}


@router.post("/webauthn/reauth/complete")
async def webauthn_reauth_complete(
    payload: WebAuthnLoginCompletePayload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        expected_challenge_b64 = _decode_challenge_token(payload.challenge_token, settings.JWT_SECRET_KEY)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired challenge")

    credential_id_str = payload.credential.get("id", "")
    cred = (await db.execute(
        select(WebAuthnCredential).where(
            WebAuthnCredential.credential_id == credential_id_str,
            WebAuthnCredential.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if not cred:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown credential")

    cred_data = payload.credential
    try:
        user_handle = cred_data["response"].get("userHandle")
        credential = AuthenticationCredential(
            id=cred_data["id"],
            raw_id=base64url_to_bytes(cred_data["rawId"]),
            response=AuthenticatorAssertionResponse(
                client_data_json=base64url_to_bytes(cred_data["response"]["clientDataJSON"]),
                authenticator_data=base64url_to_bytes(cred_data["response"]["authenticatorData"]),
                signature=base64url_to_bytes(cred_data["response"]["signature"]),
                user_handle=base64url_to_bytes(user_handle) if user_handle else None,
            ),
            type=cred_data.get("type", "public-key"),
        )
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(expected_challenge_b64),
            expected_rp_id=_webauthn_rp_id(),
            expected_origin=_webauthn_origin(),
            credential_public_key=base64url_to_bytes(cred.public_key),
            credential_current_sign_count=cred.sign_count,
        )
    except Exception as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Biometric verification failed: {e}")

    cred.sign_count = verification.new_sign_count
    await db.commit()
    return {"reauth_token": create_reauth_token(str(current_user.id), settings.JWT_SECRET_KEY)}
