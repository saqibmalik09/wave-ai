"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Loader2,
  Check,
  UserRound,
  AlertCircle,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoogleIcon } from "@/components/GoogleIcon";
import { CurrentYear } from "@/components/CurrentYear";
import { brand } from "@/lib/brand";
import { guestRequest, signupRequest } from "@/lib/auth/client";
import {
  isValidEmail,
  passwordIssues,
  passwordScore,
} from "@/lib/auth/validation";

const STRENGTH_LABELS = ["Weak", "Okay", "Good", "Strong"];
const STRENGTH_COLORS = [
  "bg-red-400",
  "bg-amber-400",
  "bg-accent",
  "bg-accent-dark",
];

export function SignupForm() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = loading || guestLoading;
  const score = useMemo(() => passwordScore(password), [password]);
  const issues = useMemo(() => passwordIssues(password), [password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (issues.length > 0) {
      setError("Please choose a stronger password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don’t match.");
      return;
    }

    setLoading(true);
    const result = await signupRequest(name, email, password);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    toast.success("Account created. Welcome!");
    router.push("/dashboard");
    router.refresh();
  }

  async function onGuest() {
    setError(null);
    setGuestLoading(true);
    const result = await guestRequest();
    if (!result.ok) {
      setError(result.error);
      setGuestLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel (hidden on small screens) */}
      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:w-1/2 lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 40% at 30% 10%, rgba(48,166,109,0.35) 0%, transparent 70%)",
          }}
        />
        <Link href="/" className="relative" aria-label={`${brand.name} home`}>
          <span className="inline-flex items-center gap-2 text-primary-foreground">
            <BrandMark showName={false} />
            <span className="text-lg font-extrabold tracking-tight text-white">
              {brand.name}
            </span>
          </span>
        </Link>

        <div className="relative">
          <h2 className="max-w-md text-3xl font-extrabold leading-tight text-white">
            Create your account and start building in minutes.
          </h2>
          <ul className="mt-8 space-y-4">
            {[
              "Chat, images, video, slides and websites",
              "Compare top models side by side",
              "Cancel anytime — no lock-in",
            ].map((f) => (
              <li key={f} className="flex items-center gap-3 text-white/85">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white">
                  <Check size={14} strokeWidth={3} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/50">
          © <CurrentYear /> {brand.name}
        </p>
      </aside>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Link href="/" aria-label={`${brand.name} home`}>
              <BrandMark />
            </Link>
          </div>

          <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-muted">
            Start using {brand.name} in minutes.
          </p>

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              toast.info("Google sign-up isn’t configured yet.", {
                description: "Use email and password, or continue as a guest.",
              })
            }
            className="mt-7 flex h-11 w-full items-center justify-center gap-3 rounded-full border border-border-strong bg-surface text-[15px] font-semibold text-foreground transition-colors hover:bg-surface-muted disabled:opacity-60"
          >
            <GoogleIcon />
            Sign up with Google
          </button>

          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="name"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-foreground outline-none transition-shadow placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-foreground outline-none transition-shadow placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="h-11 w-full rounded-xl border border-border bg-surface px-4 pr-11 text-[15px] text-foreground outline-none transition-shadow placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
                />
                <button
                  type="button"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-surface-muted"
                >
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          i < score
                            ? STRENGTH_COLORS[Math.min(score, 3) - 1]
                            : "bg-border"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {score > 0
                      ? `Strength: ${STRENGTH_LABELS[Math.min(score, 3)]}`
                      : "Strength: Weak"}
                    {issues.length > 0 && ` · ${issues.join(" · ")}`}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="confirm"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Confirm password
              </label>
              <input
                id="confirm"
                type={showPw ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirm}
                disabled={busy}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-foreground outline-none transition-shadow placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60"
              />
              {confirm.length > 0 && confirm !== password && (
                <p className="mt-1.5 text-xs text-red-600">
                  Passwords don’t match.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground transition-all hover:bg-black active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={onGuest}
            disabled={busy}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border-strong bg-surface text-[15px] font-semibold text-foreground transition-colors hover:bg-surface-muted disabled:opacity-60"
          >
            {guestLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <UserRound size={17} />
                Continue as guest
              </>
            )}
          </button>

          <p className="mt-6 text-center text-sm text-muted">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-accent-dark hover:underline"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
