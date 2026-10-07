import asyncio

from sqlalchemy import select

from app.db.database import SessionLocal
from app.models.user import Property, User
from app.core.security import hash_password


async def seed_data():
    async with SessionLocal() as db:

        # Create property
        result = await db.execute(
            select(Property).where(
                Property.property_code == "STAYHUB001"
            )
        )

        property_obj = result.scalar_one_or_none()

        if property_obj is None:
            property_obj = Property(
                property_code="STAYHUB001",
                name="StayHub Hotel",
                is_active=True,
            )

            db.add(property_obj)
            await db.flush()

            print("Property created.")
        else:
            print("Property already exists.")

        # Create Front Office user
        result = await db.execute(
            select(User).where(
                User.email == "frontoffice@stayhub.com"
            )
        )

        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                username="frontoffice",
                email="frontoffice@stayhub.com",
                mobile="9876543210",
                password_hash=hash_password("1234"),
                role="front_desk_agent",
                property_id=property_obj.id,
                is_active=True,
                failed_login_attempts=0,
                is_locked=False,
            )

            db.add(user)

            print("Front Office user created.")
        else:
            print("Front Office user already exists.")

        await db.commit()

        print("Seed completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_data())