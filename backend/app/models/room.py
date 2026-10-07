from datetime import datetime
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base

class Room(Base):
    __tablename__ = "rooms"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    room_number: Mapped[str] = mapped_column(String(30))
    room_category: Mapped[str] = mapped_column(String(100))
    floor: Mapped[str | None] = mapped_column(String(30), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, default=2)
    status: Mapped[str] = mapped_column(String(30), default="available", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (UniqueConstraint("property_id", "room_number", name="uq_rooms_property_number"),)
