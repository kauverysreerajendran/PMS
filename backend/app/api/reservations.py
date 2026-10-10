from datetime import date, datetime
from secrets import token_hex

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.reservation import GroupRoomBlock, Guest, Payment, PaymentMethod, RatePlan, Reservation
from app.models.room import Room
from app.models.reservation_history import ReservationHistory
from app.models.folio import FolioCharge, ReservationNight
from app.models.user import User
from app.schemas.reservation import (
    ReservationCancellation,
    ReservationCreate,
    ReservationListResponse,
    ReservationResponse,
    ReservationUpdate,
)

router = APIRouter(prefix="/reservations", tags=["Reservations"])

async def record_history(db: AsyncSession, reservation: Reservation, user: User, action: str, details: str | None = None):
    db.add(ReservationHistory(property_id=reservation.property_id, reservation_id=reservation.id, user_id=user.id, action=action, details=details))

ACTIVE_ROOM_STATUSES = {"confirmed", "checked_in"}
RESERVATION_STATUSES = {
    "confirmed", "tentative", "waiting", "cancelled", "checked_in", "checked_out", "no_show"
}


async def release_expired_holds(db: AsyncSession) -> None:
    """Release any reservation whose required advance was not received by its deadline."""
    result = await db.execute(select(Reservation).where(Reservation.release_at.is_not(None), Reservation.release_at <= datetime.utcnow(), Reservation.status.in_({"confirmed", "tentative", "waiting"})))
    changed = False
    for reservation in result.scalars():
        paid = await db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.reservation_id == reservation.id, Payment.property_id == reservation.property_id))
        if (paid or 0) < reservation.required_advance_amount:
            reservation.status = "cancelled"
            reservation.notes = f"{reservation.notes or ''}\nReleased automatically: required advance was not received by the release deadline.".strip()
            changed = True
    if changed:
        await db.commit()


def reservation_code(property_id: int) -> str:
    return f"RES-{property_id}-{date.today():%Y%m%d}-{token_hex(3).upper()}"


async def get_reservation_or_404(
    reservation_id: int, property_id: int, db: AsyncSession
) -> Reservation:
    result = await db.execute(
        select(Reservation)
        .options(selectinload(Reservation.guest), selectinload(Reservation.group_room_blocks))
        .where(
            Reservation.id == reservation_id,
            Reservation.property_id == property_id,
        )
    )
    reservation = result.scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    return reservation


async def ensure_room_is_available(
    *,
    property_id: int,
    room_number: str | None,
    check_in_date: date,
    check_out_date: date,
    db: AsyncSession,
    excluding_reservation_id: int | None = None,
) -> None:
    if not room_number:
        return
    query = select(Reservation.id).where(
        Reservation.property_id == property_id,
        Reservation.room_number == room_number,
        Reservation.status.in_(ACTIVE_ROOM_STATUSES),
        Reservation.check_in_date < check_out_date,
        Reservation.check_out_date > check_in_date,
    )
    if excluding_reservation_id is not None:
        query = query.where(Reservation.id != excluding_reservation_id)
    if (await db.execute(query)).scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail="The selected room is already reserved for these dates",
        )


async def ensure_group_blocks_available(property_id: int, blocks, check_in_date: date, check_out_date: date, db: AsyncSession) -> None:
    for block in blocks:
        physical_count = await db.scalar(select(func.count(Room.id)).where(Room.property_id == property_id, Room.is_active.is_(True), Room.status == "available", Room.room_category == block.room_category))
        held_count = await db.scalar(select(func.coalesce(func.sum(GroupRoomBlock.rooms_count), 0)).join(Reservation, GroupRoomBlock.reservation_id == Reservation.id).where(GroupRoomBlock.property_id == property_id, GroupRoomBlock.room_category == block.room_category, Reservation.status.in_(ACTIVE_ROOM_STATUSES), Reservation.check_in_date < check_out_date, Reservation.check_out_date > check_in_date))
        if (physical_count or 0) - (held_count or 0) < block.rooms_count:
            raise HTTPException(status_code=409, detail=f"Not enough {block.room_category} rooms available for this group stay")


