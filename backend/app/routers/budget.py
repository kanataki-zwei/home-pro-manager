from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, case as sa_case
from sqlalchemy.orm import selectinload
from typing import List, Optional
from uuid import UUID
from decimal import Decimal

from app.core.database import get_db
from app.core.auth import get_current_user, require_household_member
from app.models.user import User
from app.models.budget import (
    ExpenseGroup, ExpenseTag, ExpenseTagAssignment, Expense,
    BudgetTemplate, BudgetTemplateItem, BudgetSession, BudgetSessionItem,
    BudgetSessionExtraIncome
)
from app.models.household import HouseholdMember, Account, AccountTransaction, MemberIncomeHistory
from app.schemas.budget import (
    ExpenseGroupCreate, ExpenseGroupUpdate, ExpenseGroupResponse,
    ExpenseTagCreate, ExpenseTagUpdate, ExpenseTagResponse,
    ExpenseCreate, ExpenseUpdate, ExpenseResponse,
    BudgetTemplateCreate, BudgetTemplateUpdate, BudgetTemplateResponse, BudgetTemplateSummaryResponse,
    BudgetTemplateItemCreate, BudgetTemplateItemUpdate, BudgetTemplateItemResponse,
    BudgetSessionCreate, BudgetSessionUpdate, BudgetSessionResponse, BudgetSessionSummaryResponse,
    BudgetSessionItemUpdate, BudgetSessionItemResponse, AdHocSessionItemCreate,
    BudgetSessionExtraIncomeCreate, BudgetSessionExtraIncomeResponse,
    SessionMonthStats, BudgetStatsResponse,
    GroupTrend, SessionTrend, BudgetTrendResponse,
    VarianceItem, VarianceGroup, VarianceResponse,
)

router = APIRouter(
    prefix="/households/{household_id}/budget",
    tags=["Budget"],
    dependencies=[Depends(require_household_member)],
)


# ─── Helpers ─────────────────────────────────────────────────────

def compute_monthly_amount(amount: Decimal, frequency: str) -> Decimal:
    multipliers = {
        "daily": Decimal("30.4375"),
        "weekly": Decimal("4.34524"),
        "monthly": Decimal("1"),
        "annual": Decimal("1") / Decimal("12"),
        "annually": Decimal("1") / Decimal("12"),
        "weekly": Decimal("52") / Decimal("12"),
    }
    return round(amount * multipliers.get(frequency, Decimal("1")), 2)


async def get_household_income_as_of(db: AsyncSession, household_id: UUID, as_of_date) -> Decimal:
    """Return the total normalised monthly income for a household as of a given date.

    For each active contributing member, selects the most recent history row
    where effective_from <= as_of_date. Falls back to the member's current
    income fields if no history row exists for that date range.
    """
    from datetime import date as date_type
    from sqlalchemy import func as sa_func

    # Subquery: for each member, the latest effective_from that is <= as_of_date
    latest_sq = (
        select(
            MemberIncomeHistory.household_member_id,
            sa_func.max(MemberIncomeHistory.effective_from).label("max_date"),
        )
        .where(
            MemberIncomeHistory.household_id == household_id,
            MemberIncomeHistory.effective_from <= as_of_date,
        )
        .group_by(MemberIncomeHistory.household_member_id)
        .subquery()
    )

    rows = (await db.execute(
        select(
            MemberIncomeHistory.household_member_id,
            MemberIncomeHistory.income_amount,
            MemberIncomeHistory.income_cadence,
        )
        .join(latest_sq, (MemberIncomeHistory.household_member_id == latest_sq.c.household_member_id) &
              (MemberIncomeHistory.effective_from == latest_sq.c.max_date))
        .join(HouseholdMember, HouseholdMember.id == MemberIncomeHistory.household_member_id)
        .where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.contributes_income == True,
            HouseholdMember.is_active == True,
        )
    )).fetchall()

    total = Decimal("0")
    for row in rows:
        total += compute_monthly_amount(Decimal(str(row.income_amount)), row.income_cadence)
    return total


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
    # expire_on_commit=False means the session keeps stale in-memory objects;
    # expire explicitly so the re-fetch below gets fresh rows from the DB.
    await db.refresh(expense)

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


