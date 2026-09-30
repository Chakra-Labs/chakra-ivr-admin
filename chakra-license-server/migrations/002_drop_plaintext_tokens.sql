-- 002: forget the plaintext keys. IRREVERSIBLE — run by hand, once:
--   * 001 has been applied, and
--   * the admin panel, license server and speech gateway running in production
--     are the versions that look keys up by token_hash.
-- Clients keep working: they present the key, services compare its hash.
-- After this nobody (including us) can read a client's key back; a lost key is
-- replaced with "Rotate key" in the admin panel.

UPDATE licenses SET token = NULL WHERE token_hash IS NOT NULL AND token IS NOT NULL;
