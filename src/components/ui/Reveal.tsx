import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * Entrance animation (fade + translateY) implemented with pure CSS — no JS and
 * no framer-motion.
 *
 * Why: the children are part of the server-rendered HTML and are always visible
 * by themselves; the motion is only a CSS layer on top. So the page renders its
 * content for crawlers and for users even if JavaScript is slow, blocked, or
 * hydration fails — it can never get stuck invisible at opacity:0. The animation
 * runs once on load and honors `prefers-reduced-motion` (handled in globals.css).
 *
 * `immediate` is kept for API compatibility (every reveal now animates on load).
 */
export function Reveal({
  children,
  delay = 0,
  className,
  immediate,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /** Deprecated: retained so existing call sites keep working. */
  immediate?: boolean;
}) {
  void immediate;
  const style =
    delay > 0 ? ({ "--aw-delay": `${delay}s` } as CSSProperties) : undefined;

  return (
    <div className={cn("aw-reveal", className)} style={style}>
      {children}
    </div>
  );
}
