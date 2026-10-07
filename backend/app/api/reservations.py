from datetime import date
from secrets import token_hex

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.reservation import Guest, Reservation
from app.models.reservation_history import ReservationHistory
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


def reservation_code(property_id: int) -> str:
    return f"RES-{property_id}-{date.today():%Y%m%d}-{token_hex(3).upper()}"


async def get_reservation_or_404(
    reservation_id: int, property_id: int, db: AsyncSession
) -> Reservation:
    result = await db.execute(
        select(Reservation)
        .options(selectinload(Reservation.guest))
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


@router.post("", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    data: ReservationCreate,
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    await ensure_room_is_available(
        property_id=current_user.property_id,
        room_number=data.room_number,
        check_in_date=data.check_in_date,
        check_out_date=data.check_out_date,
        db=db,
    )
    guest = Guest(property_id=current_user.property_id, **data.guest.model_dump())
    db.add(guest)
    await db.flush()
    reservation = Reservation(
        property_id=current_user.property_id,
        reservation_code=reservation_code(current_user.property_id),
        guest_id=guest.id,
        created_by_user_id=current_user.id,
        **data.model_dump(exclude={"guest"}),
    )
    db.add(reservation)
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
        .options(selectinload(Reservation.guest))
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
