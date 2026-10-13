import {acknowledgeMinuteActivity,encodeActivityBeacon} from '@/lib/minuteActivity';
/** Bounded best-effort delivery. Requests retain one ID across retries. */
interface Operation {
  id: string;
  body: string;
  content: string;
  sequence: number;
  export: boolean;
  attempts: number;
  timer?: ReturnType<typeof setTimeout>;
  controller?: AbortController;
  notBefore?: number;
}
const MAX_PENDING = 8;
const MAX_ATTEMPTS = 3;
const SESSION_GAP_MS = 30 * 60_000;
export function createFavoriteBeaconDelivery(enabled: () => boolean) {
  const pending = new Map<string, Operation>();
  let sequence = 0;
  let latestProgress: Operation | undefined;
  let acknowledgedSequence = 0;
  let acknowledgedContent = '';
  let acknowledgedAt = 0;
  function remove(operation: Operation) {
    if (operation.timer) clearTimeout(operation.timer);
    operation.controller?.abort();
    pending.delete(operation.id);
  }
  async function attempt(operation: Operation) {
    if (!pending.has(operation.id) || operation.controller) return;
    if (operation.notBefore && Date.now() < operation.notBefore) return;
    operation.notBefore = undefined;
    if (!enabled()) { remove(operation); return; }
    if (operation.timer) clearTimeout(operation.timer);
    operation.timer = undefined;
    operation.attempts++;
    const controller = new AbortController();
    operation.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let retry = true;
    let delay = operation.attempts * 500;
    try {
      const response = await fetch('/api/favorites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: operation.body, keepalive: true, signal: controller.signal,
      });
      if (!pending.has(operation.id)) return;
      if (response.ok) {
        const result = await response.json() as {ok?:boolean;contended?:boolean;capped?:boolean;activityAck?:unknown};
        acknowledgeMinuteActivity('favorites',result.activityAck);
        if (result.ok === true && !result.contended && !result.capped) {
          if (operation.sequence >= acknowledgedSequence) {
            acknowledgedSequence = operation.sequence;
            acknowledgedContent = operation.content;
            acknowledgedAt = Date.now();
          }
          retry = false;
        } else if (result.capped) retry = false;
      } else if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          if (retryAfter > 60) retry = false;
          else {
            delay = Math.max(delay, retryAfter * 1000);
            operation.notBefore = Date.now() + delay;
          }
        }
      } else if (response.status < 500) retry = false;
    } catch {
      // Network errors and timed-out keepalive requests use the same bounded retry budget.
    } finally {
      clearTimeout(timeout);
      operation.controller = undefined;
      if (pending.has(operation.id)) {
        if (retry && operation.attempts < MAX_ATTEMPTS && enabled()) {
          operation.timer = setTimeout(() => { void attempt(operation); }, delay);
        } else remove(operation);
      }
    }
  }
  return {
    send(payload: Record<string, unknown>, content: string, isExport: boolean) {
      if (!enabled()) return;
      if (!isExport && latestProgress?.content === content) {
        if (pending.has(latestProgress.id)) return;
        if (acknowledgedContent === content && acknowledgedSequence >= latestProgress.sequence
          && Date.now() - acknowledgedAt < SESSION_GAP_MS) return;
      }
      if (pending.size >= MAX_PENDING) {
        const replaceable = [...pending.values()].find(operation => !operation.export);
        if (!replaceable) return;
        remove(replaceable);
      }
      const id = crypto.randomUUID();
      const operation: Operation = {
        id,body:encodeActivityBeacon({...payload,id}),content,export:isExport,sequence:++sequence,attempts:0,
      };
      if (!isExport) latestProgress = operation;
      pending.set(id,operation);
      void attempt(operation);
    },
    flush() {
      for (const operation of pending.values()) {
        if (operation.notBefore && Date.now() < operation.notBefore) continue;
        if (operation.timer) { clearTimeout(operation.timer); operation.timer = undefined; }
        void attempt(operation);
      }
    },
  };
}