@router.post("", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    data: ReservationCreate,
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    if data.is_group_booking:
        await ensure_group_blocks_available(current_user.property_id, data.room_blocks, data.check_in_date, data.check_out_date, db)
    await ensure_room_is_available(
        property_id=current_user.property_id,
        room_number=data.room_number,
        check_in_date=data.check_in_date,
        check_out_date=data.check_out_date,
        db=db,
    )
    guest = None
    if data.guest_id:
        guest = await db.scalar(select(Guest).where(Guest.id == data.guest_id, Guest.property_id == current_user.property_id))
        if guest is None: raise HTTPException(status_code=404, detail="Selected guest was not found")
        for field, value in data.guest.model_dump(exclude_none=True).items(): setattr(guest, field, value)
    if guest is None:
        guest = Guest(property_id=current_user.property_id, **data.guest.model_dump())
        db.add(guest)
        await db.flush()
    nights = (data.check_out_date - data.check_in_date).days
    room_charges = (
        sum((block.nightly_rate or 0) * nights * block.rooms_count for block in data.room_blocks)
        if data.is_group_booking
        else (data.nightly_rate or 0) * nights * data.rooms_count
    )
    total = room_charges + data.taxes_amount + data.additional_charges - data.discount_amount
    if data.advance_payment_amount > total: raise HTTPException(status_code=422, detail="Advance payment cannot exceed booking total")
    reservation = Reservation(
        property_id=current_user.property_id,
        reservation_code=reservation_code(current_user.property_id),
        guest_id=guest.id,
        created_by_user_id=current_user.id,
        total_amount=total,
        **data.model_dump(exclude={"guest", "guest_id", "room_blocks", "advance_payment_amount", "advance_payment_method", "advance_payment_reference"}),
    )
    db.add(reservation)
    await db.flush()
    for block in data.room_blocks:
        db.add(GroupRoomBlock(property_id=current_user.property_id, reservation_id=reservation.id, **block.model_dump()))
    if data.advance_payment_amount:
        db.add(Payment(property_id=current_user.property_id, reservation_id=reservation.id, amount=data.advance_payment_amount, payment_method=data.advance_payment_method or "", reference_number=data.advance_payment_reference or None, received_by_user_id=current_user.id, notes="Advance payment received at reservation"))
    await db.commit()
    return await get_reservation_or_404(reservation.id, current_user.property_id, db)


@router.get("", response_model=ReservationListResponse)
async def list_reservations(
    arrival_date: date | None = None,
    reservation_status: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=100),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    await release_expired_holds(db)
    filters = [Reservation.property_id == current_user.property_id]
    if arrival_date:
        filters.append(Reservation.check_in_date == arrival_date)
    if reservation_status:
        filters.append(Reservation.status == reservation_status)
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(
            Reservation.reservation_code.ilike(term),
            Guest.first_name.ilike(term),
            Guest.last_name.ilike(term),
            Guest.email.ilike(term),
            Guest.mobile.ilike(term),
        ))
    count = await db.scalar(
        select(func.count(Reservation.id)).join(Guest).where(*filters)
    )
    result = await db.execute(
        select(Reservation)
        .join(Guest)
        .options(selectinload(Reservation.guest), selectinload(Reservation.group_room_blocks))
        .where(*filters)
        .order_by(Reservation.check_in_date, Reservation.arrival_time, Reservation.id)
        .offset(offset)
        .limit(limit)
    )
    return {"items": result.scalars().all(), "total": count or 0}

@router.get("/history")
async def list_property_history(current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ReservationHistory).where(ReservationHistory.property_id == current_user.property_id).order_by(ReservationHistory.created_at.desc()).limit(50))
    return result.scalars().all()


