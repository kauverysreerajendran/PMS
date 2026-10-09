from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class GuestCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str | None = Field(default=None, max_length=150)
    mobile: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=1000)
    identity_type: str | None = Field(default=None, max_length=50)
    identity_number: str | None = Field(default=None, max_length=100)
    nationality: str | None = Field(default=None, max_length=100)
    identity_document_path: str | None = Field(default=None, max_length=500)

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


class GroupRoomBlockCreate(BaseModel):
    room_category: str = Field(min_length=1, max_length=100)
    rate_plan: str | None = Field(default=None, max_length=100)
    rooms_count: int = Field(ge=1, le=100)
    adults: int = Field(ge=1, le=20)
    children: int = Field(default=0, ge=0, le=20)
    nightly_rate: int | None = Field(default=None, ge=0)


class GroupRoomBlockResponse(GroupRoomBlockCreate):
    model_config = ConfigDict(from_attributes=True)


class ReservationCreate(BaseModel):
    guest: GuestCreate
    guest_id: int | None = None
    room_number: str | None = Field(default=None, max_length=30)
    room_category: str | None = Field(default=None, max_length=100)
    check_in_date: date
    check_out_date: date
    arrival_time: time | None = None
    adults: int = Field(default=1, ge=1, le=20)
    children: int = Field(default=0, ge=0, le=20)
    rooms_count: int = Field(default=1, ge=1, le=10)
    status: str = Field(default="confirmed", pattern="^(confirmed|tentative|waiting)$")
    rate_plan: str | None = Field(default=None, max_length=100)
    nightly_rate: int | None = Field(default=None, ge=0)
    rate_override_reason: str | None = Field(default=None, max_length=1000)
    taxes_amount: int = Field(default=0, ge=0)
    discount_amount: int = Field(default=0, ge=0)
    additional_charges: int = Field(default=0, ge=0)
    advance_payment_amount: int = Field(default=0, ge=0)
    advance_payment_method: str | None = Field(default=None, max_length=30)
    advance_payment_reference: str | None = Field(default=None, max_length=100)
    special_requests: str | None = Field(default=None, max_length=2000)
    send_confirmation_voucher: bool = False
    source: str = Field(default="front_desk", min_length=1, max_length=50)
    notes: str | None = Field(default=None, max_length=2000)
    is_group_booking: bool = False
    group_name: str | None = Field(default=None, max_length=150)
    booking_source: str | None = Field(default=None, max_length=150)
    business_source: str | None = Field(default=None, max_length=150)
    market_code: str | None = Field(default=None, max_length=100)
    deposit_due_at: datetime | None = None
    release_at: datetime | None = None
    group_size: int | None = Field(default=None, ge=1, le=1000)
    quick_group_booking: bool = False
    reminder_at: datetime | None = None
    required_advance_amount: int = Field(default=0, ge=0)
    room_blocks: list[GroupRoomBlockCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_stay_dates(self):
        if self.check_out_date <= self.check_in_date:
            raise ValueError("check_out_date must be after check_in_date")
        if self.adults + self.children < 1:
            raise ValueError("At least one guest is required")
        if self.advance_payment_amount and not self.advance_payment_method:
            raise ValueError("Select a payment method for the advance payment")
        if self.is_group_booking and (not self.group_name or not self.room_blocks):
            raise ValueError("A group name and at least one room block are required")
        if self.is_group_booking and self.group_size:
            blocked_capacity = sum(block.rooms_count * (block.adults + block.children) for block in self.room_blocks)
            if blocked_capacity < self.group_size:
                raise ValueError("Group room blocks do not provide enough capacity for the group size")
        return self


class ReservationUpdate(BaseModel):
    guest: GuestCreate | None = None
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
    rooms_count: int | None = Field(default=None, ge=1, le=10)
    rate_plan: str | None = Field(default=None, max_length=100)
    nightly_rate: int | None = Field(default=None, ge=0)
    rate_override_reason: str | None = Field(default=None, max_length=1000)
    taxes_amount: int | None = Field(default=None, ge=0)
    discount_amount: int | None = Field(default=None, ge=0)
    additional_charges: int | None = Field(default=None, ge=0)
    special_requests: str | None = Field(default=None, max_length=2000)
    send_confirmation_voucher: bool | None = None
    is_group_booking: bool | None = None
    group_name: str | None = Field(default=None, max_length=150)
    booking_source: str | None = Field(default=None, max_length=150)
    business_source: str | None = Field(default=None, max_length=150)
    market_code: str | None = Field(default=None, max_length=100)
    deposit_due_at: datetime | None = None
    release_at: datetime | None = None
    group_size: int | None = Field(default=None, ge=1, le=1000)
    reminder_at: datetime | None = None
    required_advance_amount: int | None = Field(default=None, ge=0)
    room_blocks: list[GroupRoomBlockCreate] | None = None


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
    rooms_count: int
    status: str
    source: str
    notes: str | None
    rate_plan: str | None
    nightly_rate: int | None
    total_amount: int | None
    taxes_amount: int
    discount_amount: int
    additional_charges: int
    special_requests: str | None
    send_confirmation_voucher: bool
    is_group_booking: bool
    group_name: str | None
    booking_source: str | None
    business_source: str | None
    market_code: str | None
    deposit_due_at: datetime | None
    release_at: datetime | None
    group_size: int | None
    quick_group_booking: bool
    reminder_at: datetime | None
    required_advance_amount: int
    room_blocks: list[GroupRoomBlockResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ReservationListResponse(BaseModel):
    items: list[ReservationResponse]
    total: int


class ReservationCancellation(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)
