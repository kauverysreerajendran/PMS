import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.security import create_access_token
from app.db.database import get_db
from app.models.user import Property, User

router = APIRouter(prefix="/properties", tags=["Properties"])


class PropertyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    property_code: str | None = Field(default=None, max_length=50)


def _code_from_name(name: str) -> str:
    base = re.sub(r"[^A-Z0-9]", "", name.upper())[:12] or "HOTEL"
    return f"{base}{secrets.randbelow(900) + 100}"


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_property(
    data: PropertyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Owner creates their first hotel and is linked to it."""
    if current_user.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only an owner can create a hotel")
    if current_user.property_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a hotel")

    name = data.name.strip()
    code = (data.property_code or "").strip().upper() or _code_from_name(name)
    existing = await db.execute(select(Property).where(Property.property_code == code))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Property code is already in use")

    property_obj = Property(property_code=code, name=name, is_active=True)
    db.add(property_obj)
    await db.flush()

    current_user.property_id = property_obj.id
    await db.commit()

    # The old token carries property_id=None, so issue one for the new hotel.
    access_token = create_access_token(
        user_id=current_user.id,
        role=current_user.role,
        property_id=current_user.property_id,
    )

    return {
        "property": {"id": property_obj.id, "property_code": code, "name": name},
        "access_token": access_token,
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "mobile": current_user.mobile,
            "role": current_user.role,
            "property_id": current_user.property_id,
        },
    }
