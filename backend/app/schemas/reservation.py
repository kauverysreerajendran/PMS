from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class GuestCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str | None = Field(default=None, max_length=150)
    mobile: str | None = Field(default=None, max_length=20)

    @field_validator("first_name", "last_name")
    @classmethod
    def strip_required_names(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name is required")
        return value


class GuestResponse(GuestCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    created_at: datetime


class ReservationCreate(BaseModel):
    guest: GuestCreate
    room_number: str | None = Field(default=None, max_length=30)
    room_category: str | None = Field(default=None, max_length=100)
    check_in_date: date
    check_out_date: date
    arrival_time: time | None = None
    adults: int = Field(default=1, ge=1, le=20)
    children: int = Field(default=0, ge=0, le=20)
    source: str = Field(default="front_desk", min_length=1, max_length=50)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_stay_dates(self):
        if self.check_out_date <= self.check_in_date:
            raise ValueError("check_out_date must be after check_in_date")
        return self


class ReservationUpdate(BaseModel):
    room_number: str | None = Field(default=None, max_length=30)
    room_category: str | None = Field(default=None, max_length=100)
    check_in_date: date | None = None
    check_out_date: date | None = None
    arrival_time: time | None = None
    adults: int | None = Field(default=None, ge=1, le=20)
    children: int | None = Field(default=None, ge=0, le=20)
    source: str | None = Field(default=None, min_length=1, max_length=50)
    notes: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, max_length=30)


class ReservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    reservation_code: str
    guest: GuestResponse
    room_number: str | None
    room_category: str | None
    check_in_date: date
    check_out_date: date
    arrival_time: time | None
    adults: int
    children: int
    status: str
    source: str
    notes: str | None
    created_at: datetime
    updated_at: datetime


class ReservationListResponse(BaseModel):
    items: list[ReservationResponse]
    total: int


class ReservationCancellation(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)
