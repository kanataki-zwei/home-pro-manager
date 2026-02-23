from sqlalchemy import Column, DateTime, func
from app.core.database import Base
import uuid
from sqlalchemy.dialects.postgresql import UUID

class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())