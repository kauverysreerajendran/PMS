from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.auth import router as auth_router
from app.api.checkins import router as checkins_router
from app.api.checkouts import router as checkouts_router
from app.api.reservations import router as reservations_router
from app.api.guests import router as guests_router
from app.api.billing import router as billing_router
from app.api.properties import router as properties_router
from app.api.rooms import router as rooms_router
from app.api.folio import router as folio_router
from app.db.database import Base, engine


# Important: import models before create_all
import app.models


@asynccontextmanager
async def lifespan(app: FastAPI):

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text("ALTER TABLE reservations ADD COLUMN IF NOT EXISTS total_amount INTEGER")
        )
        await conn.execute(
            text("ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'cash'")
        )
        await conn.execute(
            text("ALTER TABLE checkins ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'pending'")
        )
        await conn.execute(
            text("ALTER TABLE users ALTER COLUMN property_id DROP NOT NULL")
        )
        await conn.execute(
            text("ALTER TABLE properties ADD COLUMN IF NOT EXISTS logo_url TEXT")
        )
        # Multi-hotel ownership: link each hotel to its owner, back-filling existing owners.
        await conn.execute(
            text("ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id)")
        )
        await conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_properties_owner_id ON properties (owner_id)")
        )
        await conn.execute(
            text(
                "UPDATE properties p SET owner_id = u.id FROM users u "
                "WHERE u.role = 'owner' AND u.property_id = p.id AND p.owner_id IS NULL"
            )
        )
        for statement in (
            "ALTER TABLE guests ADD COLUMN IF NOT EXISTS address TEXT",
            "ALTER TABLE guests ADD COLUMN IF NOT EXISTS identity_type VARCHAR(50)",
            "ALTER TABLE guests ADD COLUMN IF NOT EXISTS identity_number VARCHAR(100)",
            "ALTER TABLE guests ADD COLUMN IF NOT EXISTS nationality VARCHAR(100)",
            "ALTER TABLE guests ADD COLUMN IF NOT EXISTS identity_document_path VARCHAR(500)",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS rooms_count INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS rate_plan VARCHAR(100)",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS nightly_rate INTEGER",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS rate_override_reason TEXT",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS taxes_amount INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS additional_charges INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS special_requests TEXT",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS send_confirmation_voucher BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS is_group_booking BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS group_name VARCHAR(150)",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS booking_source VARCHAR(150)",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS business_source VARCHAR(150)",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS market_code VARCHAR(100)",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_due_at TIMESTAMP",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS release_at TIMESTAMP",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS group_size INTEGER",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS quick_group_booking BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMP",
            "ALTER TABLE reservations ADD COLUMN IF NOT EXISTS required_advance_amount INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE checkins ADD COLUMN IF NOT EXISTS folio_number VARCHAR(40)",
        ):
            await conn.execute(text(statement))

    yield

    await engine.dispose()


app = FastAPI(
    title="Hotel Management API",
    version="1.0.0",
    lifespan=lifespan
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(checkins_router)
app.include_router(checkouts_router)
app.include_router(reservations_router)
app.include_router(guests_router)
app.include_router(billing_router)
app.include_router(properties_router)
app.include_router(rooms_router)
app.include_router(folio_router)


@app.get("/")
async def root():
    return {
        "message": "Backend is running"
    }


@app.get("/health")
async def health():
    return {
        "status": "ok"
    }
