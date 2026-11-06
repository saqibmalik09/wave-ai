import { Sparkles, Check } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { ModelLogo, type ModelKey } from "@/components/icons/ModelLogo";

const routeModels: {
  key: ModelKey;
  name: string;
  note?: string;
  state: "faded" | "normal" | "active";
}[] = [
  { key: "deepseek", name: "DeepSeek V4", state: "faded" },
  { key: "openai", name: "GPT-5.5", state: "normal" },
  { key: "claude", name: "Claude Opus 4.8", note: "Best for writing", state: "active" },
  { key: "gemini", name: "Gemini 3.1 Pro", state: "normal" },
  { key: "kimi", name: "Kimi K2", state: "faded" },
];

const consensusCards: { key: ModelKey; name: string; body: string }[] = [
  { key: "openai", name: "GPT-5.5", body: "Q3 launch, staged rollout. Start in India and PH." },
  { key: "claude", name: "Claude Opus 4.8", body: "Staged Q3 rollout. India first, then PH." },
  { key: "gemini", name: "Gemini 3.1 Pro", body: "Launch Q3 in phases. Lead with India and PH." },
];

export function AutoConsensus() {
  return (
    <section className="bg-surface-muted py-16 sm:py-24">
      <Container>
        <Reveal>
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
              Let AiWave pick, or merge every answer
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted">
              Auto Mode routes each question to the best model. Consensus blends
              them into one answer — with any disagreements flagged.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* Auto routing */}
          <Reveal>
            <div className="h-full rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
              <div className="flex items-center gap-4">
                <div className="w-1/2 rounded-xl border border-border bg-surface-muted p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="h-5 w-5 rounded-full bg-[#f6a07a]" /> You
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    Draft a launch plan for our new mobile app
                  </p>
                </div>

                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-white">
                  <Sparkles size={14} className="text-accent" /> Auto
                </span>
              </div>

              <div className="mt-5 space-y-2">
                {routeModels.map((m) => (
                  <div
                    key={m.name}
                    className={
                      "flex items-center gap-3 rounded-xl border px-4 py-3 transition-all " +
                      (m.state === "active"
                        ? "border-accent bg-accent-tint/50 shadow-sm"
                        : "border-border bg-surface ") +
                      (m.state === "faded" ? " opacity-45" : "")
                    }
                  >
                    <ModelLogo model={m.key} size={22} />
                    <span
                      className={
                        m.state === "active"
                          ? "font-bold text-heading"
                          : "font-medium text-foreground"
                      }
                    >
                      {m.name}
                    </span>
                    {m.note && (
                      <span className="ml-auto text-sm font-semibold text-accent-dark">
                        {m.note}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Consensus */}
          <Reveal delay={0.08}>
            <div className="relative h-full rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
              <div className="flex gap-3 overflow-hidden">
                {consensusCards.map((c, i) => (
                  <div
                    key={c.name}
                    className="w-1/3 rounded-xl border border-border bg-surface p-3 shadow-sm"
                    style={{ transform: `translateY(${i === 1 ? -8 : 0}px)` }}
                  >
                    <div className="mb-2 flex items-center gap-1.5">
                      <ModelLogo model={c.key} size={16} />
                      <span className="truncate text-[11px] font-bold text-heading">
                        {c.name}
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug text-muted">{c.body}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-border bg-surface p-4 shadow-md">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white">
                    <Sparkles size={14} />
                  </span>
                  <span className="font-bold text-heading">Consensus</span>
                  <span className="text-sm text-muted">· 3 models</span>
                  <span className="ml-auto rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-dark">
                    92% agreement
                  </span>
                </div>

                <ul className="mt-4 space-y-3 text-sm">
                  <li className="flex items-center gap-3 border-l-2 border-accent pl-3 font-semibold text-heading">
                    <Check size={15} className="text-accent" /> Launch in Q3 with a staged rollout
                  </li>
                  <li className="flex items-center gap-3 border-l-2 border-accent pl-3 font-semibold text-heading">
                    <Check size={15} className="text-accent" /> Lead with India, then the Philippines
                  </li>
                  <li className="flex items-center gap-3 border-l-2 border-amber-400 pl-3 text-muted">
                    <span className="text-xs font-semibold text-amber-500">differs</span>{" "}
                    Budget for the first 90 days
                  </li>
                </ul>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
