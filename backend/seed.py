import asyncio

from sqlalchemy import select

from app.db.database import SessionLocal
from app.models.user import Property, User
from app.core.security import hash_password


# One dev login per role: username and password are both the role name.
# The owner starts without a hotel so they land on "Create Hotel".
ROLE_USERS = [
    {"role": "owner", "has_property": False},
    {"role": "front_office_manager", "has_property": True},
    {"role": "front_desk_agent", "has_property": True},
]


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

        # Create one user per role
        for spec in ROLE_USERS:
            role = spec["role"]
            result = await db.execute(
                select(User).where(User.username == role)
            )

            if result.scalar_one_or_none() is not None:
                print(f"{role} user already exists.")
                continue

            db.add(
                User(
                    username=role,
                    email=f"{role}@stayhub.com",
                    mobile=None,
                    password_hash=hash_password(role),
                    role=role,
                    property_id=property_obj.id if spec["has_property"] else None,
                    is_active=True,
                    failed_login_attempts=0,
                    is_locked=False,
                )
            )

            print(f"{role} user created.")

        await db.commit()

        print("Seed completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_data())
