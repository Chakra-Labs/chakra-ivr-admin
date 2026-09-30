"""Create (or bring up to date) the `licenses` table.

    DATABASE_URL=postgresql://... python init_db.py

The connection string comes from the environment only — never put it in this
file. (It used to be hard-coded here and was committed; that password must be
rotated in Neon.)
"""

import asyncio
import os
import sys
from pathlib import Path

import asyncpg

MIGRATIONS = sorted((Path(__file__).parent / "migrations").glob("*.sql"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS licenses (
    id            SERIAL PRIMARY KEY,
    token         TEXT UNIQUE,              -- legacy plaintext; NULL once migrated
    token_hash    TEXT UNIQUE,              -- sha256(key) hex: what lookups use
    token_prefix  TEXT,                     -- first 16 characters, for display
    company_name  TEXT NOT NULL,
    package_name  TEXT,
    is_active     BOOLEAN DEFAULT true,
    used_minutes  INTEGER DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""


async def init_db() -> None:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        sys.exit("DATABASE_URL is not set")
    conn = await asyncpg.connect(url)
    try:
        await conn.execute(SCHEMA)
        # Only the additive migration runs automatically; 002 (drop plaintext
        # keys) is irreversible and run by hand once hashed lookups are live.
        for path in MIGRATIONS:
            if path.name.startswith("001_"):
                await conn.execute(path.read_text(encoding="utf-8"))
                print(f"applied {path.name}")
        print("licenses table ready")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(init_db())
