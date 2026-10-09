"""Delete all records except master data (properties and users), then re-seed.

What is kept:
- users (unlocked, failed-login counters reset)
- properties that a non-owner user still belongs to (e.g. STAYHUB001)
- rooms, if that table exists

What is deleted:
- reservations, guests, check-ins, check-outs, payments, reservation history
- login sessions, login history, password reset tokens
- hotels created by owners; owners are unlinked so they see "Create Hotel" again

Run from the backend folder:
    .venv\\Scripts\\python.exe cleardb.py --yes
"""

import argparse
import asyncio

from sqlalchemy import text

from app.db.database import SessionLocal
from seed import seed_data

# Children first so foreign keys are never violated.
TRANSACTIONAL_TABLES = [
    "reservation_history",
    "payments",
    "checkouts",
    "checkins",
    "reservations",
    "guests",
    "password_reset",
    "user_sessions",
    "login_history",
]


async def table_exists(session, name: str) -> bool:
    return (await session.execute(text("SELECT to_regclass(:name)"), {"name": f"public.{name}"})).scalar() is not None


async def clear_db() -> None:
    deleted = {}
    async with SessionLocal() as session:
        for table in TRANSACTIONAL_TABLES:
            if not await table_exists(session, table):
                continue
            result = await session.execute(text(f'DELETE FROM "{table}"'))
            deleted[table] = result.rowcount or 0

        result = await session.execute(text("UPDATE users SET property_id = NULL WHERE role = 'owner' AND property_id IS NOT NULL"))
        deleted["owners unlinked from hotel"] = result.rowcount or 0

        rooms_guard = "AND NOT EXISTS (SELECT 1 FROM rooms r WHERE r.property_id = p.id)" if await table_exists(session, "rooms") else ""
        result = await session.execute(text(
            f"DELETE FROM properties p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.property_id = p.id) {rooms_guard}"
        ))
        deleted["properties (owner-created)"] = result.rowcount or 0

        await session.execute(text("UPDATE users SET failed_login_attempts = 0, is_locked = false"))
        await session.commit()

    print("Cleared:")
    for label, count in deleted.items():
        print(f"- {label}: {count}")
    print("Users and master properties were kept. Re-seeding role logins...")
    await seed_data()


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete all records except master data.")
    parser.add_argument("--yes", action="store_true", help="Confirm deletion.")
    args = parser.parse_args()
    if not args.yes:
        parser.error("This deletes all non-master data. Re-run with --yes to confirm.")
    asyncio.run(clear_db())


if __name__ == "__main__":
    main()
