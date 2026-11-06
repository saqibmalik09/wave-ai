import { Star } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";

const reviews = [
  {
    name: "A. Kutty",
    source: "App Store",
    body: "The standout feature is comparing different AI models side by side — incredibly practical. There's always a suitable model for any task, and reliability is impressive.",
  },
  {
    name: "G. Chuuu",
    source: "App Store",
    body: "Like having a smart, always-available assistant in your pocket. Whether I need help writing, planning or answering questions, it handles it all quickly.",
  },
  {
    name: "Akash",
    source: "App Store",
    body: "Been using this daily for work and it actually saves me time. Gives real answers, not generic stuff. The interface is clean and the responses make sense.",
  },
];

export function Testimonials() {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
            1M+ downloads. 15K+ reviews. And counting.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            See what people using AiWave have to say.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {reviews.map((r, i) => (
            <Reveal key={r.name} delay={i * 0.06}>
              <figure className="flex h-full flex-col rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <div className="flex gap-0.5 text-accent">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} size={16} fill="currentColor" />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-sm text-foreground">
                  “{r.body}”
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-tint text-sm font-bold text-accent-dark">
                    {r.name.charAt(0)}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-heading">
                      {r.name}
                    </span>
                    <span className="block text-xs text-muted">{r.source}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
