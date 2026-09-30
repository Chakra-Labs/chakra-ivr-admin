// Who may use the admin hub, and the check every API route runs.
//
// Admins come from the server environment only:
//   ADMIN_USERS=admin@chakralabs.lk=scrypt:16384:8:1:<salt>:<hash>,other@chakralabs.lk=scrypt:...
// (make a hash with `pnpm hash-password`). No admins configured = nobody can sign in.
import { cookies } from "next/headers";

import { readSession, SESSION_COOKIE } from "./session";

export function adminUsers(): Map<string, string> {
  const users = new Map<string, string>();
  for (const entry of (process.env.ADMIN_USERS ?? "").split(",")) {
    const i = entry.indexOf("=");
    if (i <= 0) continue;
    const email = entry.slice(0, i).trim().toLowerCase();
    const hash = entry.slice(i + 1).trim();
    if (email && hash.startsWith("scrypt:")) users.set(email, hash);
  }
  return users;
}

/** The signed-in admin's email, or null. Re-checks the admin list, so removing
 * someone from ADMIN_USERS locks them out at once, not when their cookie expires. */
export async function currentAdmin(): Promise<string | null> {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return adminUsers().has(session.sub) ? session.sub : null;
}

export function unauthorized(): Response {
  return Response.json({ error: "not signed in" }, { status: 401 });
}
