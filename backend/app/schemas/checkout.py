from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.reservation import GuestResponse


class CheckOutCreate(BaseModel):
    reservation_id: int = Field(gt=0)
    payment_status: str = Field(default="paid", max_length=30)
    payment_method: str = Field(min_length=1, max_length=30)
    notes: str | None = Field(default=None, max_length=2000)


class PendingCheckOutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reservation_code: str
    guest: GuestResponse
    room_number: str | None
    room_category: str | None
    check_in_date: date
    check_out_date: date
    status: str


class CheckOutResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    reservation_id: int
    guest: GuestResponse
    room_number: str
    payment_status: str
    payment_method: str
    notes: str | None
    checked_out_at: datetime


class PendingCheckOutListResponse(BaseModel):
    items: list[PendingCheckOutResponse]
    total: int
