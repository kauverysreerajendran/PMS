"""Guest folio: per-night room charges and posted extra charges (eZee-style folio operations)."""
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class ReservationNight(Base):
    """One row per night of a stay: what room, rate plan, pax and rate apply to that night."""
    __tablename__ = "reservation_nights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id"), index=True)
    stay_date: Mapped[date] = mapped_column(Date)
    room_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    room_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rate_plan: Mapped[str | None] = mapped_column(String(100), nullable=True)
    adults: Mapped[int] = mapped_column(Integer, default=1)
    children: Mapped[int] = mapped_column(Integer, default=0)
    rate: Mapped[int] = mapped_column(Integer, default=0)  # room revenue for this night (all rooms of the booking)
    complimentary: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("reservation_id", "stay_date", name="uq_reservation_night"),)


class FolioCharge(Base):
    """A posted charge on the guest folio: laundry, minibar, room charge posting, discount, etc."""
    __tablename__ = "folio_charges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id"), index=True)
    posted_on: Mapped[date] = mapped_column(Date)
    category: Mapped[str] = mapped_column(String(60))  # Laundry, Minibar, Room Charges, Discount, ...
    reference: Mapped[str | None] = mapped_column(String(60), nullable=True)  # Rec/Vou #
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_amount: Mapped[int] = mapped_column(Integer, default=0)
    discount: Mapped[int] = mapped_column(Integer, default=0)
    amount: Mapped[int] = mapped_column(Integer, default=0)  # net = qty * unit - discount (negative for discounts)
    tax_inclusive: Mapped[bool] = mapped_column(Boolean, default=True)
    is_void: Mapped[bool] = mapped_column(Boolean, default=False)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    posted_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (Index("ix_folio_charges_property_reservation", "property_id", "reservation_id"),)
