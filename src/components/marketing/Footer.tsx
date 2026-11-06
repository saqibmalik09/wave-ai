import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { BrandMark } from "@/components/BrandMark";
import { CurrentYear } from "@/components/CurrentYear";
import { brand } from "@/lib/brand";

const columns = [
  {
    title: "Product",
    links: ["Models", "Pricing", "Enterprise", "Mobile apps"],
  },
  {
    title: "Company",
    links: ["About", "Careers", "Contact", "Blog"],
  },
  {
    title: "Legal",
    links: ["Privacy Policy", "Terms & Conditions", "Refund Policy", "Cookie Policy"],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <Container>
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" aria-label="AiWave home">
              <BrandMark />
            </Link>
            <p className="mt-4 max-w-xs text-sm text-muted">
              {brand.description}
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-heading">{col.title}</h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#"
                      className="text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-border py-6 text-sm text-muted sm:flex-row">
          <p>© <CurrentYear /> {brand.name}. All rights reserved.</p>
          <a
            href={`mailto:${brand.email}`}
            className="transition-colors hover:text-foreground"
          >
            {brand.email}
          </a>
        </div>
      </Container>
    </footer>
  );
}
