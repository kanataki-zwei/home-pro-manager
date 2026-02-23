from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from uuid import UUID
from app.core.database import get_db
from app.models.household import Household, MemberType, HouseholdMember, Account
from app.schemas.household import (
    HouseholdCreate, HouseholdResponse,
    MemberTypeCreate, MemberTypeResponse,
    HouseholdMemberCreate, HouseholdMemberUpdate, HouseholdMemberResponse,
    AccountCreate, AccountUpdate, AccountResponse
)

router = APIRouter()


# ─── Households ─────────────────────────────────────────────────

@router.post("/", response_model=HouseholdResponse, status_code=status.HTTP_201_CREATED)
async def create_household(payload: HouseholdCreate, db: AsyncSession = Depends(get_db)):
    household = Household(name=payload.name)
    db.add(household)
    await db.flush()
    await db.commit()
    result = await db.execute(
        select(Household)
        .options(selectinload(Household.member_types))
        .where(Household.id == household.id)
    )
    return result.scalar_one()


@router.get("/{household_id}", response_model=HouseholdResponse)
async def get_household(household_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Household)
        .options(selectinload(Household.member_types))
        .where(Household.id == household_id)
    )
    household = result.scalar_one_or_none()
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")
    return household


@router.patch("/{household_id}", response_model=HouseholdResponse)
async def update_household(household_id: UUID, payload: HouseholdCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Household)
        .options(selectinload(Household.member_types))
        .where(Household.id == household_id)
    )
    household = result.scalar_one_or_none()
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")
    household.name = payload.name
    await db.commit()
    result = await db.execute(
        select(Household)
        .options(selectinload(Household.member_types))
        .where(Household.id == household_id)
    )
    return result.scalar_one()


# ─── Member Types ───────────────────────────────────────────────

@router.get("/{household_id}/member-types", response_model=list[MemberTypeResponse])
async def get_member_types(household_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MemberType).where(MemberType.household_id == household_id)
    )
    return result.scalars().all()


@router.post("/{household_id}/member-types", response_model=MemberTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_member_type(household_id: UUID, payload: MemberTypeCreate, db: AsyncSession = Depends(get_db)):
    member_type = MemberType(household_id=household_id, name=payload.name)
    db.add(member_type)
    await db.commit()
    await db.refresh(member_type)
    return member_type


@router.delete("/{household_id}/member-types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member_type(household_id: UUID, type_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MemberType).where(MemberType.id == type_id, MemberType.household_id == household_id)
    )
    member_type = result.scalar_one_or_none()
    if not member_type:
        raise HTTPException(status_code=404, detail="Member type not found")
    await db.delete(member_type)
    await db.commit()


# ─── Household Members ──────────────────────────────────────────

@router.get("/{household_id}/members", response_model=list[HouseholdMemberResponse])
async def get_members(household_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HouseholdMember)
        .options(selectinload(HouseholdMember.member_type))
        .where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.is_active == True
        )
    )
    return result.scalars().all()


@router.post("/{household_id}/members", response_model=HouseholdMemberResponse, status_code=status.HTTP_201_CREATED)
async def create_member(household_id: UUID, payload: HouseholdMemberCreate, db: AsyncSession = Depends(get_db)):
    member = HouseholdMember(household_id=household_id, **payload.model_dump())
    db.add(member)
    await db.commit()
    result = await db.execute(
        select(HouseholdMember)
        .options(selectinload(HouseholdMember.member_type))
        .where(HouseholdMember.id == member.id)
    )
    return result.scalar_one()


@router.patch("/{household_id}/members/{member_id}", response_model=HouseholdMemberResponse)
async def update_member(household_id: UUID, member_id: UUID, payload: HouseholdMemberUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HouseholdMember).where(
            HouseholdMember.id == member_id,
            HouseholdMember.household_id == household_id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(member, key, value)

    await db.commit()
    result = await db.execute(
        select(HouseholdMember)
        .options(selectinload(HouseholdMember.member_type))
        .where(HouseholdMember.id == member_id)
    )
    return result.scalar_one()


@router.delete("/{household_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(household_id: UUID, member_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HouseholdMember).where(
            HouseholdMember.id == member_id,
            HouseholdMember.household_id == household_id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.is_active = False
    await db.commit()


# ─── Accounts ───────────────────────────────────────────────────

@router.get("/{household_id}/accounts", response_model=list[AccountResponse])
async def get_accounts(household_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Account).where(
            Account.household_id == household_id,
            Account.is_active == True
        )
    )
    return result.scalars().all()


@router.post("/{household_id}/accounts", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(household_id: UUID, payload: AccountCreate, db: AsyncSession = Depends(get_db)):
    account = Account(household_id=household_id, **payload.model_dump())
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.patch("/{household_id}/accounts/{account_id}", response_model=AccountResponse)
async def update_account(household_id: UUID, account_id: UUID, payload: AccountUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Account).where(
            Account.id == account_id,
            Account.household_id == household_id
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(account, key, value)

    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/{household_id}/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(household_id: UUID, account_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Account).where(
            Account.id == account_id,
            Account.household_id == household_id
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.is_active = False
    await db.commit()