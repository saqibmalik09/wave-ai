import { Sparkles, Globe, Clapperboard, Presentation, ImageIcon, Columns2, Mic, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";

const pills = [
  { label: "Websites", icon: Globe },
  { label: "Videos", icon: Clapperboard },
  { label: "Slides", icon: Presentation },
  { label: "Images", icon: ImageIcon },
  { label: "Compare", icon: Columns2 },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* soft radial wash, pure CSS (no image) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, var(--accent-tint) 0%, transparent 70%)",
        }}
      />
      <Container className="pt-16 pb-14 sm:pt-20 sm:pb-20 text-center">
        <Reveal immediate>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent-border bg-accent-tint px-3 py-1 text-xs font-semibold text-accent-dark">
            <Sparkles size={14} /> Trusted by 1M+ users
          </span>
        </Reveal>

        <Reveal immediate delay={0.05}>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight text-heading sm:text-5xl lg:text-6xl">
            World&apos;s Best AI Models &amp; Tools.
            <br className="hidden sm:block" /> One Subscription.
          </h1>
        </Reveal>

        <Reveal immediate delay={0.1}>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">
            Use 100+ AI models, with dedicated tools for chat, images, videos,
            presentations and websites — all for a fraction of the cost.
          </p>
        </Reveal>

        <Reveal immediate delay={0.15}>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/login" size="lg" className="w-full sm:w-auto">
              Start using AiWave
            </ButtonLink>
            <ButtonLink
              href="#pricing"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
            >
              See pricing
            </ButtonLink>
          </div>
        </Reveal>

        {/* Chat composer preview */}
        <Reveal immediate delay={0.2}>
          <div className="mx-auto mt-14 max-w-2xl">
            <div className="rounded-2xl border border-border bg-surface p-2 shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
              <div className="flex items-center gap-3 rounded-xl px-3 py-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-muted text-muted">
                  <Plus size={18} />
                </span>
                <span className="flex-1 text-left text-[15px] text-muted">
                  Explain inflation in simple terms
                </span>
                <span className="hidden items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground sm:inline-flex">
                  Auto
                </span>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-muted text-muted">
                  <Mic size={16} />
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {pills.map((p) => (
                <span
                  key={p.label}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-sm"
                >
                  <p.icon size={16} className="text-accent" />
                  {p.label}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
