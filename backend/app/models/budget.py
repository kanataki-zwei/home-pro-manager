from sqlalchemy import Column, String, Boolean, Numeric, ForeignKey, CheckConstraint, Date, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.core.database import Base
from app.models.base import TimestampMixin


class ExpenseGroup(Base, TimestampMixin):
    __tablename__ = "expense_groups"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id = Column(UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False)
    owner_id = Column(UUID(as_uuid=True), nullable=True)  # null = household group, user_id = personal group
    name = Column(String(255), nullable=False)
    is_deleted = Column(Boolean, default=False)

    household = relationship("Household")
    expenses = relationship("Expense", back_populates="group")


class ExpenseTag(Base, TimestampMixin):
    __tablename__ = "expense_tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id = Column(UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    color = Column(String(20), nullable=True)
    is_deleted = Column(Boolean, default=False)

    household = relationship("Household")
    tag_assignments = relationship("ExpenseTagAssignment", back_populates="tag")


class Expense(Base, TimestampMixin):
    __tablename__ = "expenses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id = Column(UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False)
    owner_id = Column(UUID(as_uuid=True), nullable=True)  # null = household expense, user_id = personal expense
    group_id = Column(UUID(as_uuid=True), ForeignKey("expense_groups.id", ondelete="SET NULL"), nullable=True)
    account_id = Column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    frequency = Column(String(20), nullable=False)  # daily, weekly, monthly, annual
    monthly_amount = Column(Numeric(15, 2), nullable=False)  # computed
    ownership_type = Column(String(20), nullable=False, default="joint")  # husband, wife, joint
    joint_split_husband = Column(Numeric(5, 2), nullable=True)  # percentage e.g. 60.00
    joint_split_wife = Column(Numeric(5, 2), nullable=True)    # percentage e.g. 40.00
    is_deleted = Column(Boolean, default=False)

    __table_args__ = (
        CheckConstraint(frequency.in_(['daily', 'weekly', 'monthly', 'annual']), name='expense_frequency_check'),
        CheckConstraint(ownership_type.in_(['husband', 'wife', 'joint']), name='expense_ownership_check'),
    )

    household = relationship("Household")
    group = relationship("ExpenseGroup", back_populates="expenses")
    account = relationship("Account")
    tag_assignments = relationship("ExpenseTagAssignment", back_populates="expense")


class ExpenseTagAssignment(Base):
    __tablename__ = "expense_tag_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_id = Column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False)
    tag_id = Column(UUID(as_uuid=True), ForeignKey("expense_tags.id", ondelete="CASCADE"), nullable=False)

    expense = relationship("Expense", back_populates="tag_assignments")
    tag = relationship("ExpenseTag", back_populates="tag_assignments")


class BudgetTemplate(Base, TimestampMixin):
    __tablename__ = "budget_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id = Column(UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)  # owner of this template
    name = Column(String(255), nullable=False)
    net_monthly_income = Column(Numeric(15, 2), nullable=False)
    is_active = Column(Boolean, default=True)
    is_deleted = Column(Boolean, default=False)

    household = relationship("Household")
    items = relationship("BudgetTemplateItem", back_populates="template")


class BudgetTemplateItem(Base, TimestampMixin):
    __tablename__ = "budget_template_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("budget_templates.id", ondelete="CASCADE"), nullable=False)
    expense_id = Column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False)
    allocated_amount = Column(Numeric(15, 2), nullable=False)  # user's share for joint, full amount otherwise
    notes = Column(Text, nullable=True)

    template = relationship("BudgetTemplate", back_populates="items")
    expense = relationship("Expense")


class BudgetSession(Base, TimestampMixin):
    __tablename__ = "budget_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id = Column(UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    budget_template_id = Column(UUID(as_uuid=True), nullable=True)  # nullable — sessions are standalone
    month = Column(Date, nullable=False)  # always stored as first day of month e.g. 2026-02-01
    name = Column(String(255), nullable=False)  # e.g. "February 2026"
    status = Column(String(20), nullable=False, default="draft")  # draft, active, closed
    is_deleted = Column(Boolean, default=False)

    __table_args__ = (
        CheckConstraint(status.in_(['draft', 'active', 'closed']), name='session_status_check'),
    )

    household = relationship("Household")
    items = relationship("BudgetSessionItem", back_populates="session")


class BudgetSessionItem(Base, TimestampMixin):
    __tablename__ = "budget_session_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("budget_sessions.id", ondelete="CASCADE"), nullable=False)
    expense_id = Column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="RESTRICT"), nullable=False)
    allocated_amount = Column(Numeric(15, 2), nullable=False)  # copied from expense.monthly_amount at session creation
    amount_paid = Column(Numeric(15, 2), default=0.00)
    status = Column(String(20), nullable=False, default="todo")  # todo, paid, reserved, na
    reference_number = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    paid_date = Column(Date, nullable=True)

    __table_args__ = (
        CheckConstraint(status.in_(['todo', 'paid', 'reserved', 'na']), name='session_item_status_check'),
    )

    session = relationship("BudgetSession", back_populates="items")
    expense = relationship("Expense")