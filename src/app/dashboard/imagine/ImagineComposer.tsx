"use client";

/**
 * Imagine composer — one surface for image and video generation.
 *
 * Everything the user picks is quoted locally with `quote()` from the shared
 * contract, which is the same pure function the server re-runs when it charges.
 * The client number is a preview only: the server never trusts it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Clapperboard,
  Clock,
  Image as ImageIcon,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  MAX_DURATION_WITH_REFERENCE,
  MAX_REFERENCE_IMAGES,
  VIDEO_DURATIONS,
  VIDEO_RESOLUTIONS,
  quote,
  type AspectRatio,
  type Modality,
  type VideoDuration,
  type VideoResolution,
  type UploadedReferenceDTO,
  type WalletDTO,
} from "@/lib/ai/types";
import {
  STILL_IMAGE_FORMATS,
  usePendingAttachments,
  type AttachmentPolicy,
  type PendingAttachment,
} from "@/components/attachments/usePendingAttachments";
import { cn } from "@/lib/cn";
import { useDashboardChrome } from "../chrome-context";
import { useModelPrices } from "../useWallet";
import { AspectRatioPicker } from "./AspectRatioPicker";

/** References are still images only, capped by the model's own limit. */
const REFERENCE_POLICY: AttachmentPolicy = {
  kinds: ["image"],
  maxFiles: MAX_REFERENCE_IMAGES,
  formats: { image: STILL_IMAGE_FORMATS },
  itemNoun: "reference images",
  unsupportedHint: "Use a PNG, JPG or WebP image.",
};

const numberFormat = new Intl.NumberFormat("en-US");

function fmt(n: number): string {
  return numberFormat.format(Math.max(0, Math.round(n)));
}

/** `crypto.randomUUID` needs a secure context; fall back to a unique string. */
function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A reference image the server has stored and signed, with the moment its
 * capability URL stops working.
 */
type UploadedReference = { url: string; expiresAtMs: number };

/** Re-upload this long before expiry so a slow generation can't outlive it. */
const UPLOAD_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Raised when a reference upload fails, so the toast can say so plainly. */
class UploadError extends Error {}

/**
 * Stores one reference image and returns the signed URL the generate contract
 * takes. The server decides the container from magic bytes and owns the cap,
 * so nothing here is trusted beyond keeping the request well-formed.
 */
