from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator

class RoomCreate(BaseModel):
    room_number: str = Field(min_length=1, max_length=30)
    room_category: str = Field(min_length=1, max_length=100)
    room_type: str | None = Field(default=None, max_length=50)
    floor: str | None = Field(default=None, max_length=30)
    max_adults: int = Field(default=2, ge=1, le=20)
    max_children: int = Field(default=0, ge=0, le=20)
    status: str = Field(default="available", max_length=30)
    notes: str | None = Field(default=None, max_length=1000)
    display_name: str | None = Field(default=None, max_length=120)
    base_rate: int | None = Field(default=None, ge=0)
    bed_type: str | None = Field(default=None, max_length=60)
    size_sqft: int | None = Field(default=None, ge=0, le=100000)
    amenities: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("amenities", mode="before")
    @classmethod
    def split_amenities(cls, value):
        # Stored as one comma-separated string; accepted and returned as a list.
        if value is None:
            return []
        if isinstance(value, str):
            value = value.split(",")
        return [item.strip()[:40] for item in value if item and item.strip()]

class RoomResponse(RoomCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    property_id: int
    capacity: int
    image_url: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

class RoomStay(BaseModel):
    reservation_id: int
    reservation_code: str
    guest_name: str
    status: str
    check_in_date: date
    check_out_date: date

class RoomStatusItem(RoomResponse):
    live_status: str
    current_stay: RoomStay | None = None
    next_stay: RoomStay | None = None
