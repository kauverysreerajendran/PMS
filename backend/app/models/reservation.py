from datetime import date, datetime, time

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Boolean,
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
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    identity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    identity_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    identity_document_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
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
    rooms_count: Mapped[int] = mapped_column(Integer, default=1)
    rate_plan: Mapped[str | None] = mapped_column(String(100), nullable=True)
    nightly_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rate_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    taxes_amount: Mapped[int] = mapped_column(Integer, default=0)
    discount_amount: Mapped[int] = mapped_column(Integer, default=0)
    additional_charges: Mapped[int] = mapped_column(Integer, default=0)
    special_requests: Mapped[str | None] = mapped_column(Text, nullable=True)
    send_confirmation_voucher: Mapped[bool] = mapped_column(Boolean, default=False)
    is_group_booking: Mapped[bool] = mapped_column(Boolean, default=False)
    group_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    booking_source: Mapped[str | None] = mapped_column(String(150), nullable=True)
    business_source: Mapped[str | None] = mapped_column(String(150), nullable=True)
    market_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    deposit_due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    release_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    group_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quick_group_booking: Mapped[bool] = mapped_column(Boolean, default=False)
    reminder_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    required_advance_amount: Mapped[int] = mapped_column(Integer, default=0)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    guest = relationship("Guest", back_populates="reservations")
    group_room_blocks = relationship("GroupRoomBlock", back_populates="reservation", cascade="all, delete-orphan")

    @property
    def room_blocks(self):
        return self.group_room_blocks

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
    folio_number: Mapped[str | None] = mapped_column(String(40), unique=True, index=True, nullable=True)
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


class RatePlan(Base):
    __tablename__ = "rate_plans"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    room_category: Mapped[str] = mapped_column(String(100), index=True)
    nightly_rate: Mapped[int] = mapped_column(Integer)
    adult_capacity: Mapped[int] = mapped_column(Integer, default=2)
    child_capacity: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("property_id", "name", "room_category", name="uq_rate_plans_property_name_room"),)


class PaymentMethod(Base):
    __tablename__ = "payment_methods"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    code: Mapped[str] = mapped_column(String(30))
    label: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("property_id", "code", name="uq_payment_methods_property_code"),)


class GroupRoomBlock(Base):
    __tablename__ = "group_room_blocks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id"), index=True)
    room_category: Mapped[str] = mapped_column(String(100))
    rate_plan: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rooms_count: Mapped[int] = mapped_column(Integer)
    adults: Mapped[int] = mapped_column(Integer)
    children: Mapped[int] = mapped_column(Integer, default=0)
    nightly_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reservation = relationship("Reservation", back_populates="group_room_blocks")
