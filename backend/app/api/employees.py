from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_front_office_manager
from app.db.database import get_db
from app.models.employee import Employee
from app.models.user import User

router = APIRouter(prefix="/employees", tags=["Employees"])
SHIFTS = {"Morning", "Evening", "Night", "General"}


class EmployeeIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    department: str = Field(min_length=1, max_length=60)
    designation: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=150)
    shift: str | None = None
    joined_on: date | None = None
    notes: str | None = Field(default=None, max_length=1000)
    is_on_duty: bool = True


def employee_out(employee: Employee) -> dict:
    return {key: getattr(employee, key) for key in ("id", "name", "department", "designation", "phone", "email", "shift", "joined_on", "notes", "is_on_duty")}


def _clean(data: EmployeeIn) -> dict:
    if data.shift and data.shift not in SHIFTS:
        raise HTTPException(422, "Shift must be Morning, Evening, Night or General")
    values = data.model_dump()
    for key in ("name", "department", "designation", "phone", "email", "notes"):
        if isinstance(values[key], str):
            values[key] = values[key].strip() or None
    if not values["name"] or not values["department"]:
        raise HTTPException(422, "Name and department are required")
    return values


async def _employee(employee_id: int, user: User, db: AsyncSession) -> Employee:
    employee = await db.scalar(select(Employee).where(Employee.id == employee_id, Employee.property_id == user.property_id, Employee.is_active.is_(True)))
    if employee is None:
        raise HTTPException(404, "Employee not found")
    return employee


@router.get("")
async def list_employees(department: str | None = Query(default=None, max_length=60), current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    query = select(Employee).where(Employee.property_id == current_user.property_id, Employee.is_active.is_(True))
    if department:
        query = query.where(Employee.department == department)
    return [employee_out(employee) for employee in (await db.execute(query.order_by(Employee.department, Employee.name))).scalars()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_employee(data: EmployeeIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    employee = Employee(property_id=current_user.property_id, **_clean(data))
    db.add(employee)
    await db.commit()
    await db.refresh(employee)
    return employee_out(employee)


@router.patch("/{employee_id}")
async def update_employee(employee_id: int, data: EmployeeIn, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    employee = await _employee(employee_id, current_user, db)
    for key, value in _clean(data).items():
        setattr(employee, key, value)
    await db.commit()
    await db.refresh(employee)
    return employee_out(employee)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_employee(employee_id: int, current_user: User = Depends(get_front_office_manager), db: AsyncSession = Depends(get_db)):
    employee = await _employee(employee_id, current_user, db)
    employee.is_active = False   # kept so past housekeeping records still read correctly
    await db.commit()
