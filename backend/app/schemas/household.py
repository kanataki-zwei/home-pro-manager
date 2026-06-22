from pydantic import BaseModel, Field
from typing import Optional, Literal
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal


# ─── Member Type ────────────────────────────────────────────────
class MemberTypeBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)

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
    name: str = Field(min_length=1, max_length=255)

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
    name: str = Field(min_length=1, max_length=255)
    date_of_birth: Optional[date] = None
    user_id: Optional[UUID] = None

class HouseholdMemberUpdate(BaseModel):
    member_type_id: Optional[UUID] = None
    name: Optional[str] = Field(default=None, max_length=255)
    date_of_birth: Optional[date] = None
    is_active: Optional[bool] = None
    user_id: Optional[UUID] = None
    contributes_income: Optional[bool] = None
    income_amount: Optional[Decimal] = None
    income_currency: Optional[str] = Field(default=None, max_length=10)
    income_cadence: Optional[Literal["weekly", "monthly", "annually"]] = None

class HouseholdMemberResponse(BaseModel):
    id: UUID
    household_id: UUID
    member_type_id: UUID
    user_id: Optional[UUID]
    name: str
    date_of_birth: Optional[date]
    is_active: bool
    contributes_income: bool
    income_amount: Optional[Decimal]
    income_currency: Optional[str]
    income_cadence: Optional[str]
    created_at: datetime
    member_type: MemberTypeResponse

    class Config:
        from_attributes = True


# ─── Account ────────────────────────────────────────────────────
_ACCOUNT_TYPES = Literal["checking", "savings", "cash", "investment", "credit"]
_INSTITUTION_TYPES = Literal["bank", "money_market", "mobile_money", "direct_pay", "insurance", "govt_securities", "stocks_shares"]
_OWNERSHIP_TYPES = Literal["joint", "individual"]

class AccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    account_type: _ACCOUNT_TYPES
    institution_type: Optional[_INSTITUTION_TYPES] = None
    ownership: _OWNERSHIP_TYPES
    household_member_id: Optional[UUID] = None
    current_balance: float = 0.00
    currency: str = Field(default="KES", max_length=10)
    contributes_to_net_worth: bool = True

class AccountUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    account_type: Optional[_ACCOUNT_TYPES] = None
    institution_type: Optional[_INSTITUTION_TYPES] = None
    ownership: Optional[_OWNERSHIP_TYPES] = None
    household_member_id: Optional[UUID] = None
    current_balance: Optional[float] = None
    currency: Optional[str] = Field(default=None, max_length=10)
    is_active: Optional[bool] = None
    contributes_to_net_worth: Optional[bool] = None

class AccountResponse(BaseModel):
    id: UUID
    household_id: UUID
    household_member_id: Optional[UUID]
    name: str
    account_type: str
    institution_type: Optional[str]
    ownership: str
    current_balance: float
    currency: str
    is_active: bool
    contributes_to_net_worth: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Account Transactions ────────────────────────────────────────
class AccountTransactionCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    narration: str = Field(min_length=1, max_length=500)
    transaction_type: Literal["credit", "debit"]

class AccountTransactionResponse(BaseModel):
    id: UUID
    account_id: UUID
    household_id: UUID
    amount: Decimal
    narration: str
    transaction_type: str
    session_item_id: Optional[UUID]
    created_at: datetime

    class Config:
        from_attributes = True