@router.get("/calendar")
async def reservation_calendar(
    start: date,
    end: date,
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    """Every stay that overlaps [start, end), with what has been paid, for the booking calendar."""
    if end <= start:
        raise HTTPException(status_code=422, detail="end must be after start")
    if (end - start).days > 62:
        raise HTTPException(status_code=422, detail="Calendar range is limited to 62 days")
    result = await db.execute(
        select(Reservation)
        .options(selectinload(Reservation.guest))
        .where(
            Reservation.property_id == current_user.property_id,
            Reservation.check_in_date < end,
            Reservation.check_out_date > start,
        )
        .order_by(Reservation.check_in_date, Reservation.room_number, Reservation.id)
    )
    reservations = result.scalars().all()
    paid: dict[int, int] = {}
    if reservations:
        rows = await db.execute(
            select(Payment.reservation_id, func.coalesce(func.sum(Payment.amount), 0))
            .where(
                Payment.property_id == current_user.property_id,
                Payment.reservation_id.in_([r.id for r in reservations]),
            )
            .group_by(Payment.reservation_id)
        )
        paid = {reservation_id: int(total) for reservation_id, total in rows.all()}
    items = []
    for r in reservations:
        guest = r.guest
        total = r.total_amount or 0
        paid_amount = paid.get(r.id, 0)
        items.append({
            "id": r.id,
            "reservation_code": r.reservation_code,
            "status": r.status,
            "check_in_date": r.check_in_date.isoformat(),
            "check_out_date": r.check_out_date.isoformat(),
            "nights": (r.check_out_date - r.check_in_date).days,
            "arrival_time": r.arrival_time.isoformat() if r.arrival_time else None,
            "room_number": r.room_number,
            "room_category": r.room_category,
            "rooms_count": r.rooms_count,
            "adults": r.adults,
            "children": r.children,
            "rate_plan": r.rate_plan,
            "nightly_rate": r.nightly_rate,
            "taxes_amount": r.taxes_amount,
            "discount_amount": r.discount_amount,
            "additional_charges": r.additional_charges,
            "total_amount": r.total_amount,
            "paid_amount": paid_amount,
            "balance": max(total - paid_amount, 0),
            "source": r.source,
            "booking_source": r.booking_source,
            "special_requests": r.special_requests,
            "is_group_booking": r.is_group_booking,
            "group_name": r.group_name,
            "guest": {
                "first_name": guest.first_name if guest else "",
                "last_name": guest.last_name if guest else "",
                "email": guest.email if guest else None,
                "mobile": guest.mobile if guest else None,
                "nationality": guest.nationality if guest else None,
            },
        })
    return {"start": start.isoformat(), "end": end.isoformat(), "items": items}


@router.get("/configuration")
async def get_reservation_configuration(
    room_category: str | None = None,
    adults: int = Query(default=0, ge=0),
    children: int = Query(default=0, ge=0),
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    filters = [RatePlan.property_id == current_user.property_id, RatePlan.is_active.is_(True), RatePlan.adult_capacity >= adults, RatePlan.child_capacity >= children]
    if room_category:
        filters.append(RatePlan.room_category == room_category)
    plans = (await db.execute(select(RatePlan).where(*filters).order_by(RatePlan.name))).scalars().all()
    methods = (await db.execute(select(PaymentMethod).where(PaymentMethod.property_id == current_user.property_id, PaymentMethod.is_active.is_(True)).order_by(PaymentMethod.label))).scalars().all()
    return {
        "rate_plans": [{"id": plan.id, "name": plan.name, "room_category": plan.room_category, "nightly_rate": plan.nightly_rate} for plan in plans],
        "payment_methods": [{"code": method.code, "label": method.label} for method in methods],
    }


@router.get("/guests/search")
async def search_guests(query: str = Query(min_length=3, max_length=100), current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    term = f"%{query.strip()}%"
    result = await db.execute(select(Guest).where(Guest.property_id == current_user.property_id, or_(Guest.first_name.ilike(term), Guest.last_name.ilike(term), Guest.email.ilike(term), Guest.mobile.ilike(term))).order_by(Guest.updated_at.desc()).limit(8))
    return result.scalars().all()


@router.get("/availability")
async def room_availability(check_in_date: date, check_out_date: date, adults: int = Query(default=1, ge=1), current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    if check_out_date <= check_in_date:
        raise HTTPException(status_code=422, detail="check_out_date must be after check_in_date")
    occupied = select(Reservation.room_number).where(Reservation.property_id == current_user.property_id, Reservation.status.in_(ACTIVE_ROOM_STATUSES), Reservation.check_in_date < check_out_date, Reservation.check_out_date > check_in_date, Reservation.room_number.is_not(None))
    result = await db.execute(select(Room).where(Room.property_id == current_user.property_id, Room.is_active.is_(True), Room.status == "available", Room.capacity >= adults, Room.room_number.not_in(occupied)).order_by(Room.room_category, Room.room_number))
    groups: dict[str, list[str]] = {}
    for room in result.scalars(): groups.setdefault(room.room_category, []).append(room.room_number)
    return [{"room_category": category, "available_rooms": len(numbers), "room_numbers": numbers} for category, numbers in groups.items()]


@router.get("/{reservation_id}", response_model=ReservationResponse)
async def get_reservation(
    reservation_id: int,
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    return await get_reservation_or_404(reservation_id, current_user.property_id, db)


@router.patch("/{reservation_id}", response_model=ReservationResponse)
async def update_reservation(
    reservation_id: int,
    data: ReservationUpdate,
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    reservation = await get_reservation_or_404(
        reservation_id, current_user.property_id, db
    )
    changes = data.model_dump(exclude_unset=True)
    guest_changes = changes.pop("guest", None)
    room_blocks = changes.pop("room_blocks", None)
    # The edit form resends every field; keep only real changes so an unchanged
    # rate does not reset per-night folio rates.
    changes = {field: value for field, value in changes.items() if getattr(reservation, field, object()) != value}
    new_status = changes.get("status", reservation.status)
    if new_status not in RESERVATION_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid reservation status")
    new_check_in = changes.get("check_in_date", reservation.check_in_date)
    new_check_out = changes.get("check_out_date", reservation.check_out_date)
    if new_check_out <= new_check_in:
        raise HTTPException(
            status_code=422, detail="check_out_date must be after check_in_date"
        )
    new_room = changes.get("room_number", reservation.room_number)
    if new_status in ACTIVE_ROOM_STATUSES:
        await ensure_room_is_available(
            property_id=current_user.property_id,
            room_number=new_room,
            check_in_date=new_check_in,
            check_out_date=new_check_out,
            db=db,
            excluding_reservation_id=reservation.id,
        )
    for field, value in changes.items():
        setattr(reservation, field, value)
    if guest_changes is not None:
        for field, value in guest_changes.items():
            setattr(reservation.guest, field, value)
    if room_blocks is not None:
        await db.execute(delete(GroupRoomBlock).where(GroupRoomBlock.reservation_id == reservation.id))
        for block in room_blocks:
            db.add(GroupRoomBlock(property_id=current_user.property_id, reservation_id=reservation.id, **block))
    if any(field in changes for field in {"check_in_date", "check_out_date", "nightly_rate", "rooms_count", "taxes_amount", "discount_amount", "additional_charges", "is_group_booking"}) or room_blocks is not None:
        nights = (reservation.check_out_date - reservation.check_in_date).days
        if reservation.is_group_booking:
            blocks_for_total = room_blocks if room_blocks is not None else [
                {"nightly_rate": block.nightly_rate, "rooms_count": block.rooms_count}
                for block in reservation.group_room_blocks
            ]
            room_charges = sum((block.get("nightly_rate") or 0) * nights * block["rooms_count"] for block in blocks_for_total)
        else:
            room_charges = (reservation.nightly_rate or 0) * nights * reservation.rooms_count
        # Folio charges posted from the guest folio stay part of the bill.
        extras = await db.scalar(select(func.coalesce(func.sum(FolioCharge.amount), 0)).where(
            FolioCharge.reservation_id == reservation.id, FolioCharge.is_void.is_(False)))
        reservation.total_amount = room_charges + reservation.taxes_amount + reservation.additional_charges - reservation.discount_amount + int(extras or 0)
        # Per-night folio rows are rebuilt from the new pricing next time the folio opens.
        await db.execute(delete(ReservationNight).where(ReservationNight.reservation_id == reservation.id))
    elif any(field in changes for field in {"room_number", "room_category", "rate_plan", "adults", "children"}):
        for night in (await db.execute(select(ReservationNight).where(ReservationNight.reservation_id == reservation.id))).scalars():
            night.room_number, night.room_category, night.rate_plan = reservation.room_number, reservation.room_category, reservation.rate_plan
            night.adults, night.children = reservation.adults, reservation.children
    await record_history(db, reservation, current_user, "modified", ", ".join(changes.keys()))
    await db.commit()
    return await get_reservation_or_404(reservation.id, current_user.property_id, db)


@router.post("/{reservation_id}/cancel", response_model=ReservationResponse)
async def cancel_reservation(
    reservation_id: int,
    data: ReservationCancellation,
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    reservation = await get_reservation_or_404(
        reservation_id, current_user.property_id, db
    )
    if reservation.status in {"checked_in", "checked_out", "cancelled"}:
        raise HTTPException(
            status_code=409,
            detail=f"A {reservation.status} reservation cannot be cancelled",
        )
    reservation.status = "cancelled"
    if data.reason:
        note = f"Cancellation reason: {data.reason.strip()}"
        reservation.notes = f"{reservation.notes}\n{note}".strip() if reservation.notes else note
    await record_history(db, reservation, current_user, "cancelled", data.reason)
    await db.commit()
    return await get_reservation_or_404(reservation.id, current_user.property_id, db)

@router.post("/{reservation_id}/no-show", response_model=ReservationResponse)
async def mark_no_show(reservation_id: int, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    reservation = await get_reservation_or_404(reservation_id, current_user.property_id, db)
    if reservation.status not in {"confirmed", "tentative", "waiting"}:
        raise HTTPException(409, f"A {reservation.status} reservation cannot be marked as no-show")
    reservation.status = "no_show"
    await record_history(db, reservation, current_user, "no_show", "Reservation marked as no-show")
    await db.commit()
    return await get_reservation_or_404(reservation.id, current_user.property_id, db)

@router.get("/{reservation_id}/history")
async def get_history(reservation_id: int, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    reservation = await get_reservation_or_404(reservation_id, current_user.property_id, db)
    result = await db.execute(select(ReservationHistory).where(ReservationHistory.reservation_id == reservation.id, ReservationHistory.property_id == current_user.property_id).order_by(ReservationHistory.created_at.desc()))
    return result.scalars().all()
