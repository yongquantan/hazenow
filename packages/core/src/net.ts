/**
 * Upstream timeouts. Every fetch to an upstream (NEA v1/v2, Air4Thai, the HazeNow proxy) goes through withTimeout():
 * an AbortController that fires after ~8 s, chained to the caller's own signal, and a timer race so even a fetch that
 * ignores its signal can't hang the app (Air4Thai's certificate renewal, 30 Sep 2026, left requests hanging ~30 s).
 * The caller then falls back quickly: another source, the last cached snapshot with its age, or the stale state.
 */
export const UPSTREAM_TIMEOUT_MS = 8_000;

export class TimeoutError extends Error {
  constructor(public url: string, public ms: number) {
    super(`Timed out after ${Math.round(ms / 100) / 10} s: ${url}`);
    this.name = "TimeoutError";
  }
}

type Fetchish<R> = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<R>;

/** Wrap a fetch so each call rejects with TimeoutError after `ms` (and aborts the underlying request). */
export function withTimeout<R>(f: Fetchish<R>, ms: number = UPSTREAM_TIMEOUT_MS): Fetchish<R> {
  if (!(ms > 0) || !Number.isFinite(ms)) return f;
  return (input, init = {}) => {
    const outer = init.signal;
    if (outer?.aborted) return Promise.reject(outer.reason ?? new Error("Aborted"));
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const onAbort = () => ctl?.abort(outer?.reason);
    outer?.addEventListener?.("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new TimeoutError(input, ms);
        reject(err); // settle the race first, so the timeout (not the abort it causes) is what the caller sees
        ctl?.abort(err);
      }, ms);
    });
    return Promise.race([f(input, { ...init, signal: ctl?.signal ?? outer }), timeout]).finally(() => {
      clearTimeout(timer);
      outer?.removeEventListener?.("abort", onAbort);
    });
  };
}
