from datetime import date, timedelta
from pathlib import Path
from secrets import token_hex

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.reservation import Reservation
from app.models.room import Room
from app.models.user import User
from app.schemas.room import RoomCreate, RoomResponse, RoomStatusItem, RoomStay

router = APIRouter(prefix="/rooms", tags=["Room Inventory"])
STATUSES = {"available", "reserved", "occupied", "dirty", "cleaning", "maintenance", "blocked"}
# Stays that hold a room: checked-in guests and bookings that have not arrived yet.
HOLDING_STATUSES = {"confirmed", "tentative", "waiting", "checked_in"}
ROOM_IMAGE_FOLDER = Path(__file__).resolve().parents[2] / "uploads" / "rooms"
ROOM_IMAGE_FOLDER.mkdir(parents=True, exist_ok=True)
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


async def _room_or_404(room_id: int, property_id: int, db: AsyncSession) -> Room:
    room = await db.scalar(select(Room).where(Room.id == room_id, Room.property_id == property_id, Room.is_active.is_(True)))
    if room is None:
        raise HTTPException(404, "Room not found")
    return room


async def _holding_reservations(property_id: int, db: AsyncSession, room_number: str | None = None) -> list[Reservation]:
    query = (
        select(Reservation).options(selectinload(Reservation.guest))
        .where(Reservation.property_id == property_id, Reservation.room_number.is_not(None),
               Reservation.status.in_(HOLDING_STATUSES), Reservation.check_out_date >= date.today())
        .order_by(Reservation.check_in_date)
    )
    if room_number is not None:
        query = query.where(Reservation.room_number == room_number)
    return list((await db.execute(query)).scalars())


def _apply(room: Room, data: RoomCreate) -> None:
    for key, value in data.model_dump(exclude={"amenities"}).items():
        setattr(room, key, value)
    room.amenities = ", ".join(data.amenities) or None
    room.capacity = data.max_adults + data.max_children


def _stay(reservation: Reservation) -> RoomStay:
    guest = reservation.guest
    return RoomStay(
        reservation_id=reservation.id, reservation_code=reservation.reservation_code,
        guest_name=f"{guest.first_name} {guest.last_name}".strip() if guest else "Guest",
        status=reservation.status, check_in_date=reservation.check_in_date, check_out_date=reservation.check_out_date,
    )


@router.get("", response_model=list[RoomResponse])
async def list_rooms(current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Room).where(Room.property_id == current_user.property_id, Room.is_active.is_(True)).order_by(Room.room_number))
    return result.scalars().all()


