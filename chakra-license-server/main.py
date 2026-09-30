import os
import asyncpg
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Database connection pool
db_pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("WARNING: DATABASE_URL not set. Running in Mock Mode.")
    else:
        db_pool = await asyncpg.create_pool(database_url)
    yield
    if db_pool:
        await db_pool.close()

app = FastAPI(lifespan=lifespan)

class TokenRequest(BaseModel):
    token: str

@app.post("/verify")
async def verify_token(req: TokenRequest):
    """
    Verifies if a given CHAKRA_AUTH_TOKEN is active and valid.
    """
    if not db_pool:
        # Fallback Mock Mode if no database is connected (useful for testing)
        MOCK_VALID_TOKENS = {"chk_live_test123": True, "chk_live_unpaid456": False}
        is_active = MOCK_VALID_TOKENS.get(req.token)
        if is_active is True:
            return {"status": "valid", "company": "Test Company"}
        else:
            raise HTTPException(status_code=401, detail="Unauthorized or unpaid token")

    # Real Database Check
    async with db_pool.acquire() as connection:
        # We assume a table exists: licenses (token text, company_name text, is_active boolean)
        query = "SELECT company_name, is_active FROM licenses WHERE token = $1"
        row = await connection.fetchrow(query, req.token)
        
        if row and row["is_active"]:
            return {"status": "valid", "company": row["company_name"]}
        else:
            raise HTTPException(status_code=401, detail="Unauthorized, invalid, or unpaid token")

class UsageRequest(BaseModel):
    token: str
    minutes_used: int

@app.post("/track-usage")
async def track_usage(req: UsageRequest):
    """
    Increments the used_minutes for a given token after a call completes.
    """
    if not db_pool:
        return {"status": "mock_updated", "added": req.minutes_used}
        
    async with db_pool.acquire() as connection:
        query = "UPDATE licenses SET used_minutes = used_minutes + $1 WHERE token = $2 RETURNING used_minutes"
        new_total = await connection.fetchval(query, req.minutes_used, req.token)
        
        if new_total is not None:
            return {"status": "updated", "total_minutes": new_total}
        else:
            raise HTTPException(status_code=404, detail="Token not found")
