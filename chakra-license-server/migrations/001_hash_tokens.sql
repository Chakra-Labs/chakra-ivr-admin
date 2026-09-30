-- 001: store API keys as SHA-256 hashes (additive, safe to re-run).
--
-- After this, every lookup (admin panel, license server, speech gateway) uses
-- token_hash; the plaintext `token` column is only a fallback for rows this
-- migration has not seen. Existing client keys keep working unchanged: their
-- hash is computed from the stored plaintext.
--
-- Uses the built-in sha256() (PostgreSQL 11+), no extension needed.

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS package_name TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS token_prefix TEXT;
ALTER TABLE licenses ALTER COLUMN token DROP NOT NULL;

UPDATE licenses
SET token_hash   = encode(sha256(convert_to(token, 'UTF8')), 'hex'),
    token_prefix = left(token, 16)
WHERE token IS NOT NULL AND token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS licenses_token_hash_key ON licenses (token_hash);
