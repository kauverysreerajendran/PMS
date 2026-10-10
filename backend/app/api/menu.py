import json
from datetime import date, datetime
from secrets import token_hex

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.folio import _editable, _money, _nights, _recalculate_total, _reservation
from app.api.reservations import record_history
from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.folio import FolioCharge
from app.models.reservation import Guest, Reservation
from app.models.menu import MenuItem, MenuOrder
from app.models.user import Property, User

router = APIRouter(prefix="/menu", tags=["Food & Beverage"])
FOOD_TYPES = {"veg", "non_veg", "egg", "beverage"}
SERVICES = {"Restaurant", "Room Service", "Minibar", "Banquet"}


class MenuItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=1000)
    price: int = Field(ge=0, le=1_000_000)
    food_type: str = Field(default="veg")
    prep_minutes: int | None = Field(default=None, ge=0, le=600)
    is_available: bool = True
    meal_periods: list[str] = Field(default_factory=list, max_length=12)
    is_complimentary: bool = False
    components: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("components", mode="before")
    @classmethod
    def clean_components(cls, value):
        if isinstance(value, str):
            value = value.split(",")
        return [item.strip()[:60] for item in value or [] if item and item.strip()]

    @field_validator("meal_periods", mode="before")
    @classmethod
    def clean_periods(cls, value):
        if isinstance(value, str):
            value = value.split(",")
        return [item.strip()[:30] for item in value or [] if item and item.strip()]


class OrderLine(BaseModel):
    item_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=99)


class OrderIn(BaseModel):
    reservation_id: int = Field(gt=0)
    service: str = "Room Service"
    lines: list[OrderLine] = Field(min_length=1, max_length=50)
    notes: str | None = Field(default=None, max_length=500)
    complimentary: bool = False   # whole order on the house


def item_out(item: MenuItem) -> dict:
    out = {key: getattr(item, key) for key in ("id", "name", "category", "description", "price", "food_type", "prep_minutes", "is_available", "is_complimentary")}
    out["meal_periods"] = [period.strip() for period in (item.meal_periods or "").split(",") if period.strip()]
    out["components"] = [part.strip() for part in (item.components or "").split(",") if part.strip()]
    return out


def _values(data: "MenuItemIn") -> dict:
    values = data.model_dump()
    values["name"], values["category"] = data.name.strip(), data.category.strip()
    values["meal_periods"] = ", ".join(data.meal_periods) or None
    values["components"] = ", ".join(data.components) or None
    return values


async def _item(item_id: int, user: User, db: AsyncSession) -> MenuItem:
    item = await db.scalar(select(MenuItem).where(MenuItem.id == item_id, MenuItem.property_id == user.property_id, MenuItem.is_active.is_(True)))
    if item is None:
        raise HTTPException(404, "Menu item not found")
    return item


def _check(data: MenuItemIn) -> None:
    if data.price <= 0 and not data.is_complimentary:
        raise HTTPException(422, "Enter a price, or mark the item complimentary")
    if data.food_type not in FOOD_TYPES:
        raise HTTPException(422, "Food type must be veg, non_veg, egg or beverage")


