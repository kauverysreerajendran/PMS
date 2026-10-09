import re
import secrets
from collections import Counter
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_current_user
from app.core.security import create_access_token
from app.db.database import get_db
from app.models.reservation import CheckIn, CheckOut, Payment, Reservation
from app.models.reservation_history import ReservationHistory
from app.models.room import Room
from app.models.user import Property, User

router = APIRouter(prefix="/properties", tags=["Properties"])


class PropertyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    property_code: str | None = Field(default=None, max_length=50)


class LogoUpdate(BaseModel):
    # Data URL of the image, or null to remove the logo.
    logo: str | None = Field(default=None, max_length=700_000)


# Roles that manage a hotel day to day (same provisions inside the hotel they are viewing).
MANAGER_ROLES = {"owner", "front_office_manager"}
STAFF_ROLES = {"front_office_manager", "front_desk_agent"}


class StaffAssign(BaseModel):
    identifier: str = Field(min_length=1, max_length=150)  # username or email


LOGO_PATTERN = re.compile(r"^data:image/(png|jpeg|webp|svg\+xml|gif);base64,[A-Za-z0-9+/=]+$")


def _property_out(property_obj: Property) -> dict:
    return {
        "id": property_obj.id,
        "property_code": property_obj.property_code,
        "name": property_obj.name,
        "logo_url": property_obj.logo_url,
    }


async def _current_property(current_user: User, db: AsyncSession) -> Property:
    if current_user.property_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hotel is linked to this account")
    property_obj = await db.get(Property, current_user.property_id)
    if property_obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hotel not found")
    return property_obj


def _session_out(user: User) -> dict:
    """A fresh access token for the user's active hotel, plus the user fields the app stores."""
    return {
        "access_token": create_access_token(
            user_id=user.id,
            role=user.role,
            property_id=user.property_id,
        ),
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "mobile": user.mobile,
            "role": user.role,
            "property_id": user.property_id,
        },
    }


async def _accessible_properties(current_user: User, db: AsyncSession) -> list[Property]:
    """Owner: every hotel they own. Staff: only the hotel they work at."""
    if current_user.role == "owner":
        result = await db.execute(
            select(Property)
            .where(Property.owner_id == current_user.id, Property.is_active.is_(True))
            .order_by(Property.name)
        )
        return list(result.scalars().all())
    if current_user.property_id is None:
        return []
    property_obj = await db.get(Property, current_user.property_id)
    return [property_obj] if property_obj is not None else []