async function uploadReference(
  file: File,
  signal: AbortSignal
): Promise<UploadedReference> {
  const body = new FormData();
  body.append("file", file);

  let res: Response;
  try {
    res = await fetch("/api/ai/uploads", { method: "POST", body, signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new UploadError(`Could not upload “${file.name}”.`);
  }

  if (!res.ok) {
    throw new UploadError(await errorMessage(res));
  }

  const data = (await res.json()) as UploadedReferenceDTO;
  return { url: data.url, expiresAtMs: Date.parse(data.expiresAt) };
}

/**
 * Resolves every pending reference to a signed URL, reusing the ones already
 * stored and still valid. Uploads run together because the references are
 * independent and the server caps the rate itself.
 */
async function uploadReferences(
  attachments: readonly PendingAttachment[],
  cache: Map<string, UploadedReference>,
  signal: AbortSignal
): Promise<string[]> {
  // Drop anything the user has since removed before adding this round's entries.
  const live = new Set(attachments.map((a) => a.id));
  for (const id of cache.keys()) {
    if (!live.has(id)) cache.delete(id);
  }

  const cutoff = Date.now() + UPLOAD_REFRESH_MARGIN_MS;
  return Promise.all(
    attachments.map(async (attachment) => {
      const cached = cache.get(attachment.id);
      if (cached && cached.expiresAtMs > cutoff) return cached.url;

      const uploaded = await uploadReference(attachment.file, signal);
      cache.set(attachment.id, uploaded);
      return uploaded.url;
    })
  );
}

type GenerationResult = {
  modality: Modality;
  assetUrl: string;
  creditsCharged: number;
};

export function ImagineComposer() {
  const [modality, setModality] = useState<Modality>("image");
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState<VideoResolution>("720p");
  const [duration, setDuration] = useState<VideoDuration>(6);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("auto");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const references = usePendingAttachments(REFERENCE_POLICY);
  // One wallet for the whole dashboard: the sidebar card and this cost line
  // read the same balance, and a settled generation updates both at once.
  const { wallet, walletLoading, applyWallet, refreshWallet } =
    useDashboardChrome();
  const { prices, loading: pricesLoading } = useModelPrices();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Lets an identical retry of a failed submit reuse its idempotency key. */
  const retryRef = useRef<{ signature: string; key: string } | null>(null);
  /**
   * Signed URL per attachment, so a retry or a second prompt on the same
   * references doesn't re-upload the bytes. Pruned to the live attachments on
   * every submit, so it can't grow across a long session.
   */
  const uploadedRef = useRef<Map<string, UploadedReference>>(new Map());

  useEffect(() => () => abortRef.current?.abort(), []);

  const referenceCount = references.attachments.length;
  const hasReference = referenceCount > 0;

  // A reference pins both the clip length and the frame: the output always
  // matches the source image, so the picker is locked to Auto.
  const effectiveDuration: VideoDuration =
    hasReference && duration > MAX_DURATION_WITH_REFERENCE
      ? MAX_DURATION_WITH_REFERENCE
      : duration;
  const effectiveAspectRatio: AspectRatio = hasReference ? "auto" : aspectRatio;

  const currentQuote = useMemo(() => {
    if (prices.length === 0) return null;
    return quote(prices, {
      modality,
      resolution: modality === "video" ? resolution : undefined,
      duration: modality === "video" ? effectiveDuration : undefined,
      referenceCount,
    });
  }, [prices, modality, resolution, effectiveDuration, referenceCount]);

  const refusal = useMemo(() => {
    if (!currentQuote || !wallet) return null;
    if (currentQuote.credits > wallet.remaining) {
      return `Not enough credits — this needs ${fmt(currentQuote.credits)} and ${fmt(wallet.remaining)} are left.`;
    }
    if (
      wallet.weeklyLimit > 0 &&
      currentQuote.credits > wallet.weeklyRemaining
    ) {
      return `This week's limit is reached — ${fmt(currentQuote.credits)} needed, ${fmt(wallet.weeklyRemaining)} left until your week resets.`;
    }
    return null;
  }, [currentQuote, wallet]);

  const onPickFiles = useCallback(
    (list: FileList | null) => {
      const accepted = references.addFiles(list);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Clamp a too-long clip the moment the first reference lands.
      if (accepted.length > 0 && duration > MAX_DURATION_WITH_REFERENCE) {
        setDuration(MAX_DURATION_WITH_REFERENCE);
      }
    },
    [references, duration]
  );

  function openPicker() {
    if (references.atCapacity) {
      references.warnAtCapacity();
      return;
    }
    fileInputRef.current?.click();
  }

  const canSubmit =
    prompt.trim().length > 0 && !submitting && refusal === null;

  async function onSubmit() {
    const text = prompt.trim();
    if (!text || submitting) return;

    const signature = JSON.stringify([
      modality,
      text,
      modality === "video" ? resolution : null,
      modality === "video" ? effectiveDuration : null,
      effectiveAspectRatio,
      references.attachments.map((a) => a.id),
    ]);
    const idempotencyKey =
      retryRef.current?.signature === signature
        ? retryRef.current.key
        : newIdempotencyKey();
    retryRef.current = { signature, key: idempotencyKey };

    setSubmitting(true);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const referenceImageUrls = await uploadReferences(
        references.attachments,
        uploadedRef.current,
        controller.signal
      );

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          modality,
          prompt: text,
          ...(modality === "video"
            ? { resolution, duration: effectiveDuration }
            : {}),
          aspectRatio: effectiveAspectRatio,
          ...(referenceImageUrls.length > 0 ? { referenceImageUrls } : {}),
        }),
      });

      if (!res.ok) {
        const message = await errorMessage(res);
        toast.error("Generation failed.", { description: message });
        return;
      }

      const data = (await res.json()) as {
        assetUrl: string;
        creditsCharged: number;
        wallet?: WalletDTO;
      };
      retryRef.current = null;
      setResult({
        modality,
        assetUrl: data.assetUrl,
        creditsCharged: data.creditsCharged,
      });
      if (data.wallet) applyWallet(data.wallet);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      toast.error(
        err instanceof UploadError
          ? "Reference image upload failed."
          : "Generation failed.",
        { description: (err as Error)?.message ?? "Please try again." }
      );
    } finally {
      if (!controller.signal.aborted) {
        setSubmitting(false);
        // Settle against the authoritative balance either way.
        refreshWallet();
      }
    }
  }

  return (
    <div className="w-full">
      <div className="rounded-3xl border border-border-strong bg-surface p-2.5 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        {referenceCount > 0 && (
          <ul
            className="flex flex-wrap gap-2 border-b border-border px-1.5 pb-2.5 pt-1"
            aria-label="Reference images"
          >
            {references.attachments.map((item) => (
              <li key={item.id}>
                <ReferenceChip item={item} onRemove={references.remove} />
              </li>
            ))}
          </ul>
        )}

        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            modality === "image"
              ? "Type to imagine, @ to reference images"
              : "Type to imagine"
          }
          aria-label="Describe what to imagine"
          className="block max-h-40 w-full resize-none bg-transparent px-3 py-2 text-[15px] text-foreground outline-none placeholder:text-muted/70"
        />

        {/* Wraps instead of scrolling so nothing clips on a narrow phone. */}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={references.accept}
              className="sr-only"
              aria-label="Add reference images from device"
              tabIndex={-1}
              onChange={(e) => onPickFiles(e.target.files)}
            />
            <button
              type="button"
              aria-label="Add reference images"
              onClick={openPicker}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-muted"
            >
              <Plus size={18} />
            </button>

            <div
              role="group"
              aria-label="Output type"
              className="inline-flex items-center gap-1 rounded-full bg-surface-muted p-1"
            >
              <ModeButton
                active={modality === "image"}
                icon={ImageIcon}
                label="Image"
                onClick={() => setModality("image")}
              />
              <ModeButton
                active={modality === "video"}
                icon={Clapperboard}
                label="Video"
                onClick={() => setModality("video")}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {modality === "video" && (
              <>
                <PillGroup
                  label="Resolution"
                  options={VIDEO_RESOLUTIONS.map((r) => ({
                    value: r,
                    text: r,
                  }))}
                  value={resolution}
                  onChange={setResolution}
                />
                <PillGroup
                  label="Clip length"
                  icon={<Clock size={13} aria-hidden />}
                  options={VIDEO_DURATIONS.map((d) => ({
                    value: d,
                    text: `${d}s`,
                    disabled: hasReference && d > MAX_DURATION_WITH_REFERENCE,
                  }))}
                  value={effectiveDuration}
                  onChange={setDuration}
                />
              </>
            )}

            <AspectRatioPicker
              value={effectiveAspectRatio}
              onChange={setAspectRatio}
              disabled={hasReference}
              disabledReason="The output matches your reference image."
            />

            <button
              type="button"
              aria-label="Generate"
              disabled={!canSubmit}
              onClick={onSubmit}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-black disabled:opacity-40"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" aria-hidden />
              ) : (
                <ArrowUp size={18} aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>

      <CostLine
        quoteCredits={currentQuote?.credits ?? null}
        wallet={wallet}
        loading={walletLoading || pricesLoading}
        refusal={refusal}
      />

      {hasReference && (
        <p className="mt-2 text-center text-xs text-muted">
          Output follows your reference image, so the aspect ratio stays on Auto
          {modality === "video" &&
            ` and clips are capped at ${MAX_DURATION_WITH_REFERENCE}s`}
          .
        </p>
      )}

      {result && <ResultPreview result={result} />}
    </div>
  );
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? `Request failed (${res.status}).`;
  } catch {
    return `Request failed (${res.status}).`;
  }
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof ImageIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted hover:text-foreground"
      )}
    >
      <Icon size={14} aria-hidden />
      {label}
    </button>
  );
}

