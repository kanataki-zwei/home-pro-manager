from sqlalchemy import Column, String, Boolean, Date, Numeric, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.core.database import Base
from app.models.base import TimestampMixin


class Household(Base, TimestampMixin):
    __tablename__ = "households"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    created_by = Column(UUID(as_uuid=True), nullable=True)  # auth user id of creator

    members = relationship("HouseholdMember", back_populates="household")
    member_types = relationship("MemberType", back_populates="household")
    accounts = relationship("Account", back_populates="household")


class MemberType(Base):
    __tablename__ = "member_types"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id = Column(UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)

    from sqlalchemy import Column, DateTime, func
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    household = relationship("Household", back_populates="member_types")
    members = relationship("HouseholdMember", back_populates="member_type")


class HouseholdMember(Base, TimestampMixin):
    __tablename__ = "household_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id = Column(UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False)
    member_type_id = Column(UUID(as_uuid=True), ForeignKey("member_types.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=True)  # links to supabase auth.users
    name = Column(String(255), nullable=False)
    date_of_birth = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    contributes_income = Column(Boolean, default=False, nullable=False)
    income_amount = Column(Numeric(15, 2), nullable=True)
    income_currency = Column(String(10), nullable=True)
    income_cadence = Column(String(20), nullable=True)

    household = relationship("Household", back_populates="members")
    member_type = relationship("MemberType", back_populates="members")
    accounts = relationship("Account", back_populates="member")


class Account(Base, TimestampMixin):
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id = Column(UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False)
    household_member_id = Column(UUID(as_uuid=True), ForeignKey("household_members.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    account_type = Column(String(50), nullable=False)
    institution_type = Column(String(50), nullable=True)
    ownership = Column(String(20), nullable=False)
    current_balance = Column(Numeric(15, 2), default=0.00)
    currency = Column(String(10), default="KES")
    is_active = Column(Boolean, default=True)

    __table_args__ = (
        CheckConstraint(account_type.in_(['checking', 'savings', 'cash', 'investment', 'credit']), name='account_type_check'),
        CheckConstraint("institution_type IS NULL OR institution_type IN ('bank', 'money_market', 'mobile_money', 'insurance', 'govt_securities', 'stocks_shares')", name='institution_type_check'),
        CheckConstraint(ownership.in_(['joint', 'individual']), name='ownership_check'),
    )

    household = relationship("Household", back_populates="accounts")
    member = relationship("HouseholdMember", back_populates="accounts")