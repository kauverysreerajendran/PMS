"""Demo room data for a hotel: more rooms with full details, a few in-house guests,
rooms that just checked out (waiting for housekeeping) and one room under maintenance.

Safe to run more than once: rooms that already exist are only filled in where blank,
and demo stays are skipped if their room already has one.

    cd backend
    .venv\\Scripts\\python scripts\\seed_demo_rooms.py            # hotel of the front_office_manager user
    .venv\\Scripts\\python scripts\\seed_demo_rooms.py --property 5
"""
import argparse
import asyncio
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from secrets import token_hex

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.db.database import SessionLocal  # noqa: E402
from app.models import CheckIn, CheckOut, Guest, Payment, Reservation, Room, User  # noqa: E402
from app.models.employee import Employee  # noqa: E402
from app.models.housekeeping import HousekeepingTask  # noqa: E402

DEMO = "[demo]"
TODAY = date.today()

# number, floor, category, type, name, rate, bed, sq ft, adults, children, amenities
ROOMS = [
    ("101", "1", "Deluxe", "Double", "Deluxe Sea View", 8500, "1 King Bed", 420, 2, 1, "Sea View, Balcony, Breakfast, Free Wi-Fi"),
    ("102", "1", "Deluxe", "Double", "Deluxe Sea View", 8500, "1 King Bed", 420, 2, 1, "Sea View, Balcony, Breakfast, Free Wi-Fi"),
    ("103", "1", "Standard", "Twin", "Standard Twin Room", 5000, "2 Single Beds", 320, 2, 1, "City View, Workspace, Breakfast, Free Wi-Fi"),
    ("104", "1", "Standard", "Double", "Standard Double Room", 4800, "1 Queen Bed", 300, 2, 0, "City View, Workspace, Free Wi-Fi"),
    ("201", "2", "Superior", "Double", "Superior Garden Room", 6500, "1 Queen Bed", 360, 2, 1, "Garden View, Breakfast, Smart TV, Free Wi-Fi"),
    ("202", "2", "Superior", "Triple", "Superior Family Room", 7200, "1 King + 1 Single", 400, 3, 1, "Garden View, Breakfast, Smart TV, Free Wi-Fi"),
    ("203", "2", "Superior", "Double", "Superior Garden Room", 6500, "1 Queen Bed", 360, 2, 1, "Garden View, Breakfast, Smart TV, Free Wi-Fi"),
    ("204", "2", "Premium", "Double", "Premium City View", 7500, "1 Queen Bed", 380, 2, 1, "City View, Smart TV, Minibar, Free Wi-Fi"),
    ("301", "3", "Suite", "Suite", "Executive Suite", 12000, "1 King Bed", 650, 3, 1, "Living Area, Sea View, Breakfast, Bathtub"),
    ("302", "3", "Premium", "Family", "Premium Family Room", 9000, "1 King + Sofa Bed", 480, 3, 2, "City View, Smart TV, Minibar, Breakfast"),
    ("303", "3", "Premium", "Double", "Premium City View", 7500, "1 Queen Bed", 380, 2, 1, "City View, Smart TV, Minibar, Free Wi-Fi"),
    ("304", "3", "Deluxe", "Twin", "Deluxe Twin Sea View", 8200, "2 Single Beds", 410, 2, 1, "Sea View, Balcony, Breakfast, Free Wi-Fi"),
    ("401", "4", "Suite", "Suite", "Executive Suite", 12500, "1 King Bed", 680, 3, 1, "Living Area, Sea View, Breakfast, Bathtub"),
    ("402", "4", "Luxury", "Suite", "Presidential Suite", 35000, "1 King Bed", 1500, 4, 2, "Panoramic View, Living Area, Jacuzzi, Butler Service"),
    ("V1", "G", "Villa", "Villa", "Private Pool Villa", 25000, "1 King Bed", 1200, 4, 2, "Private Pool, Garden View, Breakfast, Butler Service"),
]

