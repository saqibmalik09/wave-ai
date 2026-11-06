import {
  Wand2,
  GitMerge,
  Sparkles,
  Library,
  Bot,
  Columns2,
  ArrowRight,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";

const features = [
  {
    icon: Columns2,
    title: "Compare Mode",
    body: "Ask once, review multiple responses side by side, and pick the best answer.",
  },
  {
    icon: Wand2,
    title: "Auto Mode",
    body: "Every question goes to whichever model is best suited to answer it.",
  },
  {
    icon: GitMerge,
    title: "Consensus",
    body: "One answer built from where the models agree, with disagreements flagged.",
  },
  {
    icon: Sparkles,
    title: "Prompt Enhancer",
    body: "Turn a rough idea into a precise, detailed prompt in one click.",
  },
  {
    icon: Library,
    title: "Library",
    body: "Every image, video, chat and file you create, saved and searchable.",
  },
  {
    icon: Bot,
    title: "Experts",
    body: "Build a specialist assistant with its own instructions, knowledge and model.",
  },
];

export function Features() {
  return (
    <section className="bg-surface-muted py-16 sm:py-24">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
            Everything you need to work smarter
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Features built to save you time and improve your output by 10x.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 0.06}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-accent-border hover:shadow-[0_12px_30px_rgba(16,24,40,0.08)]">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(60% 70% at 100% 0%, var(--accent-tint) 0%, transparent 70%)",
                  }}
                />
                <span
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm transition-transform duration-300 group-hover:scale-105"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)",
                  }}
                >
                  <f.icon size={22} />
                </span>
                <h3 className="mt-5 text-lg font-bold text-heading">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-dark opacity-0 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100">
                  Learn more
                  <ArrowRight size={15} />
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
