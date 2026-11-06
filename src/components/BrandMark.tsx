import { brand } from "@/lib/brand";
import { cn } from "@/lib/cn";

/**
 * Inline SVG logo + wordmark. Drawn in code (no image file, no external URL) so
 * it is crisp at any size, themeable, and can never break from a dead link.
 */
export function BrandMark({
  className,
  showName = true,
}: {
  className?: string;
  showName?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        width="28"
        height="28"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="9" fill="var(--accent)" />
        <path
          d="M5 19c2.2 0 2.2-6 4.4-6s2.2 6 4.4 6 2.2-6 4.4-6 2.2 6 4.4 6 2.2-6 4.4-6"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showName && (
        <span className="text-lg font-extrabold tracking-tight text-heading">
          {brand.name}
        </span>
      )}
    </span>
  );
}
