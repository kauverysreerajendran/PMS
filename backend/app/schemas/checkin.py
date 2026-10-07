from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.reservation import GuestResponse


class CheckInCreate(BaseModel):
    reservation_id: int = Field(gt=0)
    identity_document_type: str | None = Field(default=None, max_length=50)
    identity_document_number: str | None = Field(default=None, max_length=100)
    verification_status: str = Field(default="pending", max_length=30)
    notes: str | None = Field(default=None, max_length=2000)


class PendingCheckInResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reservation_code: str
    guest: GuestResponse
    room_number: str | None
    room_category: str | None
    check_in_date: date
    check_out_date: date
    status: str


class CheckInResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    reservation_id: int
    guest: GuestResponse
    room_number: str
    identity_document_type: str | None
    identity_document_number: str | None
    verification_status: str
    notes: str | None
    checked_in_at: datetime


class PendingCheckInListResponse(BaseModel):
    items: list[PendingCheckInResponse]
    total: int
