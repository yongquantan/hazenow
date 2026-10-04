/**
 * Share-card landings (COPY §13, docs/PRIVACY.md: "We only count things in total"). When a page opens from a share
 * link (?s=<card>), send one beacon to the data server, which adds 1 to a (day, card, country) counter. The beacon
 * carries no identifier, no place and no body: just the fixed card id. Fire-and-forget, after first paint, once per
 * tab session, and never when the build has no data-server URL.
 */
const CARDS = ["now", "clocks", "group", "clear"];

export function countShareLanding(base: string | null | undefined, search = location.search): void {
  const q = new URLSearchParams(search);
  const card = q.get("s");
  if (!base || !card || !CARDS.includes(card) || q.has("mock") || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  try {
    if (sessionStorage.getItem("hazenow-landed") === card) return;
    sessionStorage.setItem("hazenow-landed", card);
  } catch {
    /* storage blocked: still count once for this load */
  }
  const url = `${base.replace(/\/$/, "")}/v1/hit?e=share_landing&card=${card}`;
  const send = () => {
    try {
      if (!navigator.sendBeacon?.(url)) void fetch(url, { method: "POST", keepalive: true, mode: "no-cors", credentials: "omit" }).catch(() => {});
    } catch {
      /* never let counting break the page */
    }
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (idle) idle(send, { timeout: 4000 });
  else setTimeout(send, 1500);
}
