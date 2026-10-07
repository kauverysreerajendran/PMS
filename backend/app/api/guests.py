from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.reservation import Guest, Reservation
from app.models.user import User
from app.schemas.reservation import GuestCreate

router = APIRouter(prefix="/guests", tags=["Guests"])

async def get_guest_or_404(guest_id: int, property_id: int, db: AsyncSession) -> Guest:
    guest = await db.scalar(select(Guest).where(Guest.id == guest_id, Guest.property_id == property_id))
    if guest is None:
        raise HTTPException(status_code=404, detail="Guest not found")
    return guest

@router.get("")
async def list_guests(current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Guest).where(Guest.property_id == current_user.property_id).order_by(Guest.updated_at.desc()))
    return result.scalars().all()

@router.get("/{guest_id}")
async def get_guest_profile(guest_id: int, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    guest = await get_guest_or_404(guest_id, current_user.property_id, db)
    result = await db.execute(select(Reservation).where(Reservation.guest_id == guest.id, Reservation.property_id == current_user.property_id).order_by(Reservation.check_in_date.desc()))
    return {"guest": guest, "stays": result.scalars().all()}

@router.patch("/{guest_id}")
async def update_guest(guest_id: int, data: GuestCreate, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    guest = await get_guest_or_404(guest_id, current_user.property_id, db)
    for field, value in data.model_dump().items():
        setattr(guest, field, value)
    await db.commit()
    await db.refresh(guest)
    return guest
