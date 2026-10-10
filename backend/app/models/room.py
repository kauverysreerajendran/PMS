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
    room_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Guests allowed in the room; capacity is kept as their total for availability checks.
    max_adults: Mapped[int] = mapped_column(Integer, default=2)
    max_children: Mapped[int] = mapped_column(Integer, default=0)
    capacity: Mapped[int] = mapped_column(Integer, default=2)
    image_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    base_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bed_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    size_sqft: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Comma-separated list, e.g. "Sea View, Balcony, Free Wi-Fi".
    amenities: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="available", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (UniqueConstraint("property_id", "room_number", name="uq_rooms_property_number"),)
