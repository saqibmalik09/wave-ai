import { NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/auth/store";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isValidEmail } from "@/lib/auth/validation";
import type { SessionUser } from "@/lib/auth/types";

/** Email + password login. Sets the session cookie on success. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const data = (body ?? {}) as { email?: unknown; password?: unknown };
  const email = String(data.email ?? "").trim().toLowerCase();
  const password = String(data.password ?? "");

  if (!isValidEmail(email) || password.length === 0) {
    return NextResponse.json(
      { error: "Enter a valid email and your password." },
      { status: 400 }
    );
  }

  const user = await findUserByEmail(email);
  // Verify even when the user is missing to keep timing roughly constant.
  const passwordOk = user
    ? await verifyPassword(password, user.passwordHash)
    : false;

  if (!user || !passwordOk) {
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 }
    );
  }

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  await createSession(sessionUser);

  return NextResponse.json({ user: sessionUser });
}
