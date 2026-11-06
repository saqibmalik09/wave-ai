"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { brand } from "@/lib/brand";

const faqs = [
  {
    q: `What is ${brand.name}?`,
    a: `${brand.name} is an AI super app that unites 100+ premium AI models with built-in studios for images, video, websites and presentations, plus different chat modes — all under a single subscription.`,
  },
  {
    q: `Can I use ${brand.name} on mobile?`,
    a: "Yes. It runs in any mobile browser, and your chats follow you across every device you sign in on.",
  },
  {
    q: "Does it support file uploads?",
    a: "Yes. Attach documents, PDFs and images to any chat, or add files to a project so every conversation inside it can draw on them.",
  },
  {
    q: "Where can I get help?",
    a: `You can contact us any time at ${brand.email}.`,
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-surface-muted py-16 sm:py-24">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">
            Got questions about {brand.name}?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Find answers to commonly asked questions.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-2xl space-y-3">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div
                key={f.q}
                className="overflow-hidden rounded-xl border border-border bg-surface"
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="font-semibold text-heading">{f.q}</span>
                  <ChevronDown
                    size={18}
                    className={
                      "shrink-0 text-muted transition-transform " +
                      (isOpen ? "rotate-180" : "")
                    }
                  />
                </button>
                {isOpen && (
                  <p className="px-5 pb-5 text-sm text-muted">{f.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
