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

    yield

    await engine.dispose()


app = FastAPI(
    title="StayHub API",
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


@app.get("/")
async def root():
    return {
        "message": "StayHub backend is running"
    }


@app.get("/health")
async def health():
    return {
        "status": "ok"
    }
