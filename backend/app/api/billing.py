from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.reservation import Payment, Reservation
from app.models.user import User
from app.schemas.billing import BillTotalUpdate, PaymentCreate, PaymentResponse

router = APIRouter(prefix="/billing", tags=["Billing"])
PAYMENT_METHODS = {"cash", "upi", "card", "bank_transfer", "other"}


def as_billing_reservation(reservation: Reservation, payments: list[Payment]):
    paid_amount = sum(payment.amount for payment in payments)
    total_amount = reservation.total_amount or 0
    balance_amount = max(total_amount - paid_amount, 0)
    payment_status = "paid" if total_amount > 0 and balance_amount == 0 else "partial" if paid_amount else "unpaid"
    return {"id": reservation.id, "reservation_code": reservation.reservation_code, "guest": reservation.guest,
            "room_number": reservation.room_number, "check_in_date": reservation.check_in_date.isoformat(),
            "check_out_date": reservation.check_out_date.isoformat(), "status": reservation.status,
            "total_amount": total_amount, "paid_amount": paid_amount, "balance_amount": balance_amount,
            "payment_status": payment_status, "payments": payments}


@router.get("")
async def list_billing_reservations(current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Reservation).options(selectinload(Reservation.guest)).where(
        Reservation.property_id == current_user.property_id, Reservation.status.not_in(["cancelled", "no_show"])
    ).order_by(Reservation.check_in_date.desc()))
    reservations = result.scalars().all()
    if not reservations:
        return []
    payment_result = await db.execute(select(Payment).where(Payment.property_id == current_user.property_id,
        Payment.reservation_id.in_([reservation.id for reservation in reservations])).order_by(Payment.received_at.desc()))
    grouped: dict[int, list[Payment]] = {}
    for payment in payment_result.scalars().all():
        grouped.setdefault(payment.reservation_id, []).append(payment)
    return [as_billing_reservation(reservation, grouped.get(reservation.id, [])) for reservation in reservations]


@router.post("/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_payment(data: PaymentCreate, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    if data.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=422, detail="Invalid payment method")
    reservation = await db.scalar(select(Reservation).where(Reservation.id == data.reservation_id,
        Reservation.property_id == current_user.property_id))
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if reservation.status in {"cancelled", "no_show", "checked_out"}:
        raise HTTPException(status_code=409, detail="Payments cannot be recorded for this reservation")
    paid_amount = await db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.property_id == current_user.property_id, Payment.reservation_id == reservation.id))
    if reservation.total_amount is None or reservation.total_amount <= 0:
        raise HTTPException(status_code=422, detail="Set a total bill amount before recording a payment")
    if paid_amount + data.amount > reservation.total_amount:
        raise HTTPException(status_code=422, detail="Payment exceeds the outstanding balance")
    payment = Payment(property_id=current_user.property_id, received_by_user_id=current_user.id, **data.model_dump())
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment


@router.patch("/{reservation_id}/total")
async def set_bill_total(reservation_id: int, data: BillTotalUpdate, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    reservation = await db.scalar(select(Reservation).where(Reservation.id == reservation_id,
        Reservation.property_id == current_user.property_id))
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    paid_amount = await db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.property_id == current_user.property_id, Payment.reservation_id == reservation.id))
    if data.total_amount < paid_amount:
        raise HTTPException(status_code=422, detail="Total bill cannot be lower than payments already received")
    reservation.total_amount = data.total_amount
    await db.commit()
    return {"message": "Bill total updated"}
