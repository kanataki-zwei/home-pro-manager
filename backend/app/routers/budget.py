from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import List, Optional
from uuid import UUID
from decimal import Decimal

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.budget import (
    ExpenseGroup, ExpenseTag, ExpenseTagAssignment, Expense,
    BudgetTemplate, BudgetTemplateItem, BudgetSession, BudgetSessionItem
)
from app.models.household import HouseholdMember
from app.schemas.budget import (
    ExpenseGroupCreate, ExpenseGroupUpdate, ExpenseGroupResponse,
    ExpenseTagCreate, ExpenseTagUpdate, ExpenseTagResponse,
    ExpenseCreate, ExpenseUpdate, ExpenseResponse,
    BudgetTemplateCreate, BudgetTemplateUpdate, BudgetTemplateResponse, BudgetTemplateSummaryResponse,
    BudgetTemplateItemCreate, BudgetTemplateItemUpdate, BudgetTemplateItemResponse,
    BudgetSessionCreate, BudgetSessionUpdate, BudgetSessionResponse, BudgetSessionSummaryResponse,
    BudgetSessionItemUpdate, BudgetSessionItemResponse
)

router = APIRouter(prefix="/households/{household_id}/budget", tags=["Budget"])


# ─── Helpers ─────────────────────────────────────────────────────

def compute_monthly_amount(amount: Decimal, frequency: str) -> Decimal:
    multipliers = {
        "daily": Decimal("30.4375"),
        "weekly": Decimal("4.34524"),
        "monthly": Decimal("1"),
        "annual": Decimal("1") / Decimal("12"),
    }
    return round(amount * multipliers[frequency], 2)


# ─── Expense Tags ─────────────────────────────────────────────────

@router.get("/tags", response_model=List[ExpenseTagResponse])
async def list_tags(
    household_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(ExpenseTag).where(
            ExpenseTag.household_id == household_id,
            ExpenseTag.is_deleted == False
        )
    )
    return result.scalars().all()


