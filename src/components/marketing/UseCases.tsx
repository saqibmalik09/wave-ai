"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";

const tabs = [
  {
    key: "Marketers",
    title: "Generate campaign visuals",
    body: "Four directions from one prompt. Describe a banner, a social post or a blog graphic and get variations back in seconds, then change the background or object by describing the change.",
  },
  {
    key: "Professionals",
    title: "Draft, summarise, decide faster",
    body: "Turn long documents into clear summaries, compare model answers side by side, and get a consensus you can act on — without switching tools.",
  },
  {
    key: "Students",
    title: "Learn any topic, your way",
    body: "Ask once and review multiple explanations. Pick the clearest answer or merge them into one, with sources and step-by-step reasoning.",
  },
  {
    key: "Founders",
    title: "Ship an idea in an afternoon",
    body: "Describe the landing page you want and watch it build section by section, then publish to a real URL — no developer needed.",
  },
  {
    key: "Creators",
    title: "From script to screen",
    body: "Describe the shot, the lighting and the cuts, then come back to an HD clip ready to post. Test a concept today instead of booking a shoot.",
  },
];

export function UseCases() {
  const [active, setActive] = useState(0);
  const current = tabs[active];

  return (
    <section className="bg-surface-muted py-16 sm:py-24">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
            10x the output. Without 10 different tools.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            From everyday tasks to bigger ideas, here&apos;s what you can get
            done.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {tabs.map((t, i) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={i === active}
              className={
                i === active
                  ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  : "rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
              }
            >
              {t.key}
            </button>
          ))}
        </div>

        <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-border bg-surface p-7 shadow-sm sm:p-10">
          <h3 className="text-xl font-bold text-heading sm:text-2xl">
            {current.title}
          </h3>
          <p className="mt-3 text-muted">{current.body}</p>
        </div>
      </Container>
    </section>
  );
}
