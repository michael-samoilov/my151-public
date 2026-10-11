/** Collection facts are independent of the session cutoff. */
export const MINUTE_ACTIVITY_VERSION = 1;
export const MINUTE_ACTIVITY_RETENTION_DAYS = 400;
export const MINUTE_ACTIVITY_MIN_GAP_MS = 60_000;
export const MINUTE_ACTIVITY_MAX_BATCHES = 4;
export const MINUTE_ACTIVITY_MAX_BUCKETS = 120;

export type MinuteActivityTool = 'dex' | 'league' | 'favorites';
export interface MinuteActivityBucket {
  /** Uninterrupted foreground run. A blur, hidden page, or unmount ends it. */
  run: string;
  first: number;
  last: number;
}
export interface MinuteActivityBatch {
  /** Immutable identity: retries send the same batch and content. */
  id: string;
  tab: string;
  /** UTC capture day; every bucket belongs to it. */
  day: string;
  buckets: MinuteActivityBucket[];
  /** The client dropped pending history before this batch. */
  incomplete?: true;
}
export interface MinuteActivityPayload {
  v: 1;
  batches: MinuteActivityBatch[];
}
export interface MinuteActivityAck {
  accepted: string[];
  status: 'recorded' | 'paused' | 'disabled' | 'invalid';
  /** Epoch milliseconds. Normal clients omit detail until this time. */
  retryAt?: number;
}
export interface StoredMinuteActivityBatch extends MinuteActivityBatch {
  cid: string;
  tool: MinuteActivityTool;
  receivedAt: number;
}
