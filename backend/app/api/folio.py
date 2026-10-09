"""Guest folio operations (modelled on eZee Absolute's guest folio screen).

Every money-changing action here recalculates `reservations.total_amount`, so Billing,
Check-out, the dashboard and the calendar all keep showing the same totals.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.reservations import ensure_room_is_available, record_history
from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.folio import FolioCharge, ReservationNight
from app.models.reservation import CheckIn, Payment, Reservation
from app.models.reservation_history import ReservationHistory
from app.models.room import Room
from app.models.user import User

router = APIRouter(prefix="/reservations", tags=["Guest Folio"])

PAYMENT_METHODS = {"cash", "upi", "card", "bank_transfer", "city_ledger", "other"}
METHOD_LABELS = {"cash": "Cash", "upi": "UPI", "card": "Card", "bank_transfer": "Bank Transfer", "city_ledger": "City Ledger", "other": "Other"}
LOCKED_STATUSES = {"cancelled", "no_show", "checked_out"}
# Charge heads offered in "Add Charge" / "Room Charge Posting" (eZee's lists).
CHARGE_CATEGORIES = [
    "Banquet", "Breakfast", "Extra Bed Charges", "Laundry", "Minibar", "Restaurant", "Room Service",
    "Telephone", "Fax Charges", "Transport", "Spa", "Room Charges", "Late Checkout Charges",
    "Day Use Charges", "No Show Revenue", "Cancellation Revenue", "Other",
]


# ---------- request bodies ----------
class ChargeIn(BaseModel):
    posted_on: date | None = None
    category: str = Field(min_length=1, max_length=60)
    reference: str | None = Field(default=None, max_length=60)
    description: str | None = Field(default=None, max_length=1000)
    quantity: int = Field(default=1, ge=1, le=999)
    unit_amount: int = Field(gt=0)
    discount: int = Field(default=0, ge=0)
    tax_inclusive: bool = True

    @model_validator(mode="after")
    def check_discount(self):
        if self.discount > self.quantity * self.unit_amount:
            raise ValueError("Discount cannot exceed the charge amount")
        return self


class VoidIn(BaseModel):
    reason: str = Field(min_length=2, max_length=500)


class DiscountIn(BaseModel):
    amount: int = Field(gt=0)
    reason: str = Field(min_length=2, max_length=500)


class PaymentIn(BaseModel):
    amount: int = Field(gt=0)
    payment_method: str = Field(min_length=1, max_length=30)
    reference_number: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)


class AmendStayIn(BaseModel):
    check_in_date: date | None = None
    check_out_date: date
    override_rate: int | None = Field(default=None, ge=0)  # new per-night rate for the whole stay


class ShiftStayIn(BaseModel):
    check_in_date: date  # new arrival; departure moves by the same number of days


class RoomMoveIn(BaseModel):
    room_category: str = Field(min_length=1, max_length=100)
    room_number: str = Field(min_length=1, max_length=30)
    override_rate: int | None = Field(default=None, ge=0)
    reason: str | None = Field(default=None, max_length=500)


class NightsUpdateIn(BaseModel):
    dates: list[date] | None = None  # None = apply on whole stay
    rate: int | None = Field(default=None, ge=0)
    adults: int | None = Field(default=None, ge=1, le=20)
    children: int | None = Field(default=None, ge=0, le=20)
    rate_plan: str | None = Field(default=None, max_length=100)
    complimentary: bool | None = None


# ---------- helpers ----------
async def _reservation(reservation_id: int, user: User, db: AsyncSession) -> Reservation:
    reservation = await db.scalar(
        select(Reservation)
        .options(selectinload(Reservation.guest), selectinload(Reservation.group_room_blocks))
        .where(Reservation.id == reservation_id, Reservation.property_id == user.property_id)
    )
    if reservation is None:
        raise HTTPException(404, "Reservation not found")
    return reservation


def _editable(reservation: Reservation) -> None:
    if reservation.status in LOCKED_STATUSES:
        raise HTTPException(409, f"This reservation is {reservation.status.replace('_', ' ')} and can no longer be changed")


def _stay_dates(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days)]


async def _nights(reservation: Reservation, db: AsyncSession) -> list[ReservationNight]:
    """Per-night rows; created on first use from the booking's original pricing."""
    rows = (await db.execute(
        select(ReservationNight).where(ReservationNight.reservation_id == reservation.id).order_by(ReservationNight.stay_date)
    )).scalars().all()
    if rows:
        return list(rows)
    dates = _stay_dates(reservation.check_in_date, reservation.check_out_date)
    if not dates:
        return []
    if reservation.total_amount is not None:
        # Recover the room revenue the booking was priced at (total minus taxes, extras and posted folio charges).
        extras = await db.scalar(select(func.coalesce(func.sum(FolioCharge.amount), 0)).where(
            FolioCharge.reservation_id == reservation.id, FolioCharge.is_void.is_(False)))
        room_total = reservation.total_amount - reservation.taxes_amount - reservation.additional_charges + reservation.discount_amount - int(extras or 0)
    elif reservation.is_group_booking:
        room_total = sum((b.nightly_rate or 0) * b.rooms_count for b in reservation.group_room_blocks) * len(dates)
    else:
        room_total = (reservation.nightly_rate or 0) * (reservation.rooms_count or 1) * len(dates)
    room_total = max(room_total, 0)
    per_night, remainder = divmod(room_total, len(dates))
    created = []
    for index, stay_date in enumerate(dates):
        night = ReservationNight(
            property_id=reservation.property_id, reservation_id=reservation.id, stay_date=stay_date,
            room_number=reservation.room_number, room_category=reservation.room_category, rate_plan=reservation.rate_plan,
            adults=reservation.adults, children=reservation.children,
            rate=per_night + (remainder if index == len(dates) - 1 else 0),
        )
        db.add(night)
        created.append(night)
    await db.flush()
    return created


