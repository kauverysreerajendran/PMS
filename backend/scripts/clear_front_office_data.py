"""Clear Front Office operational data while keeping users and properties.

Run from the backend folder:
    venv\\Scripts\\python.exe scripts\\clear_front_office_data.py --yes
"""

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import delete

# Make `app` imports work when this file is run directly from scripts/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.database import SessionLocal
from app.models.reservation import CheckIn, CheckOut, Guest, Payment, Reservation
from app.models.reservation_history import ReservationHistory


async def clear_front_office_data() -> None:
    """Delete dependent records first, then reservations and guest profiles."""
    async with SessionLocal() as session:
        deleted = {}
        for label, model in (
            ("reservation history", ReservationHistory),
            ("payments", Payment),
            ("check-outs", CheckOut),
            ("check-ins", CheckIn),
            ("reservations", Reservation),
            ("guests", Guest),
        ):
            result = await session.execute(delete(model))
            deleted[label] = result.rowcount or 0
        await session.commit()

    print("Front Office operational data cleared:")
    for label, count in deleted.items():
        print(f"- {label}: {count}")
    print("Users, properties, roles, and application configuration were not changed.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Clear Front Office operational data.")
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm deletion of Front Office guest and stay records.",
    )
    args = parser.parse_args()
    if not args.yes:
        parser.error("This operation deletes Front Office data. Re-run with --yes to confirm.")
    asyncio.run(clear_front_office_data())


if __name__ == "__main__":
    main()