# room, first, last, adults, children, nights before today, nights after today
IN_HOUSE = [
    ("103", "Ananya", "Gupta", 2, 0, 1, 2),
    ("204", "Rahul", "Verma", 1, 0, 0, 1),
    ("302", "Maria", "Fernandes", 2, 1, 2, 3),
    ("401", "Arvind", "Menon", 2, 0, 1, 4),
    ("V1", "Sophie", "Laurent", 2, 0, 3, 2),
]
# room, first, last, nights (ending today), housekeeping status, cleaner, supplies
DEPARTED = [
    ("104", "Meera", "Pillai", 2, "pending", None, []),
    ("203", "Karan", "Shah", 3, "in_progress", "Lakshmi R.",
     [{"item": "Bed linen set", "qty": 1}, {"item": "Bath towels", "qty": 4}, {"item": "Toiletries kit", "qty": 2}, {"item": "Trash bags", "qty": 2}]),
]
MAINTENANCE = [("304", "Suresh K.", "AC not cooling; technician checking the outdoor unit.",
                [{"item": "Gas refill kit", "qty": 1}, {"item": "Tool box", "qty": 1}])]

# name, department, designation, shift, phone
EMPLOYEES = [
    ("Lakshmi R.", "Housekeeping", "Room Attendant", "Morning", "9840012345"),
    ("Priya S.", "Housekeeping", "Room Attendant", "Morning", "9840012346"),
    ("Ravi K.", "Housekeeping", "Housekeeping Supervisor", "General", "9840012347"),
    ("Meena T.", "Housekeeping", "Room Attendant", "Evening", "9840012348"),
    ("Suresh K.", "Maintenance", "Maintenance Technician", "General", "9840012349"),
    ("Arun P.", "Maintenance", "Electrician", "Evening", "9840012350"),
    ("Anil M.", "Kitchen", "Chef de Cuisine", "Morning", "9840012351"),
    ("Divya N.", "Front Office", "Guest Relations Executive", "Morning", "9840012352"),
]


def code(prefix: str, property_id: int) -> str:
    return f"{prefix}-{property_id}-{TODAY:%Y%m%d}-{token_hex(3).upper()}"


