import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { updateUserPhone } from "@/lib/auth/store";

/**
 * Update the signed-in user's phone number (store + editable now). Setting a
 * number resets verification — the schema is OTP-ready (`phoneVerified`) but no
 * SMS/OTP is wired yet. Guests have no DB row, so they cannot set a phone.
 *
 * Body: { phone: string | null }
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  if (user.role === "guest" || user.email === null) {
    return NextResponse.json(
      { error: "Guests cannot save a phone number. Create an account first." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const raw = (body ?? {}) as { phone?: unknown };
  let phone: string | null;
  if (raw.phone === null || raw.phone === "" || raw.phone === undefined) {
    phone = null;
  } else {
    const v = String(raw.phone).trim();
    // Lightweight E.164-ish check; real validation happens at OTP time later.
    if (!/^\+?[0-9][0-9\s().-]{5,18}$/.test(v)) {
      return NextResponse.json(
        { error: "Enter a valid phone number." },
        { status: 400 }
      );
    }
    phone = v;
  }

  const result = await updateUserPhone(user.id, phone);
  if (!result.ok) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    phone: result.user.phone,
    phoneVerified: result.user.phoneVerified,
  });
}