def _code_from_name(name: str) -> str:
    base = re.sub(r"[^A-Z0-9]", "", name.upper())[:12] or "HOTEL"
    return f"{base}{secrets.randbelow(900) + 100}"


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_property(
    data: PropertyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Owner registers a hotel (their first or an additional one) and switches to it."""
    if current_user.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an owner can create a hotel")

    name = data.name.strip()
    code = (data.property_code or "").strip().upper() or _code_from_name(name)
    existing = await db.execute(select(Property).where(Property.property_code == code))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Property code is already in use")

    property_obj = Property(property_code=code, name=name, is_active=True, owner_id=current_user.id)
    db.add(property_obj)
    await db.flush()

    current_user.property_id = property_obj.id
    await db.commit()

    # The old token carries the previous hotel, so issue one for the new hotel.
    return {"property": _property_out(property_obj), **_session_out(current_user)}


@router.get("")
async def list_my_properties(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hotels this user can open; `active` marks the one they are viewing now."""
    return [
        {**_property_out(p), "active": p.id == current_user.property_id}
        for p in await _accessible_properties(current_user, db)
    ]


@router.post("/{property_id}/switch")
async def switch_property(
    property_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Owner switches the hotel they are viewing. All data endpoints follow the active hotel."""
    if current_user.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an owner can switch hotels")
    property_obj = await db.get(Property, property_id)
    if property_obj is None or property_obj.owner_id != current_user.id or not property_obj.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hotel not found")

    current_user.property_id = property_obj.id
    await db.commit()
    return {"property": _property_out(property_obj), **_session_out(current_user)}


@router.get("/me")
async def get_my_property(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return _property_out(await _current_property(current_user, db))


@router.put("/me/logo")
async def update_logo(
    data: LogoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner or front office manager can change the hotel logo")
    property_obj = await _current_property(current_user, db)
    if data.logo is not None and not LOGO_PATTERN.match(data.logo):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Logo must be a PNG, JPEG, WebP, SVG or GIF image")
    property_obj.logo_url = data.logo
    await db.commit()
    return _property_out(property_obj)


STAYED = {"checked_in", "checked_out"}
INACTIVE = {"cancelled", "no_show"}
PENDING_ARRIVAL = {"confirmed", "tentative", "waiting"}
CLEANING = {"dirty", "cleaning"}
OUT_OF_SERVICE = {"maintenance", "blocked"}


def _pct_change(current: float, previous: float) -> int | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100)


def _period_bounds(period: str, today: date) -> tuple[date, date, date, date]:
    """Current period start/end, and the matching stretch of the previous period up to today."""
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6), start - timedelta(days=7), today - timedelta(days=7)
    start = today.replace(day=1)
    end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    prev_month_end = start - timedelta(days=1)
    prev_start = prev_month_end.replace(day=1)
    return start, end, prev_start, prev_start + timedelta(days=min(today.day, prev_month_end.day) - 1)


@router.get("/me/overview")
async def get_overview(
    period: str = "month",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Live figures for the hotel dashboard, computed from rooms, reservations, check-ins and payments."""
    property_obj = await _current_property(current_user, db)
    period = "week" if period == "week" else "month"
    today = date.today()
    yesterday = today - timedelta(days=1)
    week_ago = today - timedelta(days=7)
    week = [today - timedelta(days=6 - i) for i in range(7)]
    start, end, prev_start, prev_end = _period_bounds(period, today)

    # Timestamps are stored in UTC; bucket them by the server's local calendar day.
    utc_offset = timedelta(minutes=round((datetime.now() - datetime.utcnow()).total_seconds() / 60))
    local_day = lambda moment: (moment + utc_offset).date()
    since = datetime.combine(min(prev_start, week[0]), datetime.min.time()) - utc_offset

    pid = property_obj.id
    rooms = (await db.execute(select(Room).where(Room.property_id == pid, Room.is_active.is_(True)))).scalars().all()
    reservations = (await db.execute(
        select(Reservation).options(selectinload(Reservation.guest))
        .where(Reservation.property_id == pid)
        .order_by(Reservation.created_at.desc())
    )).scalars().all()
    payments = (await db.execute(
        select(Payment).where(Payment.property_id == pid, Payment.received_at >= since)
        .order_by(Payment.received_at.desc())
    )).scalars().all()
    checkins = (await db.execute(
        select(CheckIn).where(CheckIn.property_id == pid, CheckIn.checked_in_at >= since)
        .order_by(CheckIn.checked_in_at.desc())
    )).scalars().all()
    checkouts = (await db.execute(
        select(CheckOut).where(CheckOut.property_id == pid, CheckOut.checked_out_at >= since)
        .order_by(CheckOut.checked_out_at.desc())
    )).scalars().all()
    history = (await db.execute(
        select(ReservationHistory).where(ReservationHistory.property_id == pid)
        .order_by(ReservationHistory.created_at.desc()).limit(8)
    )).scalars().all()
    by_id = {r.id: r for r in reservations}

    def guest_name(reservation: Reservation | None) -> str:
        guest = reservation.guest if reservation else None
        return f"{guest.first_name} {guest.last_name}".strip() if guest else ""

    # In-house on a past day = stays that spanned it; today = who is checked in right now.
    in_house_now = [r for r in reservations if r.status == "checked_in"]

    def in_house_on(day: date) -> int:
        if day == today:
            return len(in_house_now)
        return sum(r.status in STAYED and r.check_in_date <= day < r.check_out_date for r in reservations)

    checkins_by_day = Counter(local_day(c.checked_in_at) for c in checkins)
    checkouts_by_day = Counter(local_day(c.checked_out_at) for c in checkouts)

    def rooms_on(day: date) -> int:
        return sum(local_day(room.created_at) <= day for room in rooms)

    # Occupied comes from checked-in stays (check-in does not update the room), the rest from the room status.
    occupied_numbers = {r.room_number for r in in_house_now if r.room_number}
    is_occupied = lambda room: room.room_number in occupied_numbers or room.status == "occupied"
    occupancy = Counter()
    for room in rooms:
        if is_occupied(room):
            occupancy["occupied"] += 1
        elif room.status in CLEANING:
            occupancy["cleaning"] += 1
        elif room.status in OUT_OF_SERVICE:
            occupancy["maintenance"] += 1
        else:
            occupancy["available"] += 1
    total_rooms = len(rooms)
    occupancy_pct = lambda count: round(count / total_rooms * 100) if total_rooms else 0
    occupancy_now = occupancy_pct(occupancy["occupied"])

    revenue_by_day = Counter()
    for payment in payments:
        revenue_by_day[local_day(payment.received_at)] += payment.amount
    period_days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    revenue_total = sum(revenue_by_day[day] for day in period_days)
    revenue_previous = sum(amount for day, amount in revenue_by_day.items() if prev_start <= day <= prev_end)

    # Room types: inventory and live occupancy, plus bookings (and their value) arriving this period.
    period_bookings = [r for r in reservations if r.status not in INACTIVE and start <= r.check_in_date <= end]
    types: dict[str, dict] = {}
    room_type = lambda name: types.setdefault(name, {"name": name, "rooms": 0, "occupied": 0, "bookings": 0, "revenue": 0})
    for room in rooms:
        item = room_type(room.room_category)
        item["rooms"] += 1
        item["occupied"] += is_occupied(room)
    for r in period_bookings:
        if r.room_category:
            item = room_type(r.room_category)
            item["bookings"] += 1
            item["revenue"] += r.total_amount or 0
    room_types = sorted(types.values(), key=lambda item: (item["revenue"], item["bookings"], item["rooms"]), reverse=True)[:5]

    events = (
        [("booking", r.created_at, r, {"room_number": r.room_number}) for r in reservations[:8]]
        + [("check_in", c.checked_in_at, by_id.get(c.reservation_id), {"room_number": c.room_number}) for c in checkins[:8]]
        + [("check_out", c.checked_out_at, by_id.get(c.reservation_id), {"room_number": c.room_number}) for c in checkouts[:8]]
        + [("payment", p.received_at, by_id.get(p.reservation_id), {"amount": p.amount}) for p in payments[:8]]
        + [(h.action, h.created_at, by_id.get(h.reservation_id), {"details": h.details}) for h in history]
    )
    events.sort(key=lambda event: event[1], reverse=True)

    return {
        "kpis": {
            "total_rooms": {"value": total_rooms, "change_pct": _pct_change(total_rooms, rooms_on(week_ago)), "trend": [rooms_on(day) for day in week]},
            "in_house": {"value": len(in_house_now), "change_pct": _pct_change(len(in_house_now), in_house_on(week_ago)), "trend": [in_house_on(day) for day in week]},
            "check_ins_today": {"value": checkins_by_day[today], "change": checkins_by_day[today] - checkins_by_day[yesterday], "trend": [checkins_by_day[day] for day in week]},
            "check_outs_today": {"value": checkouts_by_day[today], "change": checkouts_by_day[today] - checkouts_by_day[yesterday], "trend": [checkouts_by_day[day] for day in week]},
        },
        "arrivals_pending": sum(r.check_in_date == today and r.status in PENDING_ARRIVAL for r in reservations),
        "occupancy": {
            "total": total_rooms,
            "occupied": occupancy["occupied"],
            "available": occupancy["available"],
            "cleaning": occupancy["cleaning"],
            "maintenance": occupancy["maintenance"],
            "percent": occupancy_now,
            "change_vs_last_week": occupancy_now - occupancy_pct(in_house_on(week_ago)),
        },
        "revenue": {
            "period": period,
            "total": revenue_total,
            "change_pct": _pct_change(revenue_total, revenue_previous),
            "days": [{"date": day.isoformat(), "amount": revenue_by_day[day]} for day in period_days],
        },
        "room_types": room_types,
        "booking_sources": [{"name": name, "count": count} for name, count in Counter(r.source for r in period_bookings).most_common(5)],
        "recent_bookings": [
            {
                "id": r.id,
                "reservation_code": r.reservation_code,
                "guest": guest_name(r),
                "room_number": r.room_number,
                "room_category": r.room_category,
                "check_in_date": r.check_in_date.isoformat(),
                "check_out_date": r.check_out_date.isoformat(),
                "status": r.status,
                "total_amount": r.total_amount,
            }
            for r in reservations[:5]
        ],
        "activity": [
            {
                "kind": kind,
                "at": moment.isoformat() + "Z",
                "reservation_code": reservation.reservation_code if reservation else None,
                "guest": guest_name(reservation),
                "room_number": extra.get("room_number"),
                "amount": extra.get("amount"),
                "details": extra.get("details"),
            }
            for kind, moment, reservation, extra in events[:6]
        ],
    }


@router.post("/me/staff/assign")
async def assign_staff(
    data: StaffAssign,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Owner brings an existing staff account into the hotel they are viewing.

    Only staff from an unowned hotel (e.g. the seeded demo hotel) or from another hotel
    of the same owner can be moved, so one owner can never take another owner's staff.
    """
    if current_user.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the owner can assign staff")
    target_hotel = await _current_property(current_user, db)
    ident = data.identifier.strip()
    staff = await db.scalar(select(User).where((User.username == ident) | (User.email == ident.lower())))
    if staff is None or staff.role not in STAFF_ROLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No front office staff account with that username or email")
    if staff.property_id == target_hotel.id:
        return {"message": f"{staff.username} already works at {target_hotel.name}"}
    if staff.property_id is not None:
        current_hotel = await db.get(Property, staff.property_id)
        if current_hotel is not None and current_hotel.owner_id not in (None, current_user.id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This staff member belongs to another owner's hotel")
    staff.property_id = target_hotel.id
    await db.commit()
    return {"message": f"{staff.username} now works at {target_hotel.name}", "user": {"id": staff.id, "username": staff.username, "role": staff.role}}