# ─── Budget Stats ─────────────────────────────────────────────────

@router.get("/stats", response_model=BudgetStatsResponse)
async def get_budget_stats(
    household_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import date as date_type

    # Total monthly income across all active contributing members
    income_q = await db.execute(
        select(
            func.coalesce(
                func.sum(
                    sa_case(
                        (HouseholdMember.income_cadence == "weekly",
                         HouseholdMember.income_amount * Decimal("52") / Decimal("12")),
                        (HouseholdMember.income_cadence == "annually",
                         HouseholdMember.income_amount / Decimal("12")),
                        else_=HouseholdMember.income_amount,
                    )
                ),
                0,
            )
        ).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.contributes_income == True,
            HouseholdMember.income_amount.isnot(None),
            HouseholdMember.is_active == True,
        )
    )
    total_income = Decimal(str(income_q.scalar() or "0"))

    # Last 6 sessions with their items
    sessions_q = await db.execute(
        select(BudgetSession)
        .options(selectinload(BudgetSession.items))
        .where(
            BudgetSession.household_id == household_id,
            BudgetSession.user_id == current_user.id,
            BudgetSession.is_deleted == False,
        )
        .order_by(BudgetSession.month.desc())
        .limit(6)
    )
    sessions = sessions_q.scalars().all()

    today = date_type.today()
    current_month_start = today.replace(day=1)

    history: list[SessionMonthStats] = []
    current_session: SessionMonthStats | None = None

    for s in sessions:
        total_budgeted = Decimal(str(sum(i.allocated_amount for i in s.items if i.status != 'na')))
        paid_count = sum(1 for i in s.items if i.status == "paid")
        paid_amount = Decimal(str(sum(i.allocated_amount for i in s.items if i.status == "paid")))
        item_count = len(s.items)

        if total_income > 0:
            savings_rate = ((total_income - total_budgeted) / total_income * 100).quantize(Decimal("0.1"))
        else:
            savings_rate = Decimal("0")

        stats = SessionMonthStats(
            session_id=str(s.id),
            month=s.month.isoformat(),
            status=s.status,
            total_budgeted=total_budgeted,
            item_count=item_count,
            paid_count=paid_count,
            paid_amount=paid_amount,
            savings_rate=savings_rate,
        )
        history.append(stats)
        if s.month == current_month_start:
            current_session = stats

    return BudgetStatsResponse(
        total_income=total_income,
        monthly_history=history,
        current_session=current_session,
    )


# ─── Budget Trend ─────────────────────────────────────────────────