async def main(property_id: int | None) -> None:
    async with SessionLocal() as db:
        manager = await db.scalar(select(User).where(User.username == "front_office_manager"))
        property_id = property_id or (manager.property_id if manager else None)
        if property_id is None:
            raise SystemExit("No hotel found: pass --property <id>")
        user = await db.scalar(select(User).where(User.property_id == property_id).order_by(User.id)) or manager
        rooms: dict[str, Room] = {room.room_number: room for room in (await db.execute(select(Room).where(Room.property_id == property_id))).scalars()}

        added = filled = 0
        for number, floor, category, room_type, name, rate, bed, size, adults, children, amenities in ROOMS:
            room = rooms.get(number)
            if room is None:
                room = Room(property_id=property_id, room_number=number, room_category=category, floor=floor, status="available",
                            max_adults=adults, max_children=children, capacity=adults + children, is_active=True)
                db.add(room)
                rooms[number] = room
                added += 1
            elif not room.is_active:
                continue
            # Only fill what is blank, so details already edited in Room Master are kept.
            for field, value in (("room_type", room_type), ("display_name", name), ("base_rate", rate), ("bed_type", bed), ("size_sqft", size), ("amenities", amenities), ("floor", floor)):
                if getattr(room, field) in (None, ""):
                    setattr(room, field, value)
                    filled += 1
        await db.flush()

        async def has_demo_stay(number: str) -> bool:
            return bool(await db.scalar(select(Reservation.id).where(Reservation.property_id == property_id, Reservation.room_number == number, Reservation.notes.contains(DEMO))))

        async def stay(number: str, first: str, last: str, adults: int, children: int, start: date, end: date, status: str) -> tuple[Reservation, Guest]:
            room = rooms[number]
            guest = Guest(property_id=property_id, first_name=first, last_name=last, email=f"{first}.{last}@example.com".lower(),
                          mobile=f"98{token_hex(4)[:8].translate(str.maketrans('abcdef', '123456'))}", identity_type="Passport" if first == "Sophie" else "Aadhaar",
                          identity_number=token_hex(5).upper(), nationality="French" if first == "Sophie" else "Indian")
            db.add(guest)
            await db.flush()
            nights = (end - start).days
            reservation = Reservation(property_id=property_id, reservation_code=code("RES", property_id), guest_id=guest.id, room_number=number,
                                      room_category=room.room_category, check_in_date=start, check_out_date=end, adults=adults, children=children,
                                      status=status, source="front_desk", booking_source="Direct", rate_plan="Room Only", nightly_rate=room.base_rate,
                                      total_amount=(room.base_rate or 0) * nights, notes=f"{DEMO} Demo stay", created_by_user_id=user.id)
            db.add(reservation)
            await db.flush()
            checkin = CheckIn(property_id=property_id, reservation_id=reservation.id, guest_id=guest.id, room_number=number,
                              identity_document_type=guest.identity_type, identity_document_number=guest.identity_number,
                              verification_status="verified", folio_number=code("FOL", property_id), checked_in_by_user_id=user.id,
                              checked_in_at=datetime.combine(start, datetime.min.time()) + timedelta(hours=8, minutes=30))
            db.add(checkin)
            await db.flush()
            return reservation, checkin

        in_house = departed = maintenance = 0
        for number, first, last, adults, children, before, after in IN_HOUSE:
            if await has_demo_stay(number):
                continue
            await stay(number, first, last, adults, children, TODAY - timedelta(days=before), TODAY + timedelta(days=after), "checked_in")
            in_house += 1

        now = datetime.utcnow()
        for number, first, last, nights, task_status, cleaner, supplies in DEPARTED:
            if await has_demo_stay(number):
                continue
            reservation, checkin = await stay(number, first, last, 2, 0, TODAY - timedelta(days=nights), TODAY, "checked_out")
            db.add(Payment(property_id=property_id, reservation_id=reservation.id, amount=reservation.total_amount or 0, payment_method="card",
                           reference_number=f"DEMO-{token_hex(3).upper()}", notes=DEMO, received_by_user_id=user.id))
            db.add(CheckOut(property_id=property_id, reservation_id=reservation.id, checkin_id=checkin.id, guest_id=reservation.guest_id,
                            room_number=number, payment_status="paid", payment_method="card", notes=DEMO, checked_out_by_user_id=user.id,
                            checked_out_at=now - timedelta(hours=2)))
            room = rooms[number]
            db.add(HousekeepingTask(property_id=property_id, room_id=room.id, room_number=number, reservation_id=reservation.id, task_type="cleaning",
                                    status=task_status, priority="high" if task_status == "pending" else "normal", assignee=cleaner,
                                    supplies=json.dumps(supplies) if supplies else None, notes=f"Departure clean after {reservation.reservation_code}",
                                    created_by_user_id=user.id, created_at=now - timedelta(hours=2),
                                    assigned_at=now - timedelta(minutes=50) if cleaner else None, started_at=now - timedelta(minutes=35) if task_status == "in_progress" else None))
            room.status = "cleaning" if task_status == "in_progress" else "dirty"
            departed += 1

        for number, worker, note, supplies in MAINTENANCE:
            room = rooms[number]
            if await db.scalar(select(HousekeepingTask.id).where(HousekeepingTask.room_id == room.id, HousekeepingTask.task_type == "maintenance", HousekeepingTask.status != "done")):
                continue
            db.add(HousekeepingTask(property_id=property_id, room_id=room.id, room_number=number, task_type="maintenance", status="in_progress",
                                    priority="high", assignee=worker, supplies=json.dumps(supplies), notes=note, created_by_user_id=user.id,
                                    created_at=now - timedelta(hours=3), assigned_at=now - timedelta(hours=3), started_at=now - timedelta(hours=1)))
            room.status = "maintenance"
            maintenance += 1

        staff_added = 0
        known = set((await db.execute(select(Employee.name).where(Employee.property_id == property_id, Employee.is_active.is_(True)))).scalars())
        for name, department, designation, shift, phone in EMPLOYEES:
            if name not in known:
                db.add(Employee(property_id=property_id, name=name, department=department, designation=designation, shift=shift, phone=phone,
                                joined_on=TODAY - timedelta(days=120), notes=DEMO))
                staff_added += 1

        await db.commit()
        print(f"Hotel {property_id}: {staff_added} employees added, {added} rooms added, {filled} details filled, {in_house} in-house stays, "
              f"{departed} departures sent to housekeeping, {maintenance} maintenance jobs. Total rooms: {len(rooms)}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--property", type=int, default=None)
    asyncio.run(main(parser.parse_args().property))
