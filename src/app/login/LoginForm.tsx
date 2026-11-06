"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Check } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { GoogleIcon } from "@/components/GoogleIcon";
import { CurrentYear } from "@/components/CurrentYear";
import { brand } from "@/lib/brand";

export function LoginForm() {
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // UI only for now — backend auth is wired in a later phase.
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 900);
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
        <Link href="/" className="relative" aria-label="AiWave home">
          <span className="inline-flex items-center gap-2 text-primary-foreground">
            <BrandMark showName={false} />
            <span className="text-lg font-extrabold tracking-tight text-white">
              {brand.name}
            </span>
          </span>
        </Link>

        <div className="relative">
          <h2 className="max-w-md text-3xl font-extrabold leading-tight text-white">
            One subscription. 100+ of the world&apos;s best AI models.
          </h2>
          <ul className="mt-8 space-y-4">
            {[
              "Compare top models side by side",
              "Chat, images, video, slides and websites",
              "A fraction of the cost of separate plans",
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
            <Link href="/" aria-label="AiWave home">
              <BrandMark />
            </Link>
          </div>

          <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-muted">
            Log in to continue to {brand.name}.
          </p>

          {/* Google login */}
          <button
            type="button"
            className="mt-7 flex h-11 w-full items-center justify-center gap-3 rounded-full border border-border-strong bg-surface text-[15px] font-semibold text-foreground transition-colors hover:bg-surface-muted"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-muted">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
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
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-foreground outline-none transition-shadow placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-foreground"
                >
                  Password
                </label>
                <a href="#" className="text-sm font-medium text-accent-dark hover:underline">
                  Forgot?
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11 w-full rounded-xl border border-border bg-surface px-4 pr-11 text-[15px] text-foreground outline-none transition-shadow placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25"
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-primary-foreground transition-all hover:bg-black active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : "Log in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            New to {brand.name}?{" "}
            <Link href="/login" className="font-semibold text-accent-dark hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