async def _recalculate_total(reservation: Reservation, db: AsyncSession) -> None:
    room = await db.scalar(select(func.coalesce(func.sum(ReservationNight.rate), 0)).where(
        ReservationNight.reservation_id == reservation.id, ReservationNight.complimentary.is_(False)))
    extras = await db.scalar(select(func.coalesce(func.sum(FolioCharge.amount), 0)).where(
        FolioCharge.reservation_id == reservation.id, FolioCharge.is_void.is_(False)))
    reservation.total_amount = int(room or 0) + reservation.taxes_amount + reservation.additional_charges - reservation.discount_amount + int(extras or 0)


async def _paid(reservation: Reservation, db: AsyncSession) -> int:
    return int(await db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.reservation_id == reservation.id, Payment.property_id == reservation.property_id)) or 0)


def _utc_offset() -> timedelta:
    """Payments are stored in UTC; show them on the server's local calendar day."""
    return timedelta(minutes=round((datetime.now() - datetime.utcnow()).total_seconds() / 60))


def _money(value: int) -> str:
    return f"Rs. {value:,}"


# ---------- read ----------
@router.get("/folio/charge-categories")
async def charge_categories(current_user: User = Depends(get_front_office_manager)):
    return {"charge_categories": CHARGE_CATEGORIES, "payment_methods": sorted(PAYMENT_METHODS)}


