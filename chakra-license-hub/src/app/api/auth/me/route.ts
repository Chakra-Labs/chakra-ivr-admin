import { currentAdmin, unauthorized } from "@/lib/auth";

export async function GET() {
  const email = await currentAdmin();
  return email ? Response.json({ email }) : unauthorized();
}