@router.get("/items")
async def list_items(current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    items = (await db.execute(select(MenuItem).where(MenuItem.property_id == current_user.property_id, MenuItem.is_active.is_(True))
                              .order_by(MenuItem.category, MenuItem.name))).scalars().all()
    return [item_out(item) for item in items]


@router.post("/items", status_code=status.HTTP_201_CREATED)
async def create_item(data: MenuItemIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    _check(data)
    item = MenuItem(property_id=current_user.property_id, **_values(data))
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item_out(item)


@router.patch("/items/{item_id}")
async def update_item(item_id: int, data: MenuItemIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    _check(data)
    item = await _item(item_id, current_user, db)
    for key, value in _values(data).items():
        setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    return item_out(item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_item(item_id: int, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    item = await _item(item_id, current_user, db)
    item.is_active = False   # kept for past orders on folios
    await db.commit()


async def charge_order(reservation, lines: list[tuple[MenuItem, int]], service: str, notes: str | None, complimentary: bool, user: User, db: AsyncSession) -> tuple[str, int]:
    """Post one folio line per dish; complimentary dishes go on at no charge."""
    if reservation.status != "checked_in":
        raise HTTPException(409, "Orders can be charged only to guests who are checked in")
    _editable(reservation)
    await _nights(reservation, db)
    reference = f"ORD-{datetime.utcnow():%H%M}-{token_hex(2).upper()}"
    total = 0
    for item, quantity in lines:
        free = complimentary or item.is_complimentary
        unit = 0 if free else item.price
        amount = unit * quantity
        total += amount
        description = item.name + (" (Complimentary)" if free else "") + (f" · {notes.strip()}" if notes and notes.strip() else "")
        db.add(FolioCharge(property_id=reservation.property_id, reservation_id=reservation.id, posted_on=date.today(), category=service,
                           reference=reference, description=description, quantity=quantity, unit_amount=unit, discount=0,
                           amount=amount, tax_inclusive=True, posted_by_user_id=user.id))
    await db.flush()
    await _recalculate_total(reservation, db)
    await record_history(db, reservation, user, "charge_added", f"{service} order {reference}: {_money(total)}")
    return reference, total


@router.post("/orders", status_code=status.HTTP_201_CREATED)
async def post_order(data: OrderIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    """Staff order charged straight to a guest's room."""
    if data.service not in SERVICES:
        raise HTTPException(422, "Unknown service")
    reservation = await _reservation(data.reservation_id, current_user, db)
    lines = []
    for line in data.lines:
        item = await _item(line.item_id, current_user, db)
        if not item.is_available:
            raise HTTPException(409, f"{item.name} is not available right now")
        lines.append((item, line.quantity))
    reference, total = await charge_order(reservation, lines, data.service, data.notes, data.complimentary, current_user, db)
    await db.commit()
    return {"reference": reference, "total": total, "room_number": reservation.room_number, "total_amount": reservation.total_amount}


class BulkItems(BaseModel):
    items: list[MenuItemIn] = Field(min_length=1, max_length=200)


@router.post("/items/bulk", status_code=status.HTTP_201_CREATED)
async def create_items(data: BulkItems, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    """Load many dishes at once (the starter menu); names already on the menu are skipped."""
    existing = {name.lower() for name in (await db.execute(select(MenuItem.name).where(MenuItem.property_id == current_user.property_id, MenuItem.is_active.is_(True)))).scalars()}
    added = 0
    for entry in data.items:
        if entry.name.strip().lower() in existing:
            continue
        _check(entry)
        db.add(MenuItem(property_id=current_user.property_id, **_values(entry)))
        existing.add(entry.name.strip().lower())
        added += 1
    await db.commit()
    return {"added": added}


def order_out(order: MenuOrder) -> dict:
    return {"id": order.id, "reference": order.reference, "reservation_id": order.reservation_id, "room_number": order.room_number,
            "guest_name": order.guest_name, "lines": json.loads(order.lines), "notes": order.notes, "total": order.total,
            "status": order.status, "created_at": order.created_at}


@router.get("/guest-orders")
async def guest_orders(current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    """New QR orders plus anything handled today."""
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    orders = (await db.execute(select(MenuOrder).where(MenuOrder.property_id == current_user.property_id,
                                                      (MenuOrder.status == "new") | (MenuOrder.created_at >= today))
                               .order_by(MenuOrder.created_at.desc()).limit(50))).scalars().all()
    return [order_out(order) for order in orders]


class Decision(BaseModel):
    service: str = "Room Service"


@router.post("/guest-orders/{order_id}/accept")
async def accept_guest_order(order_id: int, data: Decision, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    order = await db.scalar(select(MenuOrder).where(MenuOrder.id == order_id, MenuOrder.property_id == current_user.property_id))
    if order is None:
        raise HTTPException(404, "Order not found")
    if order.status != "new":
        raise HTTPException(409, f"This order was already {order.status}")
    if data.service not in SERVICES:
        raise HTTPException(422, "Unknown service")
    reservation = await _reservation(order.reservation_id, current_user, db)
    lines = [(await _item(line["item_id"], current_user, db), int(line["quantity"])) for line in json.loads(order.lines)]
    reference, total = await charge_order(reservation, lines, data.service, order.notes, False, current_user, db)
    order.status, order.handled_at, order.total = "accepted", datetime.utcnow(), total
    await db.commit()
    return {**order_out(order), "folio_reference": reference}


@router.post("/guest-orders/{order_id}/decline")
async def decline_guest_order(order_id: int, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    order = await db.scalar(select(MenuOrder).where(MenuOrder.id == order_id, MenuOrder.property_id == current_user.property_id))
    if order is None:
        raise HTTPException(404, "Order not found")
    if order.status != "new":
        raise HTTPException(409, f"This order was already {order.status}")
    order.status, order.handled_at = "declined", datetime.utcnow()
    await db.commit()
    return order_out(order)


# ---- Public menu (QR code): no sign-in, read-only, available dishes only. ----
public_router = APIRouter(prefix="/public", tags=["Public menu"])


@public_router.get("/menu/{property_code}")
async def public_menu(property_code: str, db: AsyncSession = Depends(get_db)):
    hotel = await db.scalar(select(Property).where(Property.property_code == property_code))
    if hotel is None:
        raise HTTPException(404, "Menu not found")
    items = (await db.execute(select(MenuItem).where(MenuItem.property_id == hotel.id, MenuItem.is_active.is_(True), MenuItem.is_available.is_(True))
                              .order_by(MenuItem.category, MenuItem.name))).scalars().all()
    public_fields = ("id", "name", "category", "description", "price", "food_type", "prep_minutes", "is_complimentary", "meal_periods", "components")
    return {"hotel": {"name": hotel.name, "logo_url": hotel.logo_url, "property_code": hotel.property_code},
            "items": [{key: value for key, value in item_out(item).items() if key in public_fields} for item in items]}


class GuestOrderLine(BaseModel):
    item_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=20)


class GuestOrderIn(BaseModel):
    room_number: str = Field(min_length=1, max_length=30)
    last_name: str = Field(min_length=1, max_length=100)
    lines: list[GuestOrderLine] = Field(min_length=1, max_length=30)
    notes: str | None = Field(default=None, max_length=300)


@public_router.post("/menu/{property_code}/orders", status_code=status.HTTP_201_CREATED)
async def place_guest_order(property_code: str, data: GuestOrderIn, db: AsyncSession = Depends(get_db)):
    """A checked-in guest orders from the QR menu. Room number + surname must match an in-house stay;
    nothing is charged until staff accept the order."""
    hotel = await db.scalar(select(Property).where(Property.property_code == property_code))
    if hotel is None:
        raise HTTPException(404, "Menu not found")
    reservation = await db.scalar(
        select(Reservation).join(Guest, Guest.id == Reservation.guest_id)
        .where(Reservation.property_id == hotel.id, Reservation.status == "checked_in", Reservation.room_number == data.room_number.strip(),
               func.lower(Guest.last_name) == data.last_name.strip().lower()))
    if reservation is None:
        raise HTTPException(404, "We could not find a checked-in guest with that room number and surname")
    open_orders = await db.scalar(select(func.count(MenuOrder.id)).where(MenuOrder.reservation_id == reservation.id, MenuOrder.status == "new"))
    if (open_orders or 0) >= 5:
        raise HTTPException(429, "You already have orders waiting; our team will be with you shortly")
    lines, total = [], 0
    for line in data.lines:
        item = await db.scalar(select(MenuItem).where(MenuItem.id == line.item_id, MenuItem.property_id == hotel.id, MenuItem.is_active.is_(True)))
        if item is None or not item.is_available:
            raise HTTPException(409, "One of the dishes is no longer available")
        price = 0 if item.is_complimentary else item.price
        total += price * line.quantity
        lines.append({"item_id": item.id, "name": item.name, "quantity": line.quantity, "price": price, "complimentary": item.is_complimentary})
    guest = await db.get(Guest, reservation.guest_id)
    order = MenuOrder(property_id=hotel.id, reservation_id=reservation.id, reference=f"QR-{token_hex(3).upper()}", room_number=reservation.room_number,
                      guest_name=f"{guest.first_name} {guest.last_name}" if guest else data.last_name, lines=json.dumps(lines),
                      notes=(data.notes or "").strip() or None, total=total, status="new", created_at=datetime.utcnow())
    db.add(order)
    await db.commit()
    return {"reference": order.reference, "total": total, "room_number": order.room_number}
