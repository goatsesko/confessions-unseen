/**
 * Client-side safety layer for anonymous confessions and comments.
 * Blocks the worst content outright, warns about identifying information,
 * and rate-limits submissions per device.
 */

const SLUR_PATTERNS = [
  /\bkill\s+(your|him|her|them)self\b/i,
  /\bi(?:'m| am)?\s*(?:going to|gonna)\s+(?:kill|stab|shoot|rape)\b/i,
  /\brape\s+(?:you|her|him|them)\b/i,
];

const PROFANITY = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
  "dick",
  "pussy",
  "whore",
  "slut",
];

export type SafetyIssue = {
  level: "block" | "warn";
  message: string;
};

const PHONE = /(?:\+?\d[\d\s-]{7,}\d)/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const LINK = /https?:\/\/\S+/i;
const HANDLE = /@[A-Za-z0-9_]{3,}/;
const ADDRESS = /\b(?:p\.?o\.?\s*box|street|avenue|estate|apartment|apt|house no\.?|plot no\.?)\b/i;
const FULL_NAME = /\bmy name is\s+[A-Z][a-z]+\s+[A-Z][a-z]+/;

/** Everything that must never be published, plus soft warnings. */
export function checkContent(text: string): SafetyIssue[] {
  const issues: SafetyIssue[] = [];
  const trimmed = text.trim();

  if (SLUR_PATTERNS.some((re) => re.test(trimmed))) {
    issues.push({ level: "block", message: "Threats, harassment and sexual violence aren't allowed here." });
  }
  if (/\b(?:hitler|kill all|death to)\b.{0,20}\b(?:tribe|muslims|christians|luo|kikuyu|somali|gay)\b/i.test(trimmed)) {
    issues.push({ level: "block", message: "Hate speech isn't allowed here." });
  }
  if (PHONE.test(trimmed)) issues.push({ level: "warn", message: "Phone numbers are hidden automatically." });
  if (EMAIL.test(trimmed)) issues.push({ level: "warn", message: "Email addresses are hidden automatically." });
  if (HANDLE.test(trimmed)) issues.push({ level: "warn", message: "Social handles are hidden automatically." });
  if (LINK.test(trimmed)) issues.push({ level: "warn", message: "Links are removed automatically." });
  if (ADDRESS.test(trimmed) || FULL_NAME.test(trimmed)) {
    issues.push({ level: "warn", message: "This looks like it contains identifying details. Consider removing them." });
  }
  return issues;
}

export function hasBlockingIssue(issues: SafetyIssue[]) {
  return issues.some((i) => i.level === "block");
}

/** Softens strong profanity without changing the meaning of the confession. */
export function softenProfanity(text: string): string {
  let out = text;
  for (const word of PROFANITY) {
    out = out.replace(new RegExp(`\\b${word}(\\w*)\\b`, "gi"), (m) => m[0] + "*".repeat(Math.max(1, m.length - 1)));
  }
  return out;
}

/* --------------------------------- limits --------------------------------- */

const RATE_KEY = "cc_rate";

type RateBucket = Record<string, number[]>;

function readBucket(): RateBucket {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(RATE_KEY) ?? "{}") as RateBucket;
  } catch {
    return {};
  }
}

/**
 * Returns null when allowed, or a human message when the device is going too
 * fast. Server-side triggers still guard duplicates.
 */
export function rateLimit(action: string, max: number, windowMs: number): string | null {
  if (typeof window === "undefined") return null;
  const bucket = readBucket();
  const now = Date.now();
  const hits = (bucket[action] ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    const wait = Math.ceil((windowMs - (now - hits[0]!)) / 60000);
    return `You're going a bit fast. Try again in ${Math.max(1, wait)} min.`;
  }
  hits.push(now);
  bucket[action] = hits;
  window.localStorage.setItem(RATE_KEY, JSON.stringify(bucket));
  return null;
}

/** Blocks re-posting the exact same text from this device. */
export function isDuplicate(action: string, text: string): boolean {
  if (typeof window === "undefined") return false;
  const key = `cc_last_${action}`;
  const last = window.localStorage.getItem(key);
  if (last === text.trim()) return true;
  window.localStorage.setItem(key, text.trim());
  return false;
}
