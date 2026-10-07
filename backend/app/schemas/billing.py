from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.reservation import GuestResponse


class PaymentCreate(BaseModel):
    reservation_id: int = Field(gt=0)
    amount: int = Field(gt=0)
    payment_method: str = Field(min_length=1, max_length=30)
    reference_number: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)


class BillTotalUpdate(BaseModel):
    total_amount: int = Field(gt=0)


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reservation_id: int
    amount: int
    payment_method: str
    reference_number: str | None
    notes: str | None
    received_at: datetime


class BillingReservationResponse(BaseModel):
    id: int
    reservation_code: str
    guest: GuestResponse
    room_number: str | None
    check_in_date: str
    check_out_date: str
    status: str
    total_amount: int
    paid_amount: int
    balance_amount: int
    payment_status: str
    payments: list[PaymentResponse]