@router.get("/trend", response_model=BudgetTrendResponse)
async def get_budget_trend(
    household_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sessions_q = await db.execute(
        select(BudgetSession)
        .options(
            selectinload(BudgetSession.items)
            .selectinload(BudgetSessionItem.expense)
            .selectinload(Expense.group)
        )
        .where(
            BudgetSession.household_id == household_id,
            BudgetSession.user_id == current_user.id,
            BudgetSession.is_deleted == False,
        )
        .order_by(BudgetSession.month.desc())
        .limit(6)
    )
    sessions = list(reversed(sessions_q.scalars().all()))

    result: list[SessionTrend] = []
    for s in sessions:
        group_totals_map: dict[str | None, tuple[str, Decimal]] = {}
        for item in s.items:
            exp = item.expense
            if exp is None:
                gid, gname = None, "Ungrouped"
            elif exp.group is None:
                gid, gname = None, "Ungrouped"
            else:
                gid, gname = str(exp.group.id), exp.group.name
            prev = group_totals_map.get(gid, (gname, Decimal("0")))
            group_totals_map[gid] = (gname, prev[1] + item.allocated_amount)

        group_totals = [
            GroupTrend(group_id=gid, group_name=name, total=total)
            for gid, (name, total) in group_totals_map.items()
        ]
        result.append(SessionTrend(
            session_id=str(s.id),
            month=s.month.isoformat(),
            status=s.status,
            group_totals=group_totals,
            session_total=sum(gt.total for gt in group_totals),
        ))

    return BudgetTrendResponse(sessions=result)


# ─── Budget Variance ──────────────────────────────────────────────

@router.get("/variance", response_model=VarianceResponse)
async def get_budget_variance(
    household_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Load the most recent session (active preferred, else latest closed)
    sessions_q = await db.execute(
        select(BudgetSession)
        .options(
            selectinload(BudgetSession.items)
            .selectinload(BudgetSessionItem.expense)
            .selectinload(Expense.group)
        )
        .where(
            BudgetSession.household_id == household_id,
            BudgetSession.user_id == current_user.id,
            BudgetSession.is_deleted == False,
        )
        .order_by(BudgetSession.month.desc())
        .limit(1)
    )
    session = sessions_q.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="No budget sessions found")

    # Group items by expense group
    group_map: dict[str | None, tuple[str, list[BudgetSessionItem]]] = {}
    for item in session.items:
        exp = item.expense
        if exp is None:
            gid, gname = None, "One-time"
        elif exp.group is None:
            gid, gname = None, "Ungrouped"
        else:
            gid, gname = str(exp.group.id), exp.group.name
        if gid not in group_map:
            group_map[gid] = (gname, [])
        group_map[gid][1].append(item)

    variance_groups: list[VarianceGroup] = []
    for gid, (gname, g_items) in group_map.items():
        v_items: list[VarianceItem] = []
        for it in g_items:
            budgeted = it.allocated_amount
            paid = it.amount_paid if it.amount_paid > Decimal("0") else (
                it.allocated_amount if it.status == "paid" else Decimal("0")
            )
            name = it.expense.name if it.expense else (it.ad_hoc_name or "One-time")
            v_items.append(VarianceItem(
                item_id=str(it.id), name=name,
                budgeted=budgeted, paid=paid, variance=paid - budgeted,
            ))
        g_budgeted = sum(i.budgeted for i in v_items)
        g_paid = sum(i.paid for i in v_items)
        variance_groups.append(VarianceGroup(
            group_id=gid, group_name=gname,
            budgeted=g_budgeted, paid=g_paid, variance=g_paid - g_budgeted,
            items=v_items,
        ))

    total_budgeted = sum(g.budgeted for g in variance_groups)
    total_paid = sum(g.paid for g in variance_groups)

    return VarianceResponse(
        session_id=str(session.id),
        month=session.month.isoformat(),
        status=session.status,
        total_budgeted=total_budgeted,
        total_paid=total_paid,
        total_variance=total_paid - total_budgeted,
        groups=variance_groups,
    )


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
        .options(
            selectinload(BudgetSession.items).selectinload(BudgetSessionItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag),
            selectinload(BudgetSession.extra_income),
        )
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
        .options(
            selectinload(BudgetSession.items).selectinload(BudgetSessionItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag),
            selectinload(BudgetSession.extra_income),
        )
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

    resp = BudgetSessionResponse.model_validate(session)
    resp.monthly_income = await get_household_income_as_of(db, household_id, session.month)
    return resp


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
        .options(
            selectinload(BudgetSession.items).selectinload(BudgetSessionItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag),
            selectinload(BudgetSession.extra_income),
        )
        .where(BudgetSession.id == session_id)
    )
    return result.scalar_one()


