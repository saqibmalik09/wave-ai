"use client";

/**
 * Pending composer attachments: type classification, per-kind size caps and the
 * `blob:` preview lifecycle (created on add, revoked on remove and on unmount).
 *
 * Extracted from the chat composer so the Imagine reference picker reuses the
 * exact same file rules instead of carrying a second copy of them.
 *
 * The `policy` argument must be a stable reference (declare it at module
 * scope); the hook memoises the accept list from it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export type AttachmentKind = "image" | "pdf" | "doc" | "video";

export type PendingAttachment = {
  id: string;
  file: File;
  kind: AttachmentKind;
  /** blob: URL for image/video preview; null for docs/pdf. */
  previewUrl: string | null;
};

/** The MIME types and extensions that identify one kind of file. */
export type FileFormats = {
  mimes: readonly string[];
  exts: readonly string[];
};

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DOC_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

type KindRule = FileFormats & {
  maxBytes: number;
  /** Plural noun used in the "too large" toast. */
  noun: string;
};

const KIND_RULES: Record<AttachmentKind, KindRule> = {
  image: {
    mimes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    exts: ["png", "jpg", "jpeg", "webp", "gif"],
    maxBytes: IMAGE_MAX_BYTES,
    noun: "Images",
  },
  pdf: {
    mimes: ["application/pdf"],
    exts: ["pdf"],
    maxBytes: DOC_MAX_BYTES,
    noun: "Documents",
  },
  doc: {
    mimes: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    exts: ["doc", "docx"],
    maxBytes: DOC_MAX_BYTES,
    noun: "Documents",
  },
  video: {
    mimes: ["video/mp4", "video/webm", "video/quicktime"],
    exts: ["mp4", "webm", "mov"],
    maxBytes: VIDEO_MAX_BYTES,
    noun: "Videos",
  },
};

/** Still images only (no GIF) — what reference-conditioned models accept. */
export const STILL_IMAGE_FORMATS: FileFormats = {
  mimes: ["image/png", "image/jpeg", "image/webp"],
  exts: ["png", "jpg", "jpeg", "webp"],
};

export type AttachmentPolicy = {
  kinds: readonly AttachmentKind[];
  maxFiles: number;
  /** Narrows the formats accepted for a kind, e.g. images without GIF. */
  formats?: Partial<Record<AttachmentKind, FileFormats>>;
  /** Noun for the "up to N …" toast. Defaults to "files". */
  itemNoun?: string;
  /** Second line of the unsupported-type toast. */
  unsupportedHint: string;
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function formatsFor(policy: AttachmentPolicy, kind: AttachmentKind): FileFormats {
  return policy.formats?.[kind] ?? KIND_RULES[kind];
}

function classify(
  file: File,
  policy: AttachmentPolicy
): AttachmentKind | null {
  const mime = (file.type || "").toLowerCase();
  const ext = extOf(file.name);
  for (const kind of policy.kinds) {
    const { mimes, exts } = formatsFor(policy, kind);
    if (mimes.includes(mime) || exts.includes(ext)) return kind;
  }
  return null;
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function newId(file: File): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
}

/** `accept` attribute for the native picker, derived from the policy. */
function acceptAttr(policy: AttachmentPolicy): string {
  const tokens: string[] = [];
  for (const kind of policy.kinds) {
    const { mimes, exts } = formatsFor(policy, kind);
    tokens.push(...mimes, ...exts.map((e) => `.${e}`));
  }
  return Array.from(new Set(tokens)).join(",");
}

export type PendingAttachmentsApi = {
  attachments: PendingAttachment[];
  /** Value for the file input's `accept` attribute. */
  accept: string;
  atCapacity: boolean;
  /** Adds what fits, toasts about what doesn't, returns the accepted items. */
  addFiles: (list: FileList | readonly File[] | null) => PendingAttachment[];
  remove: (id: string) => void;
  /** Toasts the "up to N …" message without attempting an add. */
  warnAtCapacity: () => void;
};

export function usePendingAttachments(
  policy: AttachmentPolicy
): PendingAttachmentsApi {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  /** Live set of blob: URLs so unmount cleanup never reads state during render. */
  const previewUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const accept = useMemo(() => acceptAttr(policy), [policy]);

  const warnAtCapacity = useCallback(() => {
    toast.error(
      `You can attach up to ${policy.maxFiles} ${policy.itemNoun ?? "files"}.`
    );
  }, [policy]);

  const addFiles = useCallback(
    (list: FileList | readonly File[] | null): PendingAttachment[] => {
      const incoming = list ? Array.from(list) : [];
      if (incoming.length === 0) return [];

      const accepted: PendingAttachment[] = [];
      let room = policy.maxFiles - attachments.length;
      let rejectedOverCap = false;

      for (const file of incoming) {
        if (room <= 0) {
          rejectedOverCap = true;
          break;
        }

        const kind = classify(file, policy);
        if (!kind) {
          toast.error(`“${file.name}” isn’t a supported file type.`, {
            description: policy.unsupportedHint,
          });
          continue;
        }

        const rule = KIND_RULES[kind];
        if (file.size > rule.maxBytes) {
          toast.error(`“${file.name}” is too large.`, {
            description: `${rule.noun} must be ≤ ${formatMb(rule.maxBytes)}.`,
          });
          continue;
        }

        const previewUrl =
          kind === "image" || kind === "video"
            ? URL.createObjectURL(file)
            : null;
        if (previewUrl) previewUrlsRef.current.add(previewUrl);

        accepted.push({ id: newId(file), file, kind, previewUrl });
        room -= 1;
      }

      if (rejectedOverCap) warnAtCapacity();
      if (accepted.length > 0) {
        setAttachments((prev) => [...prev, ...accepted]);
      }
      return accepted;
    },
    [attachments.length, policy, warnAtCapacity]
  );

  const remove = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  return {
    attachments,
    accept,
    atCapacity: attachments.length >= policy.maxFiles,
    addFiles,
    remove,
    warnAtCapacity,
  };
}
