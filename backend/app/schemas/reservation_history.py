from datetime import datetime
from pydantic import BaseModel, ConfigDict
class ReservationHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reservation_id: int
    user_id: int
    action: str
    details: str | None
    created_at: datetime
