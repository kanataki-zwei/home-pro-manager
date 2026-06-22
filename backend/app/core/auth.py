import asyncio
from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt as pyjwt
from jwt import PyJWKClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

bearer_scheme = HTTPBearer()

_jwks_client = PyJWKClient(f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json", cache_keys=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    token = credentials.credentials

    try:
        loop = asyncio.get_event_loop()
        signing_key = await loop.run_in_executor(None, lambda: _jwks_client.get_signing_key_from_jwt(token))
        payload = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            options={"verify_aud": False},
            leeway=5
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


async def require_household_member(
    household_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    from app.models.household import Household, HouseholdMember

    member_result = await db.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == current_user.id,
            HouseholdMember.is_active == True,
        )
    )
    if member_result.scalar_one_or_none():
        return current_user

    # Allow access if the user created the household (before being added as a member)
    household_result = await db.execute(
        select(Household).where(
            Household.id == household_id,
            Household.created_by == current_user.id,
        )
    )
    if household_result.scalar_one_or_none():
        return current_user

    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
