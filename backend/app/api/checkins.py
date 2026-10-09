from datetime import date
from pathlib import Path
from secrets import token_hex

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.reservation import CheckIn, Reservation
from app.models.user import User
from app.schemas.checkin import (
    CheckInCreate,
    CheckInResponse,
    PendingCheckInListResponse,
    PendingCheckInResponse,
)

router = APIRouter(prefix="/check-ins", tags=["Check-In"])
CHECK_IN_ELIGIBLE_STATUSES = {"confirmed", "tentative", "waiting"}
VERIFICATION_STATUSES = {"pending", "verified", "not_required"}


def folio_number(property_id: int) -> str:
    return f"FOL-{property_id}-{date.today():%Y%m%d}-{token_hex(3).upper()}"


async def get_checkin_or_404(
    checkin_id: int, property_id: int, db: AsyncSession
) -> CheckIn:
    result = await db.execute(
        select(CheckIn)
        .options(selectinload(CheckIn.guest))
        .where(CheckIn.id == checkin_id, CheckIn.property_id == property_id)
    )
    checkin = result.scalar_one_or_none()
    if checkin is None:
        raise HTTPException(status_code=404, detail="Check-in not found")
    return checkin


@router.get("/pending", response_model=PendingCheckInListResponse)
async def list_pending_checkins(
    arrival_date: date = Query(default_factory=date.today),
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    filters = [
        Reservation.property_id == current_user.property_id,
        Reservation.check_in_date == arrival_date,
        Reservation.status.in_(CHECK_IN_ELIGIBLE_STATUSES),
    ]
    total = await db.scalar(select(func.count(Reservation.id)).where(*filters))
    result = await db.execute(
        select(Reservation)
        .options(selectinload(Reservation.guest))
        .where(*filters)
        .order_by(Reservation.arrival_time, Reservation.id)
    )
    return {"items": result.scalars().all(), "total": total or 0}


@router.post("", response_model=CheckInResponse, status_code=status.HTTP_201_CREATED)
async def create_checkin(
    data: CheckInCreate,
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    if data.verification_status not in VERIFICATION_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid verification status")
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
    if reservation.status not in CHECK_IN_ELIGIBLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"A {reservation.status} reservation cannot be checked in",
        )
    if reservation.check_in_date > date.today():
        raise HTTPException(
            status_code=409,
            detail="A guest cannot be checked in before the scheduled arrival date",
        )
    if not reservation.room_number:
        raise HTTPException(
            status_code=409,
            detail="Assign a room before checking in the guest",
        )
    if not reservation.guest.identity_document_path or not reservation.guest.identity_type or not reservation.guest.identity_number:
        raise HTTPException(status_code=409, detail="Upload the guest identity document and record its type and number before check-in")
    if data.verification_status != "verified":
        raise HTTPException(status_code=409, detail="Verify the uploaded guest identity document before check-in")
    duplicate = await db.scalar(
        select(CheckIn.id).where(CheckIn.reservation_id == reservation.id)
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409,
            detail="This reservation has already been checked in",
        )
    checkin = CheckIn(
        property_id=current_user.property_id,
        reservation_id=reservation.id,
        guest_id=reservation.guest_id,
        room_number=reservation.room_number,
        folio_number=folio_number(current_user.property_id),
        checked_in_by_user_id=current_user.id,
        **data.model_dump(exclude={"reservation_id"}),
    )
    reservation.status = "checked_in"
    db.add(checkin)
    await db.commit()
    return await get_checkin_or_404(checkin.id, current_user.property_id, db)


@router.post("/{reservation_id}/identity-document")
async def upload_identity_document(
    reservation_id: int,
    document_type: str = Query(min_length=2, max_length=50),
    document_number: str = Query(min_length=2, max_length=100),
    nationality: str | None = Query(default=None, max_length=100),
    document: UploadFile = File(...),
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    reservation = await db.scalar(select(Reservation).options(selectinload(Reservation.guest)).where(Reservation.id == reservation_id, Reservation.property_id == current_user.property_id))
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    suffix = Path(document.filename or "document").suffix.lower()
    if suffix not in {".pdf", ".jpg", ".jpeg", ".png"}:
        raise HTTPException(status_code=422, detail="Upload a PDF, JPG, or PNG identity document")
    folder = Path(__file__).resolve().parents[2] / "uploads" / "identity"
    folder.mkdir(parents=True, exist_ok=True)
    filename = f"guest-{reservation.guest_id}-{token_hex(8)}{suffix}"
    destination = folder / filename
    contents = await document.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=422, detail="Identity document must be 5 MB or smaller")
    destination.write_bytes(contents)
    reservation.guest.identity_document_path = str(destination)
    reservation.guest.identity_type = document_type.strip()
    reservation.guest.identity_number = document_number.strip()
    reservation.guest.nationality = nationality.strip() if nationality else None
    await db.commit()
    return {"message": "Identity document uploaded", "document_path": str(destination)}


@router.get("", response_model=list[CheckInResponse])
async def list_checkins(
    current_user: User = Depends(get_front_office_manager),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CheckIn)
        .options(selectinload(CheckIn.guest))
        .where(CheckIn.property_id == current_user.property_id)
        .order_by(CheckIn.checked_in_at.desc())
    )
    return result.scalars().all()
