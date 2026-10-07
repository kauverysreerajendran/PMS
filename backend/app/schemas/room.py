from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class RoomCreate(BaseModel):
    room_number: str = Field(min_length=1, max_length=30)
    room_category: str = Field(min_length=1, max_length=100)
    floor: str | None = Field(default=None, max_length=30)
    capacity: int = Field(default=2, ge=1, le=20)
    status: str = Field(default="available", max_length=30)
    notes: str | None = Field(default=None, max_length=1000)

class RoomResponse(RoomCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    property_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
