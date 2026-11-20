import { getCurrentAccount } from "@/lib/auth";
import { isDeveloper } from "@/lib/dev-preview";

export async function GET() {
  const account = await getCurrentAccount();
  return Response.json({ ok: true, account, developer: isDeveloper(account) });
}
