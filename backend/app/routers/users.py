import asyncio
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.config import settings
from app.core.auth import get_current_user
from app.core.limiter import limiter
from app.models.user import User
from app.schemas.user import UserResponse, UserCreate
from supabase import create_client

router = APIRouter()

_supabase_client = None

def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _supabase_client


@router.get("/", response_model=list[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(User).order_by(User.email))
    return result.scalars().all()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def create_user(request: Request, payload: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == payload.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Create user in Supabase Auth (blocking HTTP — run off event loop)
    supabase = get_supabase()
    try:
        auth_response = await asyncio.to_thread(
            supabase.auth.admin.create_user,
            {
                "email": payload.email,
                "password": payload.password,
                "email_confirm": True,
                "user_metadata": {"name": payload.name or payload.email.split("@")[0]}
            }
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Registration failed")

    auth_user = auth_response.user
    if not auth_user:
        raise HTTPException(status_code=400, detail="Failed to create user")

    # Upsert into our users table (in case trigger already fired)
    result = await db.execute(select(User).where(User.id == auth_user.id))
    existing_by_id = result.scalar_one_or_none()

    if existing_by_id:
        # Trigger already created the record, just update name
        existing_by_id.name = payload.name or payload.email.split("@")[0]
        await db.commit()
        await db.refresh(existing_by_id)
        return existing_by_id

    user = User(
        id=auth_user.id,
        email=payload.email,
        name=payload.name or payload.email.split("@")[0]
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user