@router.get("/status", response_model=list[RoomStatusItem])
async def room_status(current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    """Every active room with its live status for today, worked out from the room master and its bookings."""
    today = date.today()
    rooms = (await db.execute(select(Room).where(Room.property_id == current_user.property_id, Room.is_active.is_(True)).order_by(Room.floor, Room.room_number))).scalars().all()
    by_room: dict[str, list[Reservation]] = {}
    for reservation in await _holding_reservations(current_user.property_id, db):
        by_room.setdefault(reservation.room_number, []).append(reservation)
    items = []
    for room in rooms:
        stays = by_room.get(room.room_number, [])
        current = next((r for r in stays if r.status == "checked_in"), None) or next(
            (r for r in stays if r.status == "confirmed" and r.check_in_date <= today < r.check_out_date), None)
        upcoming = next((r for r in stays if r is not current and r.status != "checked_in" and r.check_in_date > today), None)
        if room.status in {"maintenance", "blocked"}:
            live = room.status
        elif current is not None and current.status == "checked_in":
            live = "occupied"
        elif room.status in {"dirty", "cleaning"}:
            live = "cleaning"
        elif current is not None:
            live = "reserved"
        else:
            live = "available"
        items.append(RoomStatusItem(
            **RoomResponse.model_validate(room).model_dump(), live_status=live,
            current_stay=_stay(current) if current else None, next_stay=_stay(upcoming) if upcoming else None,
        ))
    return items


@router.get("/availability")
async def availability_by_category(
    check_in_date: date, check_out_date: date, adults: int = Query(default=1, ge=1, le=20), children: int = Query(default=0, ge=0, le=20),
    current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db),
):
    """Room check for a walk-in or phone enquiry: every category with what is free for these dates and this party."""
    if check_out_date <= check_in_date:
        raise HTTPException(422, "Check-out must be after check-in")
    booked = set((await db.execute(select(Reservation.room_number).where(
        Reservation.property_id == current_user.property_id, Reservation.room_number.is_not(None),
        Reservation.status.in_(HOLDING_STATUSES), Reservation.check_in_date < check_out_date, Reservation.check_out_date > check_in_date,
    ))).scalars())
    rooms = (await db.execute(select(Room).where(Room.property_id == current_user.property_id, Room.is_active.is_(True)).order_by(Room.room_number))).scalars().all()
    categories: dict[str, dict] = {}
    for room in rooms:
        group = categories.setdefault(room.room_category, {"category": room.room_category, "total_rooms": 0, "available_rooms": 0, "ready_now": 0,
                                                            "being_cleaned": 0, "out_of_order": 0, "fits_party": False, "rooms": []})
        group["total_rooms"] += 1
        out_of_order = room.status in {"maintenance", "blocked"}
        fits = room.max_adults >= adults and room.capacity >= adults + children
        free = room.room_number not in booked and not out_of_order
        group["fits_party"] = group["fits_party"] or fits
        if out_of_order:
            group["out_of_order"] += 1
        if free and fits:
            group["available_rooms"] += 1
            if room.status in {"dirty", "cleaning"}:
                group["being_cleaned"] += 1
            else:
                group["ready_now"] += 1
        group["rooms"].append({**RoomResponse.model_validate(room).model_dump(), "is_free": free, "fits_party": fits})
    # For a sold-out type, find the nearest stay of the same length (before or after, never in the past) that has a room.
    nights = (check_out_date - check_in_date).days
    window = 21
    stays = (await db.execute(select(Reservation.room_number, Reservation.check_in_date, Reservation.check_out_date).where(
        Reservation.property_id == current_user.property_id, Reservation.room_number.is_not(None), Reservation.status.in_(HOLDING_STATUSES),
        Reservation.check_in_date < check_out_date + timedelta(days=window), Reservation.check_out_date > check_in_date - timedelta(days=window),
    ))).all()
    by_room: dict[str, list[tuple[date, date]]] = {}
    for number, start, end in stays:
        by_room.setdefault(number, []).append((start, end))

    def free_rooms(group: dict, start: date) -> list[str]:
        end = start + timedelta(days=nights)
        return [room["room_number"] for room in group["rooms"]
                if room["fits_party"] and room["status"] not in {"maintenance", "blocked"}
                and all(not (s < end and e > start) for s, e in by_room.get(room["room_number"], []))]

    for group in categories.values():
        group["next_available"] = None
        if group["available_rooms"] or not group["fits_party"]:
            continue
        for step in range(1, window + 1):
            for start in (check_in_date + timedelta(days=step), check_in_date - timedelta(days=step)):
                if start < date.today():
                    continue
                numbers = free_rooms(group, start)
                if numbers:
                    group["next_available"] = {"check_in_date": start, "check_out_date": start + timedelta(days=nights), "rooms": numbers}
                    break
            if group["next_available"]:
                break

    result = []
    for group in categories.values():
        rates = [room["base_rate"] for room in group["rooms"] if room["base_rate"] is not None]
        group["rate_from"], group["rate_to"] = (min(rates), max(rates)) if rates else (None, None)
        group["max_guests"] = max(room["capacity"] for room in group["rooms"])
        group["image_url"] = next((room["image_url"] for room in group["rooms"] if room["image_url"]), None)
        amenities: list[str] = []
        for room in group["rooms"]:
            amenities += [item for item in room["amenities"] if item not in amenities]
        group["amenities"] = amenities[:8]
        result.append(group)
    return sorted(result, key=lambda group: (-group["available_rooms"], group["rate_from"] or 0))


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(data: RoomCreate, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    if data.status not in STATUSES:
        raise HTTPException(422, "Invalid room status")
    existing = await db.scalar(select(Room).where(Room.property_id == current_user.property_id, Room.room_number == data.room_number))
    if existing is not None and existing.is_active:
        raise HTTPException(409, "Room number already exists")
    # A removed room keeps its number reserved by the unique constraint, so bring it back instead.
    room = existing or Room(property_id=current_user.property_id)
    _apply(room, data)
    room.is_active = True
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return room


@router.patch("/{room_id}", response_model=RoomResponse)
async def update_room(room_id: int, data: RoomCreate, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    room = await _room_or_404(room_id, current_user.property_id, db)
    if data.status not in STATUSES:
        raise HTTPException(422, "Invalid room status")
    if data.room_number != room.room_number:
        taken = await db.scalar(select(Room.id).where(Room.property_id == current_user.property_id, Room.room_number == data.room_number, Room.id != room.id))
        if taken:
            raise HTTPException(409, "Room number already exists")
        if await _holding_reservations(current_user.property_id, db, room.room_number):
            raise HTTPException(409, "This room has current or upcoming bookings; move them before renumbering it")
    _apply(room, data)
    await db.commit()
    await db.refresh(room)
    return room


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_room(room_id: int, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    room = await _room_or_404(room_id, current_user.property_id, db)
    if await _holding_reservations(current_user.property_id, db, room.room_number):
        raise HTTPException(409, "This room has current or upcoming bookings and cannot be removed")
    room.is_active = False
    await db.commit()


@router.post("/{room_id}/image", response_model=RoomResponse)
async def upload_room_image(room_id: int, image: UploadFile = File(...), current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    room = await _room_or_404(room_id, current_user.property_id, db)
    suffix = Path(image.filename or "photo").suffix.lower()
    if suffix not in IMAGE_SUFFIXES:
        raise HTTPException(422, "Upload a JPG, PNG or WebP photo")
    contents = await image.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(422, "Room photo must be 5 MB or smaller")
    filename = f"room-{room.property_id}-{room.id}-{token_hex(6)}{suffix}"
    (ROOM_IMAGE_FOLDER / filename).write_bytes(contents)
    if room.image_url:
        (ROOM_IMAGE_FOLDER / Path(room.image_url).name).unlink(missing_ok=True)
    room.image_url = f"/media/rooms/{filename}"
    await db.commit()
    await db.refresh(room)
    return room
