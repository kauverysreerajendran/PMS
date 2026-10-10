from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class HousekeepingTask(Base):
    """A cleaning or maintenance job on a room, from creation (usually at check-out) to release."""
    __tablename__ = "housekeeping_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id"), index=True)
    room_number: Mapped[str] = mapped_column(String(30))
    reservation_id: Mapped[int | None] = mapped_column(ForeignKey("reservations.id"), nullable=True)
    task_type: Mapped[str] = mapped_column(String(20), default="cleaning")          # cleaning | maintenance
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending | assigned | in_progress | inspection | done
    priority: Mapped[str] = mapped_column(String(10), default="normal")             # normal | high
    assignee: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # JSON list of {"item": str, "qty": int}: what the cleaner is carrying.
    supplies: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
