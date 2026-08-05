export const CATEGORIES = [
  "Relationships",
  "Campus",
  "Family",
  "Marriage",
  "Funny",
  "Life",
  "Secrets",
  "Work",
  "Mental Health",
  "Advice",
] as const;

export type ReactionKind = "relatable" | "funny" | "sad" | "shocking" | "crazy" | "support";

export const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "relatable", emoji: "❤️", label: "Relatable" },
  { kind: "funny", emoji: "😂", label: "Funny" },
  { kind: "sad", emoji: "😢", label: "Sad" },
  { kind: "shocking", emoji: "😳", label: "Shocking" },
  { kind: "crazy", emoji: "🔥", label: "Crazy" },
  { kind: "support", emoji: "🤝", label: "Support" },
];

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 >= 100 && n < 10000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const DEVICE_STORAGE_KEY = "cc_device_key";

export function getDeviceKey(): string {
  if (typeof window === "undefined") return "server";
  let key = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!key) {
    key = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_STORAGE_KEY, key);
  }
  return key;
}

/**
 * Lightweight client-side identity masking. Names, numbers, emails and
 * handles get scrubbed before a confession is stored.
 */
export function maskIdentifiers(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[hidden]")
    .replace(/(?:\+?\d[\d\s-]{7,}\d)/g, "[hidden]")
    .replace(/@[A-Za-z0-9_]{3,}/g, "[hidden]")
    .replace(/\bhttps?:\/\/\S+/g, "[link removed]");
}

export function extractParentNumber(text: string): number | null {
  const m = text.match(/#(\d{1,9})/);
  return m ? Number(m[1]) : null;
}
