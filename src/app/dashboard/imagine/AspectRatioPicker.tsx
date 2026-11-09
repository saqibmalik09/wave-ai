"use client";

/**
 * Aspect-ratio dropdown for the Imagine composer.
 *
 * Lists every entry of `ASPECT_RATIOS` as "ratio  Label" with a checkmark on
 * the selected one, and draws a live preview whose shape follows the
 * highlighted row. The shapes are plain bordered boxes sized from the option's
 * numeric `ratio` — no images, no canvas, no per-frame work.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { ASPECT_RATIOS, type AspectRatio } from "@/lib/ai/types";
import { cn } from "@/lib/cn";

/** Sizes a box to `ratio` (w/h) so its longest side is `max` pixels. */
function boxSize(ratio: number | null, max: number): { w: number; h: number } {
  if (ratio === null) return { w: max, h: Math.round(max * 0.72) };
  return ratio >= 1
    ? { w: max, h: Math.max(4, Math.round(max / ratio)) }
    : { w: Math.max(4, Math.round(max * ratio)), h: max };
}

function RatioGlyph({ ratio }: { ratio: number | null }) {
  const { w, h } = boxSize(ratio, 14);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-[3px] border-[1.5px] border-current",
        ratio === null && "border-dashed"
      )}
      style={{ width: w, height: h }}
    />
  );
}

export function AspectRatioPicker({
  value,
  onChange,
  disabled = false,
  disabledReason,
}: {
  value: AspectRatio;
  onChange: (next: AspectRatio) => void;
  disabled?: boolean;
  /** Tooltip explaining why the picker is locked (reference image attached). */
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selectedIndex = useMemo(
    () => Math.max(0, ASPECT_RATIOS.findIndex((o) => o.value === value)),
    [value]
  );
  const selected = ASPECT_RATIOS[selectedIndex];
  const previewed = ASPECT_RATIOS[highlight] ?? selected;

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // One document listener, only while the menu is open, removed on close.
  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function openMenu() {
    setHighlight(selectedIndex);
    setOpen(true);
  }

  function choose(index: number) {
    const option = ASPECT_RATIOS[index];
    if (option) onChange(option.value);
    close(true);
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "ArrowDown":
        e.preventDefault();
        setHighlight((i) => (i + 1) % ASPECT_RATIOS.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlight(
          (i) => (i - 1 + ASPECT_RATIOS.length) % ASPECT_RATIOS.length
        );
        break;
      case "Home":
        e.preventDefault();
        setHighlight(0);
        break;
      case "End":
        e.preventDefault();
        setHighlight(ASPECT_RATIOS.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(highlight);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  const preview = boxSize(previewed.ratio, 120);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        aria-label={`Aspect ratio: ${selected.value === "auto" ? "Auto" : `${selected.value} ${selected.label}`}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => (open ? close(false) : openMenu())}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors",
          disabled
            ? "cursor-not-allowed text-muted/60"
            : open
              ? "border-accent-border bg-accent-tint text-accent-dark"
              : "text-muted hover:bg-surface-muted"
        )}
      >
        <RatioGlyph ratio={selected.ratio} />
        {selected.value === "auto" ? "Auto" : selected.value}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 flex overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
          {/* Live preview of the highlighted ratio. */}
          <div className="hidden w-44 shrink-0 flex-col items-center justify-center gap-3 border-r border-border bg-surface-muted p-4 sm:flex">
            <div className="flex h-[124px] items-center justify-center">
              {previewed.ratio === null ? (
                <span className="text-xs text-muted">No fixed shape</span>
              ) : (
                <span
                  aria-hidden
                  className="rounded-md border border-border-strong bg-surface"
                  style={{ width: preview.w, height: preview.h }}
                />
              )}
            </div>
            <span className="text-xs font-medium text-muted">
              {previewed.label}
            </span>
          </div>

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-label="Aspect ratio"
            aria-activedescendant={`${listboxId}-${highlight}`}
            onKeyDown={onListKeyDown}
            className="max-h-[260px] w-[216px] overflow-y-auto p-1.5 outline-none"
          >
            {ASPECT_RATIOS.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li key={option.value}>
                  <div
                    id={`${listboxId}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(index)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                      index === highlight
                        ? "bg-surface-muted text-heading"
                        : "text-foreground"
                    )}
                  >
                    <span className="w-10 shrink-0 tabular-nums text-foreground">
                      {option.value === "auto" ? "Auto" : option.value}
                    </span>
                    <span className="flex-1 truncate text-muted">
                      {option.value === "auto" ? "" : option.label}
                    </span>
                    {isSelected && (
                      <Check size={15} className="shrink-0 text-heading" aria-hidden />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
