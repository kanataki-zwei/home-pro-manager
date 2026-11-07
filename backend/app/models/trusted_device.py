import re
import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, UniqueConstraint, CheckConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import TimestampMixin


def parse_device_label(user_agent: str | None) -> str:
    if not user_agent:
        return "Unknown device"
    ua = user_agent.lower()

    if "edg/" in ua:
        browser = "Edge"
    elif "chrome" in ua:
        browser = "Chrome"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "safari" in ua:
        browser = "Safari"
    else:
        browser = "Browser"

    if "android" in ua:
        m = re.search(r'android [^;)]+;\s*([^;)\s][^;)]*)', ua)
        model = m.group(1).strip().title() if m else "Android"
        return f"{browser} on {model}"
    elif "iphone" in ua:
        return f"{browser} on iPhone"
    elif "ipad" in ua:
        return f"{browser} on iPad"
    elif "windows" in ua:
        return f"{browser} on Windows"
    elif "macintosh" in ua or "mac os" in ua:
        return f"{browser} on Mac"
    elif "linux" in ua:
        return f"{browser} on Linux"

    return f"{browser} — Unknown OS"


class TrustedDevice(Base, TimestampMixin):
    __tablename__ = "trusted_devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(String(64), nullable=False)
    label = Column(String(255), nullable=False, default="Unknown device")
    user_agent = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    nickname = Column(String(100), nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    requested_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "device_id", name="uq_trusted_device"),
        CheckConstraint("status IN ('pending', 'approved', 'rejected')", name="trusted_device_status_check"),
    )

    user = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
