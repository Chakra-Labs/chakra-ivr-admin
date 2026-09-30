# Chakra IVR Admin

| Part | What it is |
|---|---|
| `chakra-license-hub/` | Admin hub (Next.js 16): companies, API keys, packages, **GPU Fleet** |
| `chakra-license-server/` | License server (FastAPI): `/verify` and `/track-usage` for client apps |

Both use the `licenses` table in the admin database. The speech gateway in
`chakra-gpu-fleet` reads the same table to check client keys.

## Security model

- **Sign-in is enforced on the server.** `src/proxy.ts` sends anyone without a
  valid session to `/login`, and every API route checks the session again before
  touching data. Sessions are HMAC-signed, HttpOnly, SameSite=Strict cookies
  (12 hours). Cross-site writes are refused; 10 failed sign-ins per IP lock that
  IP out for 15 minutes.
- **Admins live in the server environment**, not the code: `ADMIN_USERS` holds
  `email=scrypt-hash` pairs. Removing someone from it locks them out at once.
- **API keys are stored as SHA-256 hashes.** A key is shown once, when created;
  after that only its first 16 characters. A lost key is replaced with
  **Rotate key**; the old one stops working (within 60 s at the speech gateway).
- **No secrets in the repo.** `.env` files are ignored; examples are in
  `.env.example`.

## Setup

```bash
# admin hub
cd chakra-license-hub
corepack pnpm@10 install
cp .env.example .env.local        # DATABASE_URL, SESSION_SECRET, ADMIN_USERS, FLEET_*
pnpm hash-password you@chakralabs.lk   # prints an ADMIN_USERS entry
pnpm dev

# license server
cd chakra-license-server
pip install -r requirements.txt
cp .env.example .env              # DATABASE_URL
python init_db.py                 # creates/updates the table, applies migration 001
uvicorn main:app --port 8000
```

In production both run on the fleet control host (see `chakra-gpu-fleet/deploy`),
built from their Dockerfiles, behind Caddy.

## One-time steps for the existing database

1. **Rotate the Neon database password.** It was hard-coded in `init_db.py` and
   in a committed `.env`; both are gone from the tree, but git history still has
   them, so the old password must be treated as public. Update every
   `DATABASE_URL` afterwards (license server, admin hub, speech gateway).
2. **Apply migration 001** (`python init_db.py`, or run
   `chakra-license-server/migrations/001_hash_tokens.sql`). Additive: it adds
   `token_hash`/`token_prefix` and hashes every existing key. Existing client
   keys keep working.
3. Deploy the new admin hub, license server and speech gateway (they look keys
   up by hash, with the plaintext column only as a fallback).
4. Then, once, run `migrations/002_drop_plaintext_tokens.sql`. **Irreversible**:
   it deletes the plaintext keys, after which nobody can read a client key back.

## Packages

Package names follow the price sheet (Essential … National Plus) and must match
`chakra-gpu-fleet/fleet/packages.yaml`, which sizes the GPU fleet from them.
Licences created under the old names (Starter, Growth, Scale, Enterprise - MD/LG)
are mapped there.