@router.post("/sessions/{session_id}/reset", response_model=BudgetSessionResponse)
async def reset_session(
    household_id: UUID,
    session_id: UUID,
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

    # Hard-delete all ad-hoc items (expense_id IS NULL)
    await db.execute(
        delete(BudgetSessionItem).where(
            BudgetSessionItem.session_id == session_id,
            BudgetSessionItem.expense_id == None
        )
    )

    # Reset library items to default state
    library_result = await db.execute(
        select(BudgetSessionItem).where(
            BudgetSessionItem.session_id == session_id,
            BudgetSessionItem.expense_id != None
        )
    )
    for item in library_result.scalars().all():
        item.status = 'todo'
        item.notes = None
        item.reference_number = None

    await db.commit()

    result = await db.execute(
        select(BudgetSession)
        .options(
            selectinload(BudgetSession.items).selectinload(BudgetSessionItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag),
            selectinload(BudgetSession.extra_income),
        )
        .where(BudgetSession.id == session_id)
    )
    return result.scalar_one()


@router.post("/sessions/{session_id}/sync-expenses", response_model=BudgetSessionResponse)
async def sync_session_expenses(
    household_id: UUID,
    session_id: UUID,
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
    if session.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft sessions can be synced")

    # Determine caller's household role (same logic as session creation)
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

    # Fetch all current, non-deleted expenses relevant to this user
    expense_result = await db.execute(
        select(Expense)
        .options(selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(Expense.household_id == household_id, Expense.is_deleted == False)
    )
    all_expenses = expense_result.scalars().all()
    relevant = [
        exp for exp in all_expenses
        if exp.owner_id == current_user.id
        or (exp.owner_id is None and (exp.ownership_type == role or exp.ownership_type == "joint"))
    ]

    # Build map of existing library items: expense_id → item
    existing_result = await db.execute(
        select(BudgetSessionItem).where(
            BudgetSessionItem.session_id == session_id,
            BudgetSessionItem.expense_id != None
        )
    )
    existing_map = {str(item.expense_id): item for item in existing_result.scalars().all()}

    for exp in relevant:
        key = str(exp.id)
        if key in existing_map:
            # Update amount snapshot — only if status is still todo (don't disturb paid/reserved/na items)
            existing_map[key].allocated_amount = exp.monthly_amount
        else:
            # New expense added to library since session was created
            db.add(BudgetSessionItem(
                session_id=session_id,
                expense_id=exp.id,
                allocated_amount=exp.monthly_amount,
                amount_paid=Decimal("0.00"),
                status="todo"
            ))

    await db.commit()

    result = await db.execute(
        select(BudgetSession)
        .options(
            selectinload(BudgetSession.items).selectinload(BudgetSessionItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag),
            selectinload(BudgetSession.extra_income),
        )
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
        select(BudgetSessionItem)
        .options(selectinload(BudgetSessionItem.expense))
        .where(
            BudgetSessionItem.id == item_id,
            BudgetSessionItem.session_id == session_id
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Session item not found")

    if payload.status == "na" and not payload.notes:
        raise HTTPException(status_code=422, detail="A note is required when marking an item as N/A")

    old_status = item.status

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)

    # Clear notes when moving away from N/A
    if payload.status != "na":
        item.notes = None

    # Clear reference number and reset amount_paid when un-paying
    if payload.status != "paid":
        item.reference_number = None
        item.amount_paid = Decimal("0")
    elif item.amount_paid == Decimal("0"):
        # Auto-set amount_paid to allocated_amount if not explicitly provided
        item.amount_paid = item.allocated_amount

    effective_paid = item.amount_paid if item.amount_paid > Decimal("0") else item.allocated_amount

    # ── Auto-credit account on paid ──────────────────────────────
    if payload.status == "paid" and old_status != "paid":
        account_id = item.expense.account_id if item.expense else None
        if account_id:
            acc_result = await db.execute(select(Account).where(Account.id == account_id))
            account = acc_result.scalar_one_or_none()
            if account and account.contributes_to_net_worth:
                expense_name = item.expense.name if item.expense else (item.ad_hoc_name or "Ad-hoc")
                txn = AccountTransaction(
                    account_id=account.id,
                    household_id=household_id,
                    amount=effective_paid,
                    narration=expense_name,
                    transaction_type="credit",
                    session_item_id=item.id,
                )
                db.add(txn)
                account.current_balance = (account.current_balance or Decimal("0")) + effective_paid

    # ── Reverse auto-credit when un-paying ───────────────────────
    elif old_status == "paid" and payload.status != "paid":
        rev_result = await db.execute(
            select(AccountTransaction).where(AccountTransaction.session_item_id == item.id)
        )
        auto_txn = rev_result.scalar_one_or_none()
        if auto_txn:
            acc_result = await db.execute(select(Account).where(Account.id == auto_txn.account_id))
            account = acc_result.scalar_one_or_none()
            if account:
                account.current_balance = (account.current_balance or Decimal("0")) - auto_txn.amount
            await db.delete(auto_txn)

    await db.commit()

    result = await db.execute(
        select(BudgetSessionItem)
        .options(selectinload(BudgetSessionItem.expense).selectinload(Expense.tag_assignments).selectinload(ExpenseTagAssignment.tag))
        .where(BudgetSessionItem.id == item_id)
    )
    return result.scalar_one()


@router.post("/sessions/{session_id}/items", response_model=BudgetSessionItemResponse, status_code=status.HTTP_201_CREATED)
async def add_adhoc_session_item(
    household_id: UUID,
    session_id: UUID,
    payload: AdHocSessionItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session_result = await db.execute(
        select(BudgetSession).where(
            BudgetSession.id == session_id,
            BudgetSession.household_id == household_id,
            BudgetSession.user_id == current_user.id,
            BudgetSession.is_deleted == False
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    # Enforce freed-up budget constraint (freed-up NA amounts + extra income)
    existing_result = await db.execute(
        select(BudgetSessionItem).where(BudgetSessionItem.session_id == session_id)
    )
    existing_items = existing_result.scalars().all()
    freed_up = sum(
        i.allocated_amount for i in existing_items
        if i.expense_id is not None and i.status == "na"
    )
    adhoc_used = sum(
        i.allocated_amount for i in existing_items
        if i.expense_id is None
    )
    extra_income_result = await db.execute(
        select(BudgetSessionExtraIncome).where(BudgetSessionExtraIncome.session_id == session_id)
    )
    extra_income_total = sum(e.amount for e in extra_income_result.scalars().all())
    available = freed_up + extra_income_total - adhoc_used
    if payload.amount > available:
        raise HTTPException(
            status_code=400,
            detail=f"Amount exceeds available freed up budget (KES {available:.2f} remaining)"
        )

    item = BudgetSessionItem(
        session_id=session_id,
        expense_id=None,
        ad_hoc_name=payload.name,
        ad_hoc_amount=payload.amount,
        allocated_amount=payload.amount,
        amount_paid=Decimal("0.00"),
        status="todo"
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/sessions/{session_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_adhoc_session_item(
    household_id: UUID,
    session_id: UUID,
    item_id: UUID,
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
    if item.expense_id is not None:
        raise HTTPException(status_code=400, detail="Only one-time expenses can be removed from a session")
    await db.delete(item)
    await db.commit()


# ─── Extra Income ─────────────────────────────────────────────────

@router.post("/sessions/{session_id}/extra-income", response_model=BudgetSessionExtraIncomeResponse, status_code=status.HTTP_201_CREATED)
async def add_extra_income(
    household_id: UUID,
    session_id: UUID,
    payload: BudgetSessionExtraIncomeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session_result = await db.execute(
        select(BudgetSession).where(
            BudgetSession.id == session_id,
            BudgetSession.household_id == household_id,
            BudgetSession.user_id == current_user.id,
            BudgetSession.is_deleted == False
        )
    )
    if not session_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    entry = BudgetSessionExtraIncome(
        session_id=session_id,
        household_id=household_id,
        amount=payload.amount,
        narration=payload.narration,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/sessions/{session_id}/extra-income/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_extra_income(
    household_id: UUID,
    session_id: UUID,
    income_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(BudgetSessionExtraIncome).where(
            BudgetSessionExtraIncome.id == income_id,
            BudgetSessionExtraIncome.session_id == session_id,
            BudgetSessionExtraIncome.household_id == household_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Extra income entry not found")
    await db.delete(entry)
    await db.commit()
