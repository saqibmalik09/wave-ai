"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { brand } from "@/lib/brand";

const features = [
  "100+ models with Compare Mode and Consensus",
  "Images: up to 3,600 with edit and templates",
  "Videos: up to 360 at 480p, or 120 at HD",
  "Slides: 3,600+ with AI outlining and editing",
  "Websites: up to 60 with free hosting",
  "Deep research: up to 240 interactive reports",
];

export function Pricing() {
  const [yearly, setYearly] = useState(true);
  const perMonth = yearly ? Math.round((brand.priceYearly / 12) * 10) / 10 : brand.priceMonthly;

  return (
    <section id="pricing" className="py-16 sm:py-24">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
            The best value in AI
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            One subscription replaces every model and app for less than you
            already spend.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <span className={yearly ? "text-muted" : "font-semibold text-foreground"}>
            Monthly
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={yearly}
            onClick={() => setYearly((v) => !v)}
            className="relative h-7 w-12 rounded-full bg-accent transition-colors"
          >
            <span
              className={
                "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all " +
                (yearly ? "left-6" : "left-1")
              }
            />
          </button>
          <span className={yearly ? "font-semibold text-foreground" : "text-muted"}>
            Yearly
          </span>
          <span className="rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-dark">
            Save 38%
          </span>
        </div>

        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-accent-border bg-surface p-8 shadow-[0_8px_30px_rgba(16,24,40,0.08)]">
          <p className="text-sm font-semibold text-accent-dark">
            {yearly ? "Pay once a year" : "Pay monthly"}
          </p>
          <div className="mt-2 flex items-end gap-1">
            <span className="text-5xl font-extrabold tracking-tight text-heading">
              ${perMonth}
            </span>
            <span className="mb-1.5 text-muted">/month</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {yearly
              ? `Billed $${brand.priceYearly} yearly`
              : "Billed monthly, cancel anytime"}
          </p>

          <ButtonLink href="/login" size="lg" className="mt-6 w-full">
            Buy now
          </ButtonLink>

          <ul className="mt-7 space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-foreground">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-dark">
                  <Check size={13} strokeWidth={3} />
                </span>
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-xs text-muted">
            Token usage policy applies
          </p>
        </div>
      </Container>
    </section>
  );
}
