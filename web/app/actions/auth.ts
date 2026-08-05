"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type AuthActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isRateLimitMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("rate limit") || m.includes("too many") || m.includes("over_email");
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const target = normalizeEmail(email);

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => normalizeEmail(u.email ?? "") === target);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Create a confirmed account (no confirmation email).
 * Never changes an existing user's password.
 */
export async function signUpConfirmedAction(
  emailRaw: string,
  password: string,
): Promise<AuthActionResult> {
  const email = normalizeEmail(emailRaw);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email.", code: "invalid_email" };
  }
  if (password.length < 6) {
    return {
      ok: false,
      error: "Password must be at least 6 characters.",
      code: "weak_password",
    };
  }

  try {
    const existingId = await findUserIdByEmail(email);
    if (existingId) {
      return {
        ok: false,
        error: "An account with this email already exists. Try signing in.",
        code: "already_exists",
      };
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (!error) return { ok: true };

    const msg = error.message.toLowerCase();
    const already =
      msg.includes("already") ||
      msg.includes("registered") ||
      msg.includes("exists") ||
      error.status === 422;

    if (already) {
      return {
        ok: false,
        error: "An account with this email already exists. Try signing in.",
        code: "already_exists",
      };
    }

    if (isRateLimitMessage(error.message)) {
      return {
        ok: false,
        error:
          "Too many sign-ups on that address. Sign in if you already registered, or try a plus-alias like you+resumate@gmail.com.",
        code: "rate_limit",
      };
    }

    return { ok: false, error: error.message, code: "signup_failed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign up failed";
    if (isRateLimitMessage(message)) {
      return {
        ok: false,
        error:
          "Too many attempts. Wait a minute, or try you+resumate@gmail.com.",
        code: "rate_limit",
      };
    }
    return { ok: false, error: message, code: "signup_failed" };
  }
}

/**
 * If login fails with "Email not confirmed", confirm the account so password
 * sign-in can proceed. Password is still required on the subsequent sign-in.
 */
export async function confirmEmailForLoginAction(
  emailRaw: string,
): Promise<AuthActionResult> {
  const email = normalizeEmail(emailRaw);
  if (!email) {
    return { ok: false, error: "Enter your email.", code: "invalid_email" };
  }

  try {
    const admin = createAdminClient();
    const userId = await findUserIdByEmail(email);
    if (!userId) {
      return {
        ok: false,
        error: "No account found for that email. Create one first.",
        code: "not_found",
      };
    }

    const { error } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (error) {
      return { ok: false, error: error.message, code: "confirm_failed" };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not confirm email";
    return { ok: false, error: message, code: "confirm_failed" };
  }
}
