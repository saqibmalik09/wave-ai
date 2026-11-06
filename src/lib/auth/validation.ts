/**
 * Pure validation helpers shared by the auth forms (client) and the Route
 * Handlers (server). No secrets, no Node APIs — safe to import anywhere.
 */

/** Pragmatic email check (format only; the real test is a confirmation flow). */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Returns a list of human-readable reasons a password is unacceptable.
 * Empty array means the password is acceptable.
 */
export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!/[a-zA-Z]/.test(password)) {
    issues.push("Include at least one letter");
  }
  if (!/[0-9]/.test(password)) {
    issues.push("Include at least one number");
  }
  return issues;
}

/** True when the password passes all strength rules. */
export function isStrongPassword(password: string): boolean {
  return passwordIssues(password).length === 0;
}

/** A coarse 0–3 strength score for the sign-up meter. */
export function passwordScore(password: string): number {
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score++;
  if (/[a-zA-Z]/.test(password) && /[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password) && password.length >= 12) score++;
  return score;
}

/** Normalises a display name, falling back to the email's local part. */
export function normalizeName(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed.slice(0, 60);
  const local = email.split("@")[0] ?? "there";
  return local.slice(0, 60);
}
