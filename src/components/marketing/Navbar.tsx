"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";
import { BrandMark } from "@/components/BrandMark";

const navLinks = [
  { label: "Models", href: "#models" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQs", href: "#faq" },
  { label: "Enterprise", href: "#enterprise" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <Container>
        <div className="flex h-16 items-center justify-between">
          <Link href="/" aria-label="AiWave home">
            <BrandMark />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <ButtonLink href="/login" variant="ghost" size="sm">
              Login
            </ButtonLink>
            <ButtonLink href="/login" size="sm">
              Start using {""}AiWave
            </ButtonLink>
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-surface-muted md:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </Container>

      {/* Mobile drawer */}
      {open && (
        <div className="border-t border-border bg-surface md:hidden">
          <Container>
            <nav className="flex flex-col py-3">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-3 text-base font-medium text-foreground hover:bg-surface-muted"
                >
                  {l.label}
                </a>
              ))}
              <div className="mt-2 flex flex-col gap-2 pb-2">
                <ButtonLink href="/login" variant="outline" size="md">
                  Login
                </ButtonLink>
                <ButtonLink href="/login" size="md">
                  Start using AiWave
                </ButtonLink>
              </div>
            </nav>
          </Container>
        </div>
      )}
    </header>
  );
}
