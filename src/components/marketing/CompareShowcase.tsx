import {
  Columns2,
  Globe,
  Presentation,
  Clapperboard,
  ImageIcon,
  Telescope,
  ArrowRight,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { ModelLogo, type ModelKey } from "@/components/icons/ModelLogo";

const tabs = [Columns2, Globe, Presentation, Clapperboard, ImageIcon, Telescope];

const columns: { key: ModelKey; name: string; lines: number }[] = [
  { key: "openai", name: "GPT-5 nano", lines: 5 },
  { key: "gemini", name: "Gemini 2.5 Lite", lines: 6 },
  { key: "deepseek", name: "DeepSeek Chat", lines: 4 },
];

export function CompareShowcase() {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <Reveal>
          <div
            className="overflow-hidden rounded-[28px] p-6 sm:p-10"
            style={{
              background:
                "linear-gradient(120deg, #d6f3e2 0%, #d9ecf6 55%, #e7e0f7 100%)",
            }}
          >
            {/* Tab icons */}
            <div className="mb-8 flex justify-center gap-2">
              {tabs.map((Icon, i) => (
                <span
                  key={i}
                  className={
                    "inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors " +
                    (i === 0
                      ? "bg-primary text-white shadow"
                      : "bg-white/70 text-foreground")
                  }
                >
                  <Icon size={18} />
                </span>
              ))}
            </div>

            <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              {/* Copy */}
              <div>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent-dark">
                  <Columns2 size={16} /> Compare Mode
                </span>
                <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-heading sm:text-4xl">
                  Compare Top Models Together.
                </h2>
                <p className="mt-4 max-w-md text-muted">
                  Ask once, review multiple responses, choose the best answer, or
                  generate consensus with one click.
                </p>
                <ButtonLink href="/login" size="lg" className="mt-6">
                  Compare models <ArrowRight size={18} />
                </ButtonLink>
              </div>

              {/* Dark app mock */}
              <div className="rounded-2xl bg-[#101114] p-3 shadow-2xl ring-1 ring-black/10">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="ml-3 text-xs text-white/40">
                    MBA or switch jobs
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {columns.map((c) => (
                    <div
                      key={c.name}
                      className="rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/5"
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <ModelLogo model={c.key} size={18} />
                        <span className="truncate text-[11px] font-semibold text-white/80">
                          {c.name}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {Array.from({ length: c.lines }).map((_, i) => (
                          <span
                            key={i}
                            className="block h-1.5 rounded-full bg-white/10"
                            style={{ width: `${70 + ((i * 13) % 30)}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/5">
                  <span className="text-[11px] text-white/40">
                    Want one combined answer from all models?
                  </span>
                  <span className="ml-auto rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold text-white">
                    Consensus
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
