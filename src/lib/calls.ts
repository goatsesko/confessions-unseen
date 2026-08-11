/**
 * CallService abstraction.
 *
 * Voice/video infrastructure is not configured yet, so this deliberately
 * exposes a "coming soon" implementation instead of fake calling UI.
 * When a real provider is wired up, implement this interface and swap
 * `callService` — the inbox and chat screens need no changes.
 */
export type CallKind = "voice" | "video";

export type CallRecord = {
  id: string;
  conversationId: string;
  kind: CallKind;
  startedAt: string;
  durationSeconds: number;
  status: "missed" | "completed" | "declined";
};

export interface CallService {
  readonly available: boolean;
  start(conversationId: string, kind: CallKind): Promise<CallRecord | null>;
  history(conversationId: string): Promise<CallRecord[]>;
}

export const callService: CallService = {
  available: false,
  async start() {
    return null;
  },
  async history() {
    return [];
  },
};

export const CALL_COMING_SOON = "Voice & video calls are a premium feature — coming soon.";
