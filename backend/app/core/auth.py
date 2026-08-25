from uuid import UUID
from fastapi import Depends, HTTPException, Request, status
import jwt as pyjwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_token(token, settings.JWT_SECRET_KEY)
        if payload.get("type") != "access":
            raise ValueError("wrong type")
        user_id: str = payload["sub"]
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
