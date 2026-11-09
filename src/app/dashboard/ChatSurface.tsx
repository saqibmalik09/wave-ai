"use client";

/**
 * The chat surface — what `/dashboard` renders inside the shared chrome.
 *
 * Moved out of `DashboardShell` when the sidebar became a layout; the greeting,
 * composer, quick actions and guest note behave exactly as before. The
 * highlighted tab and the paid-feature toast still come from the chrome, so
 * selecting a quick action and selecting the matching sidebar row stay in sync.
 */
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, FileText, FileVideo, Mic, Plus, X } from "lucide-react";
import {
  usePendingAttachments,
  type AttachmentPolicy,
  type PendingAttachment,
} from "@/components/attachments/usePendingAttachments";
import { cn } from "@/lib/cn";
import { useDashboardChrome } from "./chrome-context";
import { QUICK_ACTIONS } from "./nav";

/** Max files the composer may hold at once (client-side pending attachments). */
const MAX_ATTACHMENTS = 5;

/**
 * Chat accepts images, documents and clips. Classification, size caps and the
 * blob: preview lifecycle live in the shared hook so the Imagine composer uses
 * the same rules.
 */
const CHAT_ATTACHMENT_POLICY: AttachmentPolicy = {
  kinds: ["image", "pdf", "doc", "video"],
  maxFiles: MAX_ATTACHMENTS,
  unsupportedHint: "Use PNG/JPG/WebP/GIF, PDF, Word, or MP4/WebM/MOV.",
};

export function ChatSurface() {
  const { user, isGuest, appName, active, select } = useDashboardChrome();
  const [prompt, setPrompt] = useState("");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-center text-2xl font-extrabold tracking-tight text-heading sm:text-[32px] sm:leading-tight">
          Hi {firstName(user.name)}, how can I help you today?
        </h1>

        <PromptBox
          value={prompt}
          onChange={setPrompt}
          placeholder={promptPlaceholder(active, appName)}
        />

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {QUICK_ACTIONS.map((a) => {
            const className = cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              active === a.label
                ? "border-accent-border bg-accent-tint text-accent-dark"
                : "border-border-strong bg-surface text-foreground hover:bg-surface-muted"
            );
            return a.href ? (
              <Link key={a.label} href={a.href} className={className}>
                <a.icon size={16} />
                {a.label}
              </Link>
            ) : (
              <button
                key={a.label}
                type="button"
                onClick={() => select(a.label, a.paid)}
                className={className}
              >
                <a.icon size={16} />
                {a.label}
              </button>
            );
          })}
        </div>

        {isGuest && (
          <p className="mt-8 text-center text-sm text-muted">
            You&apos;re exploring as a guest.{" "}
            <Link
              href="/signup"
              className="font-semibold text-accent-dark hover:underline"
            >
              Create a free account
            </Link>{" "}
            to save your work.
          </p>
        )}
      </div>
    </div>
  );
}

function PromptBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const {
    attachments,
    accept,
    atCapacity,
    addFiles,
    remove: removeAttachment,
    warnAtCapacity,
  } = usePendingAttachments(CHAT_ATTACHMENT_POLICY);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openPicker = useCallback(() => {
    if (atCapacity) {
      warnAtCapacity();
      return;
    }
    fileInputRef.current?.click();
  }, [atCapacity, warnAtCapacity]);

  const onFilesSelected = useCallback(
    (list: FileList | null) => {
      addFiles(list);
      // Reset so the same file can be re-picked after remove.
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [addFiles]
  );

  const canSend = value.trim().length > 0 || attachments.length > 0;

  return (
    <div className="mt-7 rounded-3xl border border-border-strong bg-surface p-2.5 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      {attachments.length > 0 && (
        <ul
          className="mb-1.5 flex flex-wrap gap-2 px-1.5 pt-1"
          aria-label="Selected attachments"
        >
          {attachments.map((item) => (
            <li key={item.id}>
              <AttachmentChip item={item} onRemove={removeAttachment} />
            </li>
          ))}
        </ul>
      )}

      <textarea
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block max-h-40 w-full resize-none bg-transparent px-3 py-2 text-[15px] text-foreground outline-none placeholder:text-muted/70"
      />
      <div className="mt-1 flex items-center justify-between px-1">
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            className="sr-only"
            aria-label="Attach files from device"
            tabIndex={-1}
            onChange={(e) => onFilesSelected(e.target.files)}
          />
          <button
            type="button"
            aria-label="Add attachment"
            aria-haspopup="dialog"
            onClick={openPicker}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted hover:bg-surface-muted"
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted sm:inline-flex">
            Auto
          </span>
          <button
            type="button"
            aria-label="Voice input"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-muted"
          >
            <Mic size={18} />
          </button>
          <button
            type="button"
            aria-label="Send"
            disabled={!canSend}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-black disabled:opacity-40"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachmentChip({
  item,
  onRemove,
}: {
  item: PendingAttachment;
  onRemove: (id: string) => void;
}) {
  const label =
    item.kind === "image"
      ? "Image"
      : item.kind === "video"
        ? "Video"
        : item.kind === "pdf"
          ? "PDF"
          : "Document";

  return (
    <div className="group relative flex max-w-[11rem] items-center gap-2 rounded-2xl border border-border bg-surface-muted py-1.5 pl-1.5 pr-8">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-surface">
        {item.kind === "image" && item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a remote asset
          <img
            src={item.previewUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : item.kind === "video" && item.previewUrl ? (
          <video
            src={item.previewUrl}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
            aria-hidden
          />
        ) : item.kind === "video" ? (
          <span className="flex h-full w-full items-center justify-center text-muted">
            <FileVideo size={18} aria-hidden />
          </span>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted">
            <FileText size={18} aria-hidden />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-heading" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="text-[11px] text-muted">{label}</p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`Remove ${item.file.name}`}
        className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface text-muted shadow-sm hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}

function firstName(name: string): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

function promptPlaceholder(active: string, appName: string): string {
  switch (active) {
    case "Image Studio":
    case "Images":
      return "Describe an image to create…";
    case "Video Studio":
    case "Videos":
      return "Describe a video to generate…";
    case "Slides":
      return "Describe a presentation to build…";
    case "Websites":
      return "Describe a website to generate…";
    case "Compare":
      return "Ask something to compare across models…";
    default:
      return `Message ${appName}…`;
  }
}
