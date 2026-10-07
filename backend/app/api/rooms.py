from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.room import Room
from app.models.user import User
from app.schemas.room import RoomCreate, RoomResponse

router = APIRouter(prefix="/rooms", tags=["Room Inventory"])
STATUSES = {"available", "reserved", "occupied", "dirty", "cleaning", "maintenance", "blocked"}

@router.get("", response_model=list[RoomResponse])
async def list_rooms(current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Room).where(Room.property_id == current_user.property_id, Room.is_active.is_(True)).order_by(Room.room_number))
    return result.scalars().all()

@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(data: RoomCreate, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    if data.status not in STATUSES: raise HTTPException(422, "Invalid room status")
    duplicate = await db.scalar(select(Room.id).where(Room.property_id == current_user.property_id, Room.room_number == data.room_number))
    if duplicate: raise HTTPException(409, "Room number already exists")
    room = Room(property_id=current_user.property_id, **data.model_dump()); db.add(room); await db.commit(); await db.refresh(room); return room

@router.patch("/{room_id}", response_model=RoomResponse)
async def update_room(room_id: int, data: RoomCreate, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    room = await db.scalar(select(Room).where(Room.id == room_id, Room.property_id == current_user.property_id))
    if not room: raise HTTPException(404, "Room not found")
    if data.status not in STATUSES: raise HTTPException(422, "Invalid room status")
    for key, value in data.model_dump().items(): setattr(room, key, value)
    await db.commit(); await db.refresh(room); return room
