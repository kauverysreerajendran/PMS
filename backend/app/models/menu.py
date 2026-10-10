from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class MenuItem(Base):
    """A dish or drink the hotel sells; orders are posted to the guest folio."""
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(60), index=True)          # Breakfast, Starters, Main Course, ...
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[int] = mapped_column(Integer)
    food_type: Mapped[str] = mapped_column(String(20), default="veg")      # veg | non_veg | egg | beverage
    prep_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    # Comma-separated meal times the dish is served at: Breakfast, Brunch, Lunch, Snacks, Dinner, Beverages, ...
    meal_periods: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Complimentary dishes are posted to the folio at no charge.
    is_complimentary: Mapped[bool] = mapped_column(Boolean, default=False)
    # For combos / set menus: the dishes included, comma-separated (e.g. "2 Idli, Medu Vada, Filter Coffee").
    components: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MenuOrder(Base):
    """An order a guest placed from the QR menu; staff accept it onto the room bill or decline it."""
    __tablename__ = "menu_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    reservation_id: Mapped[int] = mapped_column(ForeignKey("reservations.id"), index=True)
    reference: Mapped[str] = mapped_column(String(30), index=True)
    room_number: Mapped[str] = mapped_column(String(30))
    guest_name: Mapped[str] = mapped_column(String(200))
    # JSON list of {"item_id", "name", "quantity", "price", "complimentary"} captured when ordered.
    lines: Mapped[str] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    total: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)   # new | accepted | declined
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    handled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
