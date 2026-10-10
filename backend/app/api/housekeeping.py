import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.housekeeping import HousekeepingTask
from app.models.room import Room
from app.models.user import User

router = APIRouter(prefix="/housekeeping", tags=["Housekeeping"])
TASK_TYPES = {"cleaning", "maintenance"}
FLOW = ["pending", "assigned", "in_progress", "inspection", "done"]
OPEN = {"pending", "assigned", "in_progress", "inspection"}


class Supply(BaseModel):
    item: str = Field(min_length=1, max_length=60)
    qty: int = Field(default=1, ge=1, le=99)


class TaskCreate(BaseModel):
    room_id: int = Field(gt=0)
    task_type: str = "cleaning"
    priority: str = Field(default="normal", pattern="^(normal|high)$")
    assignee: str | None = Field(default=None, max_length=100)
    supplies: list[Supply] = Field(default_factory=list, max_length=30)
    notes: str | None = Field(default=None, max_length=1000)


class TaskUpdate(BaseModel):
    status: str | None = None
    priority: str | None = Field(default=None, pattern="^(normal|high)$")
    assignee: str | None = Field(default=None, max_length=100)
    supplies: list[Supply] | None = Field(default=None, max_length=30)
    notes: str | None = Field(default=None, max_length=1000)


def task_out(task: HousekeepingTask, room: Room | None) -> dict:
    return {
        "id": task.id, "room_id": task.room_id, "room_number": task.room_number,
        "room_category": room.room_category if room else None, "floor": room.floor if room else None,
        "room_type": room.room_type if room else None, "room_name": room.display_name if room else None, "image_url": room.image_url if room else None,
        "room_status": room.status if room else None, "reservation_id": task.reservation_id,
        "task_type": task.task_type, "status": task.status, "priority": task.priority, "assignee": task.assignee,
        "supplies": json.loads(task.supplies) if task.supplies else [], "notes": task.notes,
        "created_at": task.created_at, "assigned_at": task.assigned_at, "started_at": task.started_at, "completed_at": task.completed_at,
    }


async def sync_room_status(db: AsyncSession, room: Room) -> None:
    """The room's housekeeping status follows its open tasks; with none left it is clean and ready."""
    tasks = (await db.execute(select(HousekeepingTask).where(HousekeepingTask.room_id == room.id, HousekeepingTask.status.in_(OPEN)))).scalars().all()
    if any(task.task_type == "maintenance" for task in tasks):
        room.status = "maintenance"
    elif any(task.status in {"in_progress", "inspection"} for task in tasks):
        room.status = "cleaning"
    elif tasks:
        room.status = "dirty"
    elif room.status in {"dirty", "cleaning", "maintenance"}:
        room.status = "available"


async def open_cleaning_task(db: AsyncSession, room: Room, reservation_id: int | None, user_id: int | None, priority: str = "normal", notes: str | None = None) -> HousekeepingTask:
    """Called at check-out: one open cleaning task per room."""
    existing = await db.scalar(select(HousekeepingTask).where(HousekeepingTask.room_id == room.id, HousekeepingTask.task_type == "cleaning", HousekeepingTask.status.in_(OPEN)))
    if existing:
        return existing
    task = HousekeepingTask(property_id=room.property_id, room_id=room.id, room_number=room.room_number, reservation_id=reservation_id,
                            task_type="cleaning", status="pending", priority=priority, notes=notes, created_by_user_id=user_id,
                            created_at=datetime.utcnow())
    db.add(task)
    await db.flush()
    await sync_room_status(db, room)
    return task


@router.get("/tasks")
async def list_tasks(current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    """Open tasks plus anything finished in the last 24 hours."""
    since = datetime.utcnow() - timedelta(hours=24)
    rows = (await db.execute(
        select(HousekeepingTask, Room).join(Room, Room.id == HousekeepingTask.room_id)
        .where(HousekeepingTask.property_id == current_user.property_id,
               or_(HousekeepingTask.status.in_(OPEN), HousekeepingTask.completed_at >= since))
        .order_by(HousekeepingTask.created_at)
    )).all()
    return [task_out(task, room) for task, room in rows]


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(data: TaskCreate, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    if data.task_type not in TASK_TYPES:
        raise HTTPException(422, "Task type must be cleaning or maintenance")
    room = await db.scalar(select(Room).where(Room.id == data.room_id, Room.property_id == current_user.property_id, Room.is_active.is_(True)))
    if room is None:
        raise HTTPException(404, "Room not found")
    duplicate = await db.scalar(select(HousekeepingTask.id).where(HousekeepingTask.room_id == room.id, HousekeepingTask.task_type == data.task_type, HousekeepingTask.status.in_(OPEN)))
    if duplicate:
        raise HTTPException(409, f"Room {room.room_number} already has an open {data.task_type} task")
    now = datetime.utcnow()
    assignee = (data.assignee or "").strip() or None
    task = HousekeepingTask(property_id=room.property_id, room_id=room.id, room_number=room.room_number, task_type=data.task_type,
                            priority=data.priority, assignee=assignee, notes=data.notes,
                            supplies=json.dumps([supply.model_dump() for supply in data.supplies]) if data.supplies else None,
                            status="assigned" if assignee else "pending", assigned_at=now if assignee else None,
                            created_by_user_id=current_user.id, created_at=now)
    db.add(task)
    await db.flush()
    await sync_room_status(db, room)
    await db.commit()
    return task_out(task, room)


@router.patch("/tasks/{task_id}")
async def update_task(task_id: int, data: TaskUpdate, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    task = await db.scalar(select(HousekeepingTask).where(HousekeepingTask.id == task_id, HousekeepingTask.property_id == current_user.property_id))
    if task is None:
        raise HTTPException(404, "Task not found")
    room = await db.get(Room, task.room_id)
    changes = data.model_dump(exclude_unset=True)
    now = datetime.utcnow()
    if "assignee" in changes:
        task.assignee = (changes["assignee"] or "").strip() or None
        if task.assignee and task.status == "pending":
            task.status, task.assigned_at = "assigned", now
    if "supplies" in changes:
        task.supplies = json.dumps([supply.model_dump() for supply in data.supplies or []]) if data.supplies else None
    if "notes" in changes:
        task.notes = changes["notes"]
    if "priority" in changes:
        task.priority = changes["priority"]
    new_status = changes.get("status")
    if new_status and new_status != task.status:
        if new_status not in FLOW:
            raise HTTPException(422, "Unknown task status")
        if task.status == "done":
            raise HTTPException(409, "This task is already finished")
        if new_status != "pending" and not task.assignee:
            raise HTTPException(409, "Assign someone before moving the task on")
        task.status = new_status
        if new_status == "assigned":
            task.assigned_at = task.assigned_at or now
        if new_status == "in_progress":
            task.started_at = task.started_at or now
        if new_status == "done":
            task.completed_at = now
    if room:
        await sync_room_status(db, room)
    await db.commit()
    return task_out(task, room)
