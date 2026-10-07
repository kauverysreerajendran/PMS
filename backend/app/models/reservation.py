from datetime import date, datetime, time

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Guest(Base):
    __tablename__ = "guests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id"), index=True
    )
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    mobile: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    reservations = relationship("Reservation", back_populates="guest")

    __table_args__ = (
        Index("ix_guests_property_name", "property_id", "last_name", "first_name"),
    )


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id"), index=True
    )
    reservation_code: Mapped[str] = mapped_column(String(40), index=True)
    guest_id: Mapped[int] = mapped_column(ForeignKey("guests.id"), index=True)
    room_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    room_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    check_in_date: Mapped[date] = mapped_column(Date, index=True)
    check_out_date: Mapped[date] = mapped_column(Date, index=True)
    arrival_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    adults: Mapped[int] = mapped_column(Integer, default=1)
    children: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30), default="confirmed", index=True)
    source: Mapped[str] = mapped_column(String(50), default="front_desk")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    guest = relationship("Guest", back_populates="reservations")

    __table_args__ = (
        UniqueConstraint(
            "property_id", "reservation_code", name="uq_reservations_property_code"
        ),
        Index(
            "ix_reservations_property_arrival",
            "property_id",
            "check_in_date",
        ),
        Index(
            "ix_reservations_property_room_dates",
            "property_id",
            "room_number",
            "check_in_date",
            "check_out_date",
        ),
    )


class CheckIn(Base):
    __tablename__ = "checkins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id"), index=True
    )
    reservation_id: Mapped[int] = mapped_column(
        ForeignKey("reservations.id"), unique=True, index=True
    )
    guest_id: Mapped[int] = mapped_column(ForeignKey("guests.id"), index=True)
    room_number: Mapped[str] = mapped_column(String(30), index=True)
    identity_document_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    identity_document_number: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    verification_status: Mapped[str] = mapped_column(String(30), default="pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_in_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    checked_in_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    reservation = relationship("Reservation")
    guest = relationship("Guest")

    __table_args__ = (
        Index("ix_checkins_property_active", "property_id", "checked_in_at"),
    )


class CheckOut(Base):
    __tablename__ = "checkouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(
        ForeignKey("properties.id"), index=True
    )
    reservation_id: Mapped[int] = mapped_column(
        ForeignKey("reservations.id"), unique=True, index=True
    )
    checkin_id: Mapped[int] = mapped_column(
        ForeignKey("checkins.id"), unique=True, index=True
    )
    guest_id: Mapped[int] = mapped_column(ForeignKey("guests.id"), index=True)
    room_number: Mapped[str] = mapped_column(String(30), index=True)
    payment_status: Mapped[str] = mapped_column(
        String(30), default="pending", index=True
    )
    payment_method: Mapped[str] = mapped_column(String(30), default="cash")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_out_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    checked_out_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    reservation = relationship("Reservation")
    checkin = relationship("CheckIn")
    guest = relationship("Guest")

    __table_args__ = (
        Index("ix_checkouts_property_completed", "property_id", "checked_out_at"),
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    payment_method: Mapped[str] = mapped_column(String(30))
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    reservation = relationship("Reservation")

    __table_args__ = (
        Index("ix_payments_property_reservation", "property_id", "reservation_id"),
    )