function PillGroup<T extends string | number>({
  label,
  icon,
  options,
  value,
  onChange,
}: {
  label: string;
  icon?: React.ReactNode;
  options: { value: T; text: string; disabled?: boolean }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-1 text-xs"
    >
      {icon && <span className="pl-1 text-muted">{icon}</span>}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          title={
            option.disabled
              ? `Not available with a reference image`
              : undefined
          }
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-2 py-0.5 font-medium transition-colors",
            option.value === value
              ? "bg-accent-tint text-accent-dark"
              : option.disabled
                ? "cursor-not-allowed text-muted/50"
                : "text-muted hover:text-foreground"
          )}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

/**
 * The live price of the next generation. Shows a neutral placeholder — never a
 * guessed number — until both the catalogue and the balance are known.
 */
function CostLine({
  quoteCredits,
  wallet,
  loading,
  refusal,
}: {
  quoteCredits: number | null;
  wallet: WalletDTO | null;
  loading: boolean;
  refusal: string | null;
}) {
  let body: React.ReactNode;

  if (quoteCredits === null || !wallet) {
    body = loading
      ? "Checking what this will cost…"
      : "Cost appears once pricing loads.";
  } else if (refusal) {
    body = (
      <>
        <span className="text-red-600">{refusal}</span>{" "}
        <Link
          href="/#pricing"
          className="font-semibold text-accent-dark hover:underline"
        >
          Upgrade
        </Link>
      </>
    );
  } else {
    const remaining = wallet.remaining - quoteCredits;
    const percentOfPlan =
      wallet.granted > 0 ? (quoteCredits / wallet.granted) * 100 : 0;
    body = `This will use ${fmt(quoteCredits)} credits - ${fmt(remaining)} will remain - ${percentOfPlan.toFixed(1)}% of your plan`;
  }

  return (
    <p
      aria-live="polite"
      className="mt-3 text-center text-xs text-muted sm:text-[13px]"
    >
      {body}
    </p>
  );
}

function ReferenceChip({
  item,
  onRemove,
}: {
  item: PendingAttachment;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="relative h-14 w-14">
      <div className="h-full w-full overflow-hidden rounded-xl border border-border bg-surface-muted">
        {item.previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a remote asset
          <img
            src={item.previewUrl}
            alt={item.file.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.file.name}`}
        className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <X size={11} aria-hidden />
      </button>
    </div>
  );
}

function ResultPreview({ result }: { result: GenerationResult }) {
  return (
    <figure className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
      {result.modality === "video" ? (
        <video
          src={result.assetUrl}
          controls
          playsInline
          className="block max-h-[60vh] w-full bg-black object-contain"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- generated asset on a provider URL, not a bundled image
        <img
          src={result.assetUrl}
          alt="Generated result"
          className="block max-h-[60vh] w-full object-contain"
        />
      )}
      <figcaption className="border-t border-border px-3 py-2 text-xs text-muted">
        Used {fmt(result.creditsCharged)} credits
      </figcaption>
    </figure>
  );
}
