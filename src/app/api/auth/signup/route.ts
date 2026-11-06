import { NextResponse } from "next/server";
import { createUser } from "@/lib/auth/store";
import { createSession } from "@/lib/auth/session";
import {
  isStrongPassword,
  isValidEmail,
  normalizeName,
} from "@/lib/auth/validation";
import type { SessionUser } from "@/lib/auth/types";

/** Email + password registration. Creates the user and signs them in. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const data = (body ?? {}) as {
    name?: unknown;
    email?: unknown;
    password?: unknown;
  };
  const email = String(data.email ?? "").trim().toLowerCase();
  const password = String(data.password ?? "");
  const name = normalizeName(String(data.name ?? ""), email);

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }
  if (!isStrongPassword(password)) {
    return NextResponse.json(
      {
        error:
          "Password must be at least 8 characters and include a letter and a number.",
      },
      { status: 400 }
    );
  }

  const result = await createUser({ email, name, password });
  if (!result.ok) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const sessionUser: SessionUser = {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    role: result.user.role,
  };
  await createSession(sessionUser);

  return NextResponse.json({ user: sessionUser }, { status: 201 });
}
