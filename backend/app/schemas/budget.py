from pydantic import BaseModel, model_validator
from typing import Optional, List
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal


# ─── Expense Tag ────────────────────────────────────────────────
class ExpenseTagBase(BaseModel):
    name: str
    color: Optional[str] = None

class ExpenseTagCreate(ExpenseTagBase):
    pass

class ExpenseTagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

class ExpenseTagResponse(ExpenseTagBase):
    id: UUID
    household_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Expense Group ───────────────────────────────────────────────
class ExpenseGroupBase(BaseModel):
    name: str
    owner_id: Optional[UUID] = None  # null = household group

class ExpenseGroupCreate(BaseModel):
    name: str
    personal: bool = False  # True = owned by current_user; resolved to owner_id in the route

class ExpenseGroupUpdate(BaseModel):
    name: Optional[str] = None

class ExpenseGroupResponse(ExpenseGroupBase):
    id: UUID
    household_id: UUID
    is_deleted: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ─── Expense ─────────────────────────────────────────────────────
class ExpenseCreate(BaseModel):
    personal: bool = False  # True = owned by current_user; resolved to owner_id in the route
    group_id: Optional[UUID] = None
    account_id: Optional[UUID] = None
    name: str
    amount: Decimal
    frequency: str  # daily, weekly, monthly, annual
    ownership_type: str = "joint"  # husband, wife, joint
    joint_split_husband: Optional[Decimal] = None  # e.g. 60.00
    joint_split_wife: Optional[Decimal] = None     # e.g. 40.00
    tag_ids: Optional[List[UUID]] = []

    @model_validator(mode="after")
    def validate_joint_splits(self):
        if self.ownership_type == "joint":
            if self.joint_split_husband is None or self.joint_split_wife is None:
                raise ValueError("joint_split_husband and joint_split_wife are required for joint expenses")
            total = self.joint_split_husband + self.joint_split_wife
            if abs(total - Decimal("100.00")) > Decimal("0.01"):
                raise ValueError("joint_split_husband and joint_split_wife must add up to 100")
        return self

class ExpenseUpdate(BaseModel):
    group_id: Optional[UUID] = None
    account_id: Optional[UUID] = None
    name: Optional[str] = None
    amount: Optional[Decimal] = None
    frequency: Optional[str] = None
    ownership_type: Optional[str] = None
    joint_split_husband: Optional[Decimal] = None
    joint_split_wife: Optional[Decimal] = None
    tag_ids: Optional[List[UUID]] = None

class ExpenseTagAssignmentResponse(BaseModel):
    id: UUID
    tag: ExpenseTagResponse

    class Config:
        from_attributes = True

class ExpenseResponse(BaseModel):
    id: UUID
    household_id: UUID
    owner_id: Optional[UUID]
    group_id: Optional[UUID]
    account_id: Optional[UUID]
    name: str
    amount: Decimal
    frequency: str
    monthly_amount: Decimal
    ownership_type: str
    joint_split_husband: Optional[Decimal]
    joint_split_wife: Optional[Decimal]
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    tag_assignments: List[ExpenseTagAssignmentResponse] = []

    class Config:
        from_attributes = True


# ─── Budget Template ─────────────────────────────────────────────
class BudgetTemplateItemCreate(BaseModel):
    expense_id: UUID
    allocated_amount: Decimal
    notes: Optional[str] = None

class BudgetTemplateItemUpdate(BaseModel):
    allocated_amount: Optional[Decimal] = None
    notes: Optional[str] = None

class BudgetTemplateItemResponse(BaseModel):
    id: UUID
    template_id: UUID
    expense_id: UUID
    allocated_amount: Decimal
    notes: Optional[str]
    expense: ExpenseResponse
    created_at: datetime

    class Config:
        from_attributes = True

class BudgetTemplateCreate(BaseModel):
    name: str
    net_monthly_income: Decimal
    items: Optional[List[BudgetTemplateItemCreate]] = []

class BudgetTemplateUpdate(BaseModel):
    name: Optional[str] = None
    net_monthly_income: Optional[Decimal] = None
    is_active: Optional[bool] = None

class BudgetTemplateResponse(BaseModel):
    id: UUID
    household_id: UUID
    user_id: UUID
    name: str
    net_monthly_income: Decimal
    is_active: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    items: List[BudgetTemplateItemResponse] = []

    class Config:
        from_attributes = True

# Summary response without items (for list views)
class BudgetTemplateSummaryResponse(BaseModel):
    id: UUID
    household_id: UUID
    user_id: UUID
    name: str
    net_monthly_income: Decimal
    is_active: bool
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    total_allocated: Optional[Decimal] = None
    unallocated_balance: Optional[Decimal] = None

    class Config:
        from_attributes = True


# ─── Budget Session ───────────────────────────────────────────────
class BudgetSessionCreate(BaseModel):
    month: date  # frontend sends first day of month e.g. 2026-06-01

class BudgetSessionUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None  # draft, active, closed

class BudgetSessionItemUpdate(BaseModel):
    status: str              # todo, paid, reserved, na
    notes: Optional[str] = None
    reference_number: Optional[str] = None

class AdHocSessionItemCreate(BaseModel):
    name: str
    amount: Decimal          # stored directly as allocated_amount

class BudgetSessionItemResponse(BaseModel):
    id: UUID
    session_id: UUID
    expense_id: Optional[UUID] = None
    ad_hoc_name: Optional[str] = None
    ad_hoc_amount: Optional[Decimal] = None
    allocated_amount: Decimal
    status: str
    notes: Optional[str] = None
    reference_number: Optional[str] = None
    expense: Optional[ExpenseResponse] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class BudgetSessionResponse(BaseModel):
    id: UUID
    household_id: UUID
    user_id: UUID
    budget_template_id: Optional[UUID] = None
    month: date
    name: str
    status: str
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    items: List[BudgetSessionItemResponse] = []
    total_allocated: Optional[Decimal] = None
    total_paid: Optional[Decimal] = None
    total_remaining: Optional[Decimal] = None

    class Config:
        from_attributes = True

class BudgetSessionSummaryResponse(BaseModel):
    id: UUID
    household_id: UUID
    user_id: UUID
    budget_template_id: Optional[UUID] = None
    month: date
    name: str
    status: str
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    total_allocated: Optional[Decimal] = None
    total_paid: Optional[Decimal] = None
    total_remaining: Optional[Decimal] = None

    class Config:
        from_attributes = True