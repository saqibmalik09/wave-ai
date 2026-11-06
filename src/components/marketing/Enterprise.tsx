import { ShieldCheck, Headphones, BarChart3 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ButtonLink } from "@/components/ui/Button";

export function Enterprise() {
  return (
    <section id="enterprise" className="py-16 sm:py-24">
      <Container>
        <div className="overflow-hidden rounded-3xl border border-border bg-primary px-7 py-12 text-center sm:px-12 sm:py-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-primary-foreground sm:text-4xl">
            Bring every AI model to your team
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-white/70">
            SSO and central billing, usage controls per model, and 24/7 human
            support.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-white/80">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={18} className="text-accent" /> SSO &amp; central billing
            </span>
            <span className="inline-flex items-center gap-2">
              <BarChart3 size={18} className="text-accent" /> Usage by model
            </span>
            <span className="inline-flex items-center gap-2">
              <Headphones size={18} className="text-accent" /> 24/7 human support
            </span>
          </div>

          <ButtonLink href="/login" variant="accent" size="lg" className="mt-8">
            Explore more
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