@router.post("/tags", response_model=ExpenseTagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    household_id: UUID,
    payload: ExpenseTagCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tag = ExpenseTag(household_id=household_id, **payload.model_dump())
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.patch("/tags/{tag_id}", response_model=ExpenseTagResponse)
async def update_tag(
    household_id: UUID,
    tag_id: UUID,
    payload: ExpenseTagUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(ExpenseTag).where(
            ExpenseTag.id == tag_id,
            ExpenseTag.household_id == household_id,
            ExpenseTag.is_deleted == False
        )
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    household_id: UUID,
    tag_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(ExpenseTag).where(
            ExpenseTag.id == tag_id,
            ExpenseTag.household_id == household_id
        )
    )
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    tag.is_deleted = True
    await db.commit()


# ─── Expense Groups ───────────────────────────────────────────────

@router.get("/groups", response_model=List[ExpenseGroupResponse])
async def list_groups(
    household_id: UUID,
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(ExpenseGroup).where(ExpenseGroup.household_id == household_id)
    if not include_deleted:
        query = query.where(ExpenseGroup.is_deleted == False)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/groups", response_model=ExpenseGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_group(
    household_id: UUID,
    payload: ExpenseGroupCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    owner_id = current_user.id if payload.personal else None
    group = ExpenseGroup(household_id=household_id, name=payload.name, owner_id=owner_id)
    db.add(group)
    await db.flush()
    await db.refresh(group)
    return group


@router.patch("/groups/{group_id}", response_model=ExpenseGroupResponse)
async def update_group(
    household_id: UUID,
    group_id: UUID,
    payload: ExpenseGroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(ExpenseGroup).where(
            ExpenseGroup.id == group_id,
            ExpenseGroup.household_id == household_id,
            ExpenseGroup.is_deleted == False
        )
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(group, key, value)
    await db.commit()
    await db.refresh(group)
    return group


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    household_id: UUID,
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(ExpenseGroup).where(
            ExpenseGroup.id == group_id,
            ExpenseGroup.household_id == household_id
        )
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    group.is_deleted = True
    await db.commit()


@router.patch("/groups/{group_id}/restore", response_model=ExpenseGroupResponse)
async def restore_group(
    household_id: UUID,
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(ExpenseGroup).where(
            ExpenseGroup.id == group_id,
            ExpenseGroup.household_id == household_id
        )
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    group.is_deleted = False
    await db.commit()
    await db.refresh(group)
    return group


# ─── Expenses ─────────────────────────────────────────────────────

@router.get("/expenses", response_model=List[ExpenseResponse])
async def list_expenses(
    household_id: UUID,
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Expense).options(
        selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag)
    ).where(Expense.household_id == household_id)
    if not include_deleted:
        query = query.where(Expense.is_deleted == False)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    household_id: UUID,
    payload: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    data = payload.model_dump(exclude={"tag_ids", "personal"})
    data["owner_id"] = current_user.id if payload.personal else None
    data["monthly_amount"] = compute_monthly_amount(data["amount"], data["frequency"])

    expense = Expense(household_id=household_id, **data)
    db.add(expense)
    await db.flush()

    for tag_id in (payload.tag_ids or []):
        db.add(ExpenseTagAssignment(expense_id=expense.id, tag_id=tag_id))

    await db.commit()

    result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(Expense.id == expense.id)
    )
    return result.scalar_one()


@router.get("/expenses/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    household_id: UUID,
    expense_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(Expense.id == expense_id, Expense.household_id == household_id, Expense.is_deleted == False)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.patch("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    household_id: UUID,
    expense_id: UUID,
    payload: ExpenseUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.household_id == household_id,
            Expense.is_deleted == False
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    data = payload.model_dump(exclude_unset=True, exclude={"tag_ids"})
    new_amount = data.get("amount", expense.amount)
    new_frequency = data.get("frequency", expense.frequency)
    data["monthly_amount"] = compute_monthly_amount(new_amount, new_frequency)

    for key, value in data.items():
        setattr(expense, key, value)

    if payload.tag_ids is not None:
        await db.execute(
            delete(ExpenseTagAssignment).where(ExpenseTagAssignment.expense_id == expense_id)
        )
        for tag_id in payload.tag_ids:
            db.add(ExpenseTagAssignment(expense_id=expense_id, tag_id=tag_id))

    await db.commit()

    result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(Expense.id == expense_id)
    )
    return result.scalar_one()


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    household_id: UUID,
    expense_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.household_id == household_id)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    expense.is_deleted = True
    await db.commit()


@router.patch("/expenses/{expense_id}/restore", response_model=ExpenseResponse)
async def restore_expense(
    household_id: UUID,
    expense_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.household_id == household_id)
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    expense.is_deleted = False
    await db.commit()
    result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(Expense.id == expense_id)
    )
    return result.scalar_one()


# ─── Budget Templates ─────────────────────────────────────────────

@router.get("/templates", response_model=List[BudgetTemplateSummaryResponse])
async def list_templates(
    household_id: UUID,
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(BudgetTemplate).options(
        selectinload(BudgetTemplate.items)
    ).where(
        BudgetTemplate.household_id == household_id,
        BudgetTemplate.user_id == current_user.id
    )
    if not include_deleted:
        query = query.where(BudgetTemplate.is_deleted == False)
    result = await db.execute(query)
    templates = result.scalars().all()

    out = []
    for t in templates:
        total = sum(i.allocated_amount for i in t.items)
        out.append(BudgetTemplateSummaryResponse(
            id=t.id, household_id=t.household_id, user_id=t.user_id,
            name=t.name, net_monthly_income=t.net_monthly_income,
            is_active=t.is_active, is_deleted=t.is_deleted,
            created_at=t.created_at, updated_at=t.updated_at,
            total_allocated=total,
            unallocated_balance=t.net_monthly_income - total
        ))
    return out


@router.post("/templates", response_model=BudgetTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    household_id: UUID,
    payload: BudgetTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    template = BudgetTemplate(
        household_id=household_id,
        user_id=current_user.id,
        name=payload.name,
        net_monthly_income=payload.net_monthly_income
    )
    db.add(template)
    await db.flush()

    for item in (payload.items or []):
        db.add(BudgetTemplateItem(template_id=template.id, **item.model_dump()))

    await db.commit()

    result = await db.execute(
        select(BudgetTemplate)
        .options(selectinload(BudgetTemplate.items).selectinload(BudgetTemplateItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(BudgetTemplate.id == template.id)
    )
    return result.scalar_one()


@router.get("/templates/{template_id}", response_model=BudgetTemplateResponse)
async def get_template(
    household_id: UUID,
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetTemplate)
        .options(selectinload(BudgetTemplate.items).selectinload(BudgetTemplateItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(
            BudgetTemplate.id == template_id,
            BudgetTemplate.household_id == household_id,
            BudgetTemplate.user_id == current_user.id,
            BudgetTemplate.is_deleted == False
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.patch("/templates/{template_id}", response_model=BudgetTemplateResponse)
async def update_template(
    household_id: UUID,
    template_id: UUID,
    payload: BudgetTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetTemplate).where(
            BudgetTemplate.id == template_id,
            BudgetTemplate.household_id == household_id,
            BudgetTemplate.user_id == current_user.id,
            BudgetTemplate.is_deleted == False
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(template, key, value)
    await db.commit()
    result = await db.execute(
        select(BudgetTemplate)
        .options(selectinload(BudgetTemplate.items).selectinload(BudgetTemplateItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(BudgetTemplate.id == template_id)
    )
    return result.scalar_one()


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    household_id: UUID,
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetTemplate).where(
            BudgetTemplate.id == template_id,
            BudgetTemplate.household_id == household_id
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template.is_deleted = True
    await db.commit()


@router.patch("/templates/{template_id}/restore", response_model=BudgetTemplateResponse)
async def restore_template(
    household_id: UUID,
    template_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetTemplate).where(
            BudgetTemplate.id == template_id,
            BudgetTemplate.household_id == household_id
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template.is_deleted = False
    await db.commit()
    result = await db.execute(
        select(BudgetTemplate)
        .options(selectinload(BudgetTemplate.items).selectinload(BudgetTemplateItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(BudgetTemplate.id == template_id)
    )
    return result.scalar_one()


# ─── Template Items ───────────────────────────────────────────────

@router.post("/templates/{template_id}/items", response_model=BudgetTemplateItemResponse, status_code=status.HTTP_201_CREATED)
async def add_template_item(
    household_id: UUID,
    template_id: UUID,
    payload: BudgetTemplateItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetTemplate).where(
            BudgetTemplate.id == template_id,
            BudgetTemplate.household_id == household_id,
            BudgetTemplate.is_deleted == False
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Template not found")

    item = BudgetTemplateItem(template_id=template_id, **payload.model_dump())
    db.add(item)
    await db.commit()

    result = await db.execute(
        select(BudgetTemplateItem)
        .options(selectinload(BudgetTemplateItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(BudgetTemplateItem.id == item.id)
    )
    return result.scalar_one()


@router.patch("/templates/{template_id}/items/{item_id}", response_model=BudgetTemplateItemResponse)
async def update_template_item(
    household_id: UUID,
    template_id: UUID,
    item_id: UUID,
    payload: BudgetTemplateItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetTemplateItem).where(
            BudgetTemplateItem.id == item_id,
            BudgetTemplateItem.template_id == template_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    await db.commit()
    result = await db.execute(
        select(BudgetTemplateItem)
        .options(selectinload(BudgetTemplateItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(BudgetTemplateItem.id == item_id)
    )
    return result.scalar_one()


@router.delete("/templates/{template_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template_item(
    household_id: UUID,
    template_id: UUID,
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetTemplateItem).where(
            BudgetTemplateItem.id == item_id,
            BudgetTemplateItem.template_id == template_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(item)
    await db.commit()


# ─── Budget Sessions ──────────────────────────────────────────────

@router.get("/sessions", response_model=List[BudgetSessionSummaryResponse])
async def list_sessions(
    household_id: UUID,
    include_deleted: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(BudgetSession).options(
        selectinload(BudgetSession.items)
    ).where(
        BudgetSession.household_id == household_id,
        BudgetSession.user_id == current_user.id
    )
    if not include_deleted:
        query = query.where(BudgetSession.is_deleted == False)
    query = query.order_by(BudgetSession.month.desc())
    result = await db.execute(query)
    sessions = result.scalars().all()

    out = []
    for s in sessions:
        total_allocated = sum(i.allocated_amount for i in s.items)
        total_paid = sum(
            i.allocated_amount for i in s.items if i.status == "paid"
        )
        out.append(BudgetSessionSummaryResponse(
            id=s.id, household_id=s.household_id, user_id=s.user_id,
            month=s.month, name=s.name, status=s.status, is_deleted=s.is_deleted,
            created_at=s.created_at, updated_at=s.updated_at,
            total_allocated=total_allocated,
            total_paid=total_paid,
            total_remaining=total_allocated - total_paid
        ))
    return out


@router.post("/sessions", response_model=BudgetSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    household_id: UUID,
    payload: BudgetSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    month_start = payload.month.replace(day=1)

    existing = await db.execute(
        select(BudgetSession).where(
            BudgetSession.household_id == household_id,
            BudgetSession.user_id == current_user.id,
            BudgetSession.month == month_start,
            BudgetSession.is_deleted == False
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A session already exists for this month")

    # Determine the calling user's household role (e.g. "husband", "wife")
    member_result = await db.execute(
        select(HouseholdMember)
        .options(selectinload(HouseholdMember.member_type))
        .where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == current_user.id,
            HouseholdMember.is_active == True
        )
    )
    member = member_result.scalar_one_or_none()
    role = member.member_type.name.lower() if member else None

    # Fetch all active household expenses
    expense_result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(Expense.household_id == household_id, Expense.is_deleted == False)
    )
    all_expenses = expense_result.scalars().all()

    # Include personal expenses owned by this user, and household expenses
    # where ownership_type matches the user's role or is joint
    relevant = [
        exp for exp in all_expenses
        if exp.owner_id == current_user.id
        or (exp.owner_id is None and (exp.ownership_type == role or exp.ownership_type == "joint"))
    ]

    name = month_start.strftime("%B %Y")  # e.g. "June 2026"

    session = BudgetSession(
        household_id=household_id,
        user_id=current_user.id,
        month=month_start,
        name=name,
        status="draft"
    )
    db.add(session)
    await db.flush()

    for exp in relevant:
        db.add(BudgetSessionItem(
            session_id=session.id,
            expense_id=exp.id,
            allocated_amount=exp.monthly_amount,
            amount_paid=Decimal("0.00"),
            status="todo"
        ))

    await db.commit()

    result = await db.execute(
        select(BudgetSession)
        .options(selectinload(BudgetSession.items).selectinload(BudgetSessionItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(BudgetSession.id == session.id)
    )
    return result.scalar_one()


@router.get("/sessions/{session_id}", response_model=BudgetSessionResponse)
async def get_session(
    household_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetSession)
        .options(selectinload(BudgetSession.items).selectinload(BudgetSessionItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(
            BudgetSession.id == session_id,
            BudgetSession.household_id == household_id,
            BudgetSession.user_id == current_user.id,
            BudgetSession.is_deleted == False
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/sessions/{session_id}", response_model=BudgetSessionResponse)
async def update_session(
    household_id: UUID,
    session_id: UUID,
    payload: BudgetSessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetSession).where(
            BudgetSession.id == session_id,
            BudgetSession.household_id == household_id,
            BudgetSession.user_id == current_user.id,
            BudgetSession.is_deleted == False
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, key, value)
    await db.commit()
    result = await db.execute(
        select(BudgetSession)
        .options(selectinload(BudgetSession.items).selectinload(BudgetSessionItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(BudgetSession.id == session_id)
    )
    return result.scalar_one()


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    household_id: UUID,
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetSession).where(
            BudgetSession.id == session_id,
            BudgetSession.household_id == household_id
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.is_deleted = True
    await db.commit()


# ─── Session Items ────────────────────────────────────────────────

@router.patch("/sessions/{session_id}/items/{item_id}", response_model=BudgetSessionItemResponse)
async def update_session_item(
    household_id: UUID,
    session_id: UUID,
    item_id: UUID,
    payload: BudgetSessionItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetSessionItem).where(
            BudgetSessionItem.id == item_id,
            BudgetSessionItem.session_id == session_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Session item not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)

    await db.commit()

    result = await db.execute(
        select(BudgetSessionItem)
        .options(selectinload(BudgetSessionItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(BudgetSessionItem.id == item_id)
    )
    return result.scalar_one()
