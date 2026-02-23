from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date, datetime


# ─── Member Type ────────────────────────────────────────────────
class MemberTypeBase(BaseModel):
    name: str

class MemberTypeCreate(MemberTypeBase):
    pass

class MemberTypeResponse(MemberTypeBase):
    id: UUID
    household_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Household ──────────────────────────────────────────────────
class HouseholdCreate(BaseModel):
    name: str

class HouseholdResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    updated_at: datetime
    member_types: list[MemberTypeResponse] = []

    class Config:
        from_attributes = True


# ─── Household Member ───────────────────────────────────────────
class HouseholdMemberCreate(BaseModel):
    member_type_id: UUID
    name: str
    date_of_birth: Optional[date] = None
    user_id: Optional[UUID] = None

class HouseholdMemberUpdate(BaseModel):
    member_type_id: Optional[UUID] = None
    name: Optional[str] = None
    date_of_birth: Optional[date] = None
    is_active: Optional[bool] = None
    user_id: Optional[UUID] = None

class HouseholdMemberResponse(BaseModel):
    id: UUID
    household_id: UUID
    member_type_id: UUID
    user_id: Optional[UUID]
    name: str
    date_of_birth: Optional[date]
    is_active: bool
    created_at: datetime
    member_type: MemberTypeResponse

    class Config:
        from_attributes = True


# ─── Account ────────────────────────────────────────────────────
class AccountCreate(BaseModel):
    name: str
    account_type: str
    ownership: str
    household_member_id: Optional[UUID] = None
    current_balance: float = 0.00
    currency: str = "KES"

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[str] = None
    ownership: Optional[str] = None
    household_member_id: Optional[UUID] = None
    current_balance: Optional[float] = None
    is_active: Optional[bool] = None

class AccountResponse(BaseModel):
    id: UUID
    household_id: UUID
    household_member_id: Optional[UUID]
    name: str
    account_type: str
    ownership: str
    current_balance: float
    currency: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True