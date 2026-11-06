"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { ModelLogo, type ModelKey } from "@/components/icons/ModelLogo";
import { brand } from "@/lib/brand";

const catalog: { key: ModelKey; name: string; price: number }[] = [
  { key: "openai", name: "ChatGPT", price: 20 },
  { key: "claude", name: "Claude", price: 20 },
  { key: "gemini", name: "Gemini", price: 20 },
  { key: "perplexity", name: "Perplexity", price: 20 },
  { key: "grok", name: "Grok", price: 30 },
  { key: "deepseek", name: "DeepSeek", price: 10 },
];

const includes = [
  "100+ models with Compare Mode and Consensus",
  "Images, videos, slides and websites",
  "Deep research and Experts",
];

export function ValueSection() {
  const [selected, setSelected] = useState<Record<string, boolean>>({
    openai: true,
    claude: true,
    gemini: true,
  });
  const [yearly, setYearly] = useState(true);

  const toggle = (k: string) =>
    setSelected((s) => ({ ...s, [k]: !s[k] }));

  const { total, count } = useMemo(() => {
    let t = 0;
    let c = 0;
    for (const m of catalog) {
      if (selected[m.key]) {
        t += m.price;
        c += 1;
      }
    }
    return { total: t, count: c };
  }, [selected]);

  const awPerMonth = yearly
    ? Math.round((brand.priceYearly / 12) * 10) / 10
    : brand.priceMonthly;

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

        <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-[1fr_auto_1fr]">
          {/* Calculator */}
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <h3 className="text-lg font-bold text-heading">
              Which AI models do you use?
            </h3>
            <p className="mt-1 text-sm text-muted">
              Tap the ones you pay for today.
            </p>

            <div className="mt-5 space-y-2.5">
              {catalog.map((m) => {
                const on = !!selected[m.key];
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggle(m.key)}
                    aria-pressed={on}
                    className={
                      "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all " +
                      (on
                        ? "border-accent bg-accent-tint/40"
                        : "border-border bg-surface hover:bg-surface-muted")
                    }
                  >
                    <ModelLogo model={m.key} size={24} />
                    <span className="font-semibold text-foreground">{m.name}</span>
                    <span className="ml-auto text-sm font-medium text-muted">
                      ${m.price}/mo
                    </span>
                    <span
                      className={
                        "inline-flex h-5 w-5 items-center justify-center rounded-md border transition-colors " +
                        (on
                          ? "border-accent bg-accent text-white"
                          : "border-border-strong text-transparent")
                      }
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-xl bg-surface-muted p-4">
              <div className="flex items-end justify-between">
                <span className="text-sm text-muted">
                  {count} separate {count === 1 ? "login" : "logins"} to track
                </span>
                <span className="text-3xl font-extrabold text-heading">
                  ${total}
                  <span className="text-base font-medium text-muted">/mo</span>
                </span>
              </div>
            </div>
          </div>

          {/* VS */}
          <div className="flex items-center justify-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-sm font-extrabold text-muted shadow-sm">
              VS
            </span>
          </div>

          {/* AiWave card */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-accent bg-surface p-6 shadow-[0_8px_30px_rgba(48,166,109,0.12)] sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(70% 60% at 80% 0%, var(--accent-tint) 0%, transparent 70%)",
              }}
            />
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-accent-tint px-3 py-1 text-xs font-bold text-accent-dark">
                {brand.name}
              </span>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setYearly(false)}
                  className={!yearly ? "font-bold text-foreground" : "text-muted"}
                >
                  Monthly
                </button>
                <span className="text-border-strong">/</span>
                <button
                  type="button"
                  onClick={() => setYearly(true)}
                  className={yearly ? "font-bold text-foreground" : "text-muted"}
                >
                  Yearly
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-end gap-1">
              <span className="text-5xl font-extrabold tracking-tight text-heading">
                ${awPerMonth}
              </span>
              <span className="mb-1.5 text-muted">/month</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {yearly
                ? `Billed $${brand.priceYearly} yearly · one bill`
                : "Billed monthly · one bill"}
            </p>

            <ButtonLink href="/login" size="lg" className="mt-6 w-full">
              Buy now
            </ButtonLink>

            <ul className="mt-6 space-y-3">
              {includes.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-3 text-sm text-foreground"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent-dark">
                    <Check size={13} strokeWidth={3} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            {total > 0 && (
              <p className="mt-6 rounded-xl bg-accent-tint/60 px-4 py-3 text-center text-sm font-semibold text-accent-dark">
                Save ${Math.max(total - awPerMonth, 0).toFixed(0)}/month vs what
                you pay now
              </p>
            )}
            <p className="mt-3 text-center text-xs text-muted">
              Token usage policy applies
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