@router.get("/{reservation_id}/folio")
async def get_folio(reservation_id: int, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    r = await _reservation(reservation_id, current_user, db)
    nights = await _nights(r, db)
    await db.commit()  # persist lazily created night rows
    charges = (await db.execute(select(FolioCharge).where(FolioCharge.reservation_id == r.id).order_by(FolioCharge.posted_on, FolioCharge.id))).scalars().all()
    payments = (await db.execute(select(Payment).where(Payment.reservation_id == r.id, Payment.property_id == r.property_id).order_by(Payment.received_at))).scalars().all()
    history = (await db.execute(select(ReservationHistory).where(ReservationHistory.reservation_id == r.id).order_by(ReservationHistory.created_at.desc()))).scalars().all()
    checkin = await db.scalar(select(CheckIn).where(CheckIn.reservation_id == r.id).order_by(CheckIn.id.desc()))
    user_ids = {c.posted_by_user_id for c in charges} | {p.received_by_user_id for p in payments} | {h.user_id for h in history} | {r.created_by_user_id}
    names = dict((await db.execute(select(User.id, User.username).where(User.id.in_(user_ids)))).all()) if user_ids else {}

    room_total = sum(n.rate for n in nights if not n.complimentary)
    live = [c for c in charges if not c.is_void]
    extra_total = sum(c.amount for c in live if c.amount > 0)
    discount_total = -sum(c.amount for c in live if c.amount < 0) + r.discount_amount
    paid = sum(p.amount for p in payments)
    total = r.total_amount if r.total_amount is not None else room_total + r.taxes_amount + r.additional_charges - r.discount_amount + sum(c.amount for c in live)

    transactions = (
        [{"kind": "room", "id": n.id, "date": n.stay_date.isoformat(), "reference": None, "particulars": "Room Charges",
          "description": " · ".join(filter(None, [n.room_number and f"Room {n.room_number}", n.room_category, n.rate_plan, "Complimentary" if n.complimentary else None])),
          "user": names.get(r.created_by_user_id), "amount": 0 if n.complimentary else n.rate, "void": False} for n in nights]
        + [{"kind": "discount" if c.amount < 0 else "charge", "id": c.id, "date": c.posted_on.isoformat(), "reference": c.reference,
            "particulars": c.category, "description": " · ".join(filter(None, [c.description, f"Qty {c.quantity} × {_money(c.unit_amount)}" if c.quantity > 1 else None, f"less {_money(c.discount)}" if c.discount else None, c.is_void and f"VOID: {c.void_reason}"])),
            "user": names.get(c.posted_by_user_id), "amount": c.amount, "void": c.is_void} for c in charges]
        + [{"kind": "payment", "id": p.id, "date": (p.received_at + _utc_offset()).date().isoformat(), "reference": p.reference_number,
            "particulars": "Payment · " + METHOD_LABELS.get(p.payment_method, p.payment_method.replace("_", " ").title()), "description": p.notes,
            "user": names.get(p.received_by_user_id), "amount": -p.amount, "void": False} for p in payments]
    )
    order = {"room": 0, "charge": 1, "discount": 2, "payment": 3}
    transactions.sort(key=lambda t: (t["date"], order[t["kind"]]))

    guest = r.guest
    return {
        "reservation": {
            "id": r.id, "reservation_code": r.reservation_code, "status": r.status,
            "check_in_date": r.check_in_date.isoformat(), "check_out_date": r.check_out_date.isoformat(),
            "arrival_time": r.arrival_time.isoformat() if r.arrival_time else None,
            "nights": len(nights), "room_number": r.room_number, "room_category": r.room_category, "rooms_count": r.rooms_count,
            "rate_plan": r.rate_plan, "nightly_rate": r.nightly_rate, "adults": r.adults, "children": r.children,
            "avg_daily_rate": round(room_total / len(nights)) if nights else 0,
            "source": r.source, "booking_source": r.booking_source, "business_source": r.business_source, "market_code": r.market_code,
            "is_group_booking": r.is_group_booking, "group_name": r.group_name, "special_requests": r.special_requests, "notes": r.notes,
            "required_advance_amount": r.required_advance_amount, "deposit_due_at": r.deposit_due_at.isoformat() if r.deposit_due_at else None,
            "booked_at": r.created_at.isoformat() + "Z", "booked_by": names.get(r.created_by_user_id),
            "folio_number": checkin.folio_number if checkin else None,
            "checked_in_at": checkin.checked_in_at.isoformat() + "Z" if checkin else None,
            "guest": {
                "id": guest.id, "first_name": guest.first_name, "last_name": guest.last_name, "email": guest.email, "mobile": guest.mobile,
                "address": guest.address, "nationality": guest.nationality, "identity_type": guest.identity_type,
                "identity_number": guest.identity_number, "has_identity_document": bool(guest.identity_document_path),
            } if guest else None,
        },
        "nights": [{"id": n.id, "stay_date": n.stay_date.isoformat(), "room_number": n.room_number, "room_category": n.room_category,
                    "rate_plan": n.rate_plan, "adults": n.adults, "children": n.children, "rate": n.rate, "complimentary": n.complimentary} for n in nights],
        "transactions": transactions,
        "totals": {"room_charges": room_total, "extra_charges": extra_total + r.additional_charges, "taxes": r.taxes_amount,
                   "discounts": discount_total, "total": total, "paid": paid, "balance": total - paid},
        "history": [{"id": h.id, "action": h.action, "details": h.details, "user": names.get(h.user_id), "at": h.created_at.isoformat() + "Z"} for h in history],
        "editable": r.status not in LOCKED_STATUSES,
    }


# ---------- folio operations ----------
@router.post("/{reservation_id}/charges", status_code=201)
async def add_charge(reservation_id: int, data: ChargeIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    r = await _reservation(reservation_id, current_user, db)
    _editable(r)
    await _nights(r, db)
    amount = data.quantity * data.unit_amount - data.discount
    db.add(FolioCharge(property_id=r.property_id, reservation_id=r.id, posted_on=data.posted_on or date.today(), category=data.category,
                       reference=data.reference, description=data.description, quantity=data.quantity, unit_amount=data.unit_amount,
                       discount=data.discount, amount=amount, tax_inclusive=data.tax_inclusive, posted_by_user_id=current_user.id))
    await db.flush()
    await _recalculate_total(r, db)
    await record_history(db, r, current_user, "charge_added", f"{data.category}: {_money(amount)}")
    await db.commit()
    return {"message": "Charge added", "total_amount": r.total_amount}


@router.post("/{reservation_id}/charges/{charge_id}/void")
async def void_charge(reservation_id: int, charge_id: int, data: VoidIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    r = await _reservation(reservation_id, current_user, db)
    _editable(r)
    charge = await db.scalar(select(FolioCharge).where(FolioCharge.id == charge_id, FolioCharge.reservation_id == r.id))
    if charge is None:
        raise HTTPException(404, "Charge not found")
    if charge.is_void:
        raise HTTPException(409, "This charge is already void")
    charge.is_void, charge.void_reason = True, data.reason
    await db.flush()
    await _recalculate_total(r, db)
    await record_history(db, r, current_user, "charge_voided", f"{charge.category} {_money(charge.amount)} — {data.reason}")
    await db.commit()
    return {"message": "Transaction voided", "total_amount": r.total_amount}


@router.post("/{reservation_id}/discount", status_code=201)
async def apply_discount(reservation_id: int, data: DiscountIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    r = await _reservation(reservation_id, current_user, db)
    _editable(r)
    await _nights(r, db)
    await _recalculate_total(r, db)
    if data.amount > (r.total_amount or 0):
        raise HTTPException(422, "Discount cannot exceed the folio total")
    db.add(FolioCharge(property_id=r.property_id, reservation_id=r.id, posted_on=date.today(), category="Discount", description=data.reason,
                       quantity=1, unit_amount=data.amount, amount=-data.amount, posted_by_user_id=current_user.id))
    await db.flush()
    await _recalculate_total(r, db)
    await record_history(db, r, current_user, "discount_applied", f"{_money(data.amount)} — {data.reason}")
    await db.commit()
    return {"message": "Discount applied", "total_amount": r.total_amount}


@router.post("/{reservation_id}/folio-payments", status_code=201)
async def add_payment(reservation_id: int, data: PaymentIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    """Add Payment / settle part of the bill before check-out."""
    r = await _reservation(reservation_id, current_user, db)
    _editable(r)
    if data.payment_method not in PAYMENT_METHODS:
        raise HTTPException(422, "Invalid payment method")
    await _nights(r, db)
    await _recalculate_total(r, db)
    balance = (r.total_amount or 0) - await _paid(r, db)
    if data.amount > balance:
        raise HTTPException(422, f"Payment exceeds the balance due ({_money(max(balance, 0))})")
    db.add(Payment(property_id=r.property_id, reservation_id=r.id, amount=data.amount, payment_method=data.payment_method,
                   reference_number=data.reference_number or None, notes=data.notes or None, received_by_user_id=current_user.id))
    await record_history(db, r, current_user, "payment_received", f"{_money(data.amount)} by {METHOD_LABELS.get(data.payment_method, data.payment_method)}")
    await db.commit()
    return {"message": "Payment added", "balance": balance - data.amount}


@router.post("/{reservation_id}/amend-stay")
async def amend_stay(reservation_id: int, data: AmendStayIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    """Extend or shorten the stay (eZee: More Options → Amend Stay)."""
    r = await _reservation(reservation_id, current_user, db)
    _editable(r)
    nights = await _nights(r, db)
    new_in = data.check_in_date or r.check_in_date
    if r.status == "checked_in" and new_in != r.check_in_date:
        raise HTTPException(409, "Arrival date cannot change after check-in")
    if data.check_out_date <= new_in:
        raise HTTPException(422, "Departure must be after arrival")
    await ensure_room_is_available(property_id=r.property_id, room_number=r.room_number, check_in_date=new_in,
                                   check_out_date=data.check_out_date, db=db, excluding_reservation_id=r.id)
    wanted = set(_stay_dates(new_in, data.check_out_date))
    by_date = {n.stay_date: n for n in nights}
    template = nights[-1] if nights else None
    default_rate = data.override_rate if data.override_rate is not None else (template.rate if template else (r.nightly_rate or 0) * (r.rooms_count or 1))
    await db.execute(delete(ReservationNight).where(ReservationNight.reservation_id == r.id, ReservationNight.stay_date.not_in(wanted)))
    for stay_date in sorted(wanted - by_date.keys()):
        db.add(ReservationNight(property_id=r.property_id, reservation_id=r.id, stay_date=stay_date,
                                room_number=r.room_number, room_category=r.room_category, rate_plan=r.rate_plan,
                                adults=r.adults, children=r.children, rate=default_rate))
    if data.override_rate is not None:
        for night in nights:
            if night.stay_date in wanted:
                night.rate = data.override_rate
    old = f"{r.check_in_date:%d %b}–{r.check_out_date:%d %b}"
    r.check_in_date, r.check_out_date = new_in, data.check_out_date
    await db.flush()
    await _recalculate_total(r, db)
    await record_history(db, r, current_user, "stay_amended", f"{old} → {new_in:%d %b}–{data.check_out_date:%d %b} ({len(wanted)} nights)")
    await db.commit()
    return {"message": "Stay amended", "total_amount": r.total_amount}


@router.post("/{reservation_id}/room-move")
async def room_move(reservation_id: int, data: RoomMoveIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    """Move / upgrade the guest to another room for the rest of the stay."""
    r = await _reservation(reservation_id, current_user, db)
    _editable(r)
    room = await db.scalar(select(Room).where(Room.property_id == r.property_id, Room.room_number == data.room_number, Room.is_active.is_(True)))
    if room is None:
        raise HTTPException(404, "Room not found")
    if room.room_category != data.room_category:
        raise HTTPException(422, f"Room {room.room_number} is a {room.room_category} room")
    if room.room_number == r.room_number:
        raise HTTPException(422, "The guest is already in this room")
    start = max(date.today(), r.check_in_date) if r.status == "checked_in" else r.check_in_date
    if start >= r.check_out_date:
        raise HTTPException(409, "No nights left to move")
    await ensure_room_is_available(property_id=r.property_id, room_number=data.room_number, check_in_date=start,
                                   check_out_date=r.check_out_date, db=db, excluding_reservation_id=r.id)
    nights = await _nights(r, db)
    for night in nights:
        if night.stay_date >= start:
            night.room_number, night.room_category = data.room_number, data.room_category
            if data.override_rate is not None:
                night.rate = data.override_rate
    old = r.room_number or "unassigned"
    r.room_number, r.room_category = data.room_number, data.room_category
    await db.flush()
    await _recalculate_total(r, db)
    await record_history(db, r, current_user, "room_moved", f"Room {old} → {data.room_number} ({data.room_category}) from {start:%d %b}" + (f" — {data.reason}" if data.reason else ""))
    await db.commit()
    return {"message": "Room moved", "total_amount": r.total_amount}


@router.post("/{reservation_id}/nights/update")
async def update_nights(reservation_id: int, data: NightsUpdateIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    """Room Charges → Update Details: change rate, rate plan or adults/children on selected nights or the whole stay."""
    r = await _reservation(reservation_id, current_user, db)
    _editable(r)
    nights = await _nights(r, db)
    whole_stay = not data.dates
    selected = nights if whole_stay else [n for n in nights if n.stay_date in set(data.dates)]
    if not selected:
        raise HTTPException(422, "Select at least one night")
    changes = []
    for night in selected:
        if data.rate is not None: night.rate = data.rate
        if data.adults is not None: night.adults = data.adults
        if data.children is not None: night.children = data.children
        if data.rate_plan: night.rate_plan = data.rate_plan
        if data.complimentary is not None: night.complimentary = data.complimentary
    if data.rate is not None: changes.append(f"rate {_money(data.rate)}")
    if data.adults is not None or data.children is not None: changes.append(f"pax {data.adults if data.adults is not None else '-'}/{data.children if data.children is not None else '-'}")
    if data.rate_plan: changes.append(f"rate plan {data.rate_plan}")
    if data.complimentary is not None: changes.append("complimentary" if data.complimentary else "chargeable")
    # Keep the booking-level fields in step when the change covers the whole stay.
    if whole_stay:
        if data.adults is not None: r.adults = data.adults
        if data.children is not None: r.children = data.children
        if data.rate_plan: r.rate_plan = data.rate_plan
        if data.rate is not None: r.nightly_rate = data.rate // max(r.rooms_count or 1, 1)
    await db.flush()
    await _recalculate_total(r, db)
    scope = "whole stay" if whole_stay else ", ".join(f"{n.stay_date:%d %b}" for n in selected)
    await record_history(db, r, current_user, "charges_updated", f"{'; '.join(changes) or 'no change'} on {scope}")
    await db.commit()
    return {"message": "Changes updated successfully", "total_amount": r.total_amount}


@router.post("/{reservation_id}/shift")
async def shift_stay(reservation_id: int, data: ShiftStayIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    """Move the whole stay to new dates, keeping its length and each night's room, pax and rate (calendar drag & drop)."""
    r = await _reservation(reservation_id, current_user, db)
    _editable(r)
    if r.status == "checked_in":
        raise HTTPException(409, "The guest is already checked in — use Amend Stay to change the departure date")
    delta = (data.check_in_date - r.check_in_date).days
    if delta == 0:
        return {"message": "No change", "check_in_date": r.check_in_date.isoformat(), "check_out_date": r.check_out_date.isoformat()}
    if data.check_in_date < date.today():
        raise HTTPException(422, "A booking cannot be moved into the past")
    new_out = r.check_out_date + timedelta(days=delta)
    await ensure_room_is_available(property_id=r.property_id, room_number=r.room_number, check_in_date=data.check_in_date,
                                   check_out_date=new_out, db=db, excluding_reservation_id=r.id)
    nights = await _nights(r, db)
    snapshot = [(n.stay_date + timedelta(days=delta), n.room_number, n.room_category, n.rate_plan, n.adults, n.children, n.rate, n.complimentary) for n in nights]
    # Re-create the night rows on the new dates (avoids clashing with the one-row-per-date rule mid-update).
    await db.execute(delete(ReservationNight).where(ReservationNight.reservation_id == r.id))
    await db.flush()
    for stay_date, room_number, room_category, rate_plan, adults, children, rate, complimentary in snapshot:
        db.add(ReservationNight(property_id=r.property_id, reservation_id=r.id, stay_date=stay_date, room_number=room_number,
                                room_category=room_category, rate_plan=rate_plan, adults=adults, children=children, rate=rate, complimentary=complimentary))
    old = f"{r.check_in_date:%d %b}–{r.check_out_date:%d %b}"
    r.check_in_date, r.check_out_date = data.check_in_date, new_out
    await db.flush()
    await _recalculate_total(r, db)
    await record_history(db, r, current_user, "stay_shifted", f"{old} → {r.check_in_date:%d %b}–{r.check_out_date:%d %b} (moved on calendar)")
    await db.commit()
    return {"message": "Stay moved", "check_in_date": r.check_in_date.isoformat(), "check_out_date": r.check_out_date.isoformat(), "total_amount": r.total_amount}
