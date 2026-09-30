"""License server: checks a client's API key and records their call minutes.

Keys are looked up by SHA-256 hash (see migrations/001_hash_tokens.sql). The
plaintext `token` column is only consulted for rows 001 has not converted.
"""

import hashlib
import os
from contextlib import asynccontextmanager

import asyncpg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

load_dotenv()

db_pool: asyncpg.Pool | None = None

# Mock mode answers from a fixed list instead of the database. It used to switch
# on silently whenever DATABASE_URL was missing — so a misconfigured production
# server would have accepted the test key. Now it must be asked for explicitly.
MOCK_MODE = os.getenv("LICENSE_SERVER_MOCK") == "1"
MOCK_VALID_TOKENS = {"chk_live_test123": True, "chk_live_unpaid456": False}

LOOKUP = """
    SELECT id, company_name, is_active FROM licenses
    WHERE token_hash = $1 OR (token_hash IS NULL AND token = $2)
"""


def key_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        db_pool = await asyncpg.create_pool(database_url, min_size=1, max_size=10)
    elif not MOCK_MODE:
        raise RuntimeError("DATABASE_URL is not set (set LICENSE_SERVER_MOCK=1 for local testing only)")
    else:
        print("WARNING: LICENSE_SERVER_MOCK=1 — answering from test keys, not the database.")
    yield
    if db_pool:
        await db_pool.close()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class TokenRequest(BaseModel):
    token: str = Field(min_length=8, max_length=200)


class UsageRequest(TokenRequest):
    minutes_used: int = Field(ge=0, le=24 * 60)  # one report is one call


@app.get("/health")
async def health():
    return {"status": "ok", "mode": "mock" if db_pool is None else "database"}


@app.post("/verify")
async def verify_token(req: TokenRequest):
    """Is this CHAKRA_AUTH_TOKEN active and paid?"""
    if db_pool is None:
        if MOCK_VALID_TOKENS.get(req.token) is True:
            return {"status": "valid", "company": "Test Company"}
        raise HTTPException(status_code=401, detail="Unauthorized or unpaid token")

    row = await db_pool.fetchrow(LOOKUP, key_hash(req.token), req.token)
    if row and row["is_active"]:
        return {"status": "valid", "company": row["company_name"]}
    raise HTTPException(status_code=401, detail="Unauthorized, invalid, or unpaid token")


@app.post("/track-usage")
async def track_usage(req: UsageRequest):
    """Add a finished call's minutes to the key's total."""
    if db_pool is None:
        return {"status": "mock_updated", "added": req.minutes_used}

    row = await db_pool.fetchrow(LOOKUP, key_hash(req.token), req.token)
    if row is None or not row["is_active"]:
        # Same answer for unknown and disabled keys: don't confirm which keys exist.
        raise HTTPException(status_code=401, detail="Unauthorized, invalid, or unpaid token")
    new_total = await db_pool.fetchval(
        "UPDATE licenses SET used_minutes = used_minutes + $1 WHERE id = $2 RETURNING used_minutes",
        req.minutes_used,
        row["id"],
    )
    return {"status": "updated", "total_minutes": new_total}
