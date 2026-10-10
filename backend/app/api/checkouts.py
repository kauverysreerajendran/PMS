from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.api.housekeeping import open_cleaning_task
from app.models.reservation import CheckIn, CheckOut, Payment, Reservation
from app.models.room import Room
from app.models.user import User
from app.schemas.checkout import (
    CheckOutCreate,
    CheckOutResponse,
    PendingCheckOutListResponse,
)

router = APIRouter(prefix="/check-outs", tags=["Check-Out"])
PAYMENT_METHODS = {"cash", "upi", "card", "bank_transfer", "other"}


async def get_checkout_or_404(
    checkout_id: int, property_id: int, db: AsyncSession
) -> CheckOut:
    result = await db.execute(
        select(CheckOut)
        .options(selectinload(CheckOut.guest))
        .where(CheckOut.id == checkout_id, CheckOut.property_id == property_id)
    )
    checkout = result.scalar_one_or_none()
    if checkout is None:
        raise HTTPException(status_code=404, detail="Check-out not found")
    return checkout


@router.get("/pending", response_model=PendingCheckOutListResponse)
async def list_pending_checkouts(
    departure_date: date = Query(default_factory=date.today),
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    filters = [
        Reservation.property_id == current_user.property_id,
        Reservation.check_out_date == departure_date,
        Reservation.status == "checked_in",
    ]
    total = await db.scalar(select(func.count(Reservation.id)).where(*filters))
    result = await db.execute(
        select(Reservation)
        .options(selectinload(Reservation.guest))
        .where(*filters)
        .order_by(Reservation.id)
    )
    return {"items": result.scalars().all(), "total": total or 0}


@router.post("", response_model=CheckOutResponse, status_code=status.HTTP_201_CREATED)
async def create_checkout(
    data: CheckOutCreate,
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    if data.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=422, detail="Invalid payment method")
    result = await db.execute(
        select(Reservation)
        .options(selectinload(Reservation.guest))
        .where(
            Reservation.id == data.reservation_id,
            Reservation.property_id == current_user.property_id,
        )
    )
    reservation = result.scalar_one_or_none()
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if reservation.status != "checked_in":
        raise HTTPException(
            status_code=409,
            detail=f"A {reservation.status} reservation cannot be checked out",
        )
    paid_amount = await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.property_id == current_user.property_id,
            Payment.reservation_id == reservation.id,
        )
    )
    if not reservation.total_amount or paid_amount < reservation.total_amount:
        raise HTTPException(
            status_code=422,
            detail="The guest's bill must be fully paid in Billing before checkout",
        )
    checkin = await db.scalar(
        select(CheckIn).where(
            CheckIn.reservation_id == reservation.id,
            CheckIn.property_id == current_user.property_id,
        )
    )
    if checkin is None:
        raise HTTPException(status_code=409, detail="The guest has not been checked in")
    duplicate = await db.scalar(
        select(CheckOut.id).where(CheckOut.reservation_id == reservation.id)
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409,
            detail="This reservation has already been checked out",
        )
    checkout = CheckOut(
        property_id=current_user.property_id,
        reservation_id=reservation.id,
        checkin_id=checkin.id,
        guest_id=reservation.guest_id,
        room_number=reservation.room_number or checkin.room_number,
        checked_out_by_user_id=current_user.id,
        **data.model_dump(exclude={"reservation_id"}),
    )
    reservation.status = "checked_out"
    db.add(checkout)
    # The room goes to housekeeping: dirty until a cleaner finishes and releases it.
    room = await db.scalar(select(Room).where(Room.property_id == current_user.property_id, Room.room_number == checkout.room_number, Room.is_active.is_(True)))
    if room is not None:
        await open_cleaning_task(db, room, reservation.id, current_user.id, notes=f"Departure clean after {reservation.reservation_code}")
    await db.commit()
    return await get_checkout_or_404(checkout.id, current_user.property_id, db)


@router.get("", response_model=list[CheckOutResponse])
async def list_checkouts(
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CheckOut)
        .options(selectinload(CheckOut.guest))
        .where(CheckOut.property_id == current_user.property_id)
        .order_by(CheckOut.checked_out_at.desc())
    )
    return result.scalars().all()
