/**
 * Install hints (COPY §21), shared by the web app and the site:
 * - In a chat app's built-in browser (WhatsApp, Instagram, Facebook, LinkedIn, Telegram), Add to Home Screen isn't
 *   available, so a slim strip says to open the page in Safari or Chrome, with a "Copy link" button. It never covers
 *   the reading, and it can be closed.
 * - In Safari on an iPhone or iPad, once the first verdict is on screen, one dismissible coach mark says how to add
 *   HazeNow to the Home Screen. It's shown once per device (localStorage, wrapped in try/catch).
 * Nothing here is sent anywhere: the user agent is only read on the device.
 */

const DOWNLOAD_URL = "https://hazenow.pages.dev/download/";
const COACH_KEY = "hn.a2hsCoachSeen";
const HINT_KEY = "hn.inAppHintClosed";

export interface Device {
  ios: boolean;
  android: boolean;
  /** A chat or social app's built-in browser. */
  inApp: boolean;
  /** Already installed and opened from the Home Screen. */
  standalone: boolean;
  /** Safari itself on iOS (not Chrome, Firefox, Edge or Google's app). */
  iosSafari: boolean;
}

const IN_APP = /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|FB4A|LinkedInApp|Telegram/i;

export function detectDevice(ua = navigator.userAgent, touch = navigator.maxTouchPoints ?? 0): Device {
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && touch > 1);
  const android = /android/i.test(ua);
  const inApp = IN_APP.test(ua);
  let standalone = false;
  try {
    standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    /* old browser */
  }
  const iosSafari = ios && !inApp && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  return { ios, android, inApp, standalone, iosSafari };
}

/** The "Add to Home Screen" steps on /download/ for this phone. */
export function installStepsUrl(d: Device = detectDevice()): string {
  return `${DOWNLOAD_URL}#${d.android ? "android" : "iphone"}`;
}

const seen = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const remember = (key: string) => {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* private mode: it may show again next visit, which is fine */
  }
};

const CSS = `
.hn-inapp{display:flex;align-items:center;gap:10px;padding:8px max(14px,env(safe-area-inset-left)) 8px max(14px,env(safe-area-inset-left));
  background:#e9e5dc;color:#14232b;font:500 14px/1.35 "Apfel Grotezk",ui-sans-serif,system-ui,-apple-system,sans-serif;border-bottom:1px solid rgba(20,35,43,.12)}
.hn-inapp p{margin:0;flex:1;min-width:0}
.hn-inapp button{font:inherit;cursor:pointer;border-radius:999px;min-height:34px}
.hn-inapp .hn-copy{padding:0 12px;border:1px solid rgba(20,35,43,.3);background:transparent;color:inherit;white-space:nowrap}
.hn-inapp .hn-x{width:34px;padding:0;border:0;background:transparent;color:inherit;font-size:20px;line-height:1}
.hn-coach{position:fixed;left:50%;bottom:calc(max(16px,env(safe-area-inset-bottom)) + 8px);transform:translateX(-50%);z-index:30;
  width:min(360px,calc(100vw - 32px));padding:14px 16px 12px;border-radius:16px;background:#14232b;color:#f5f0e6;
  font:400 15px/1.4 "Apfel Grotezk",ui-sans-serif,system-ui,-apple-system,sans-serif;box-shadow:0 10px 32px rgba(20,35,43,.28)}
.hn-coach::after{content:"";position:absolute;left:50%;bottom:-7px;width:14px;height:14px;background:inherit;transform:translateX(-50%) rotate(45deg);border-radius:2px}
.hn-coach p{margin:0}
.hn-coach b{font-weight:500}
.hn-coach .hn-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px}
.hn-coach a{color:inherit;text-underline-offset:3px;font-size:14px}
.hn-coach button{font:500 14px/1 "Apfel Grotezk",ui-sans-serif,system-ui,-apple-system,sans-serif;min-height:36px;padding:0 16px;border:0;border-radius:999px;background:#f5f0e6;color:#14232b;cursor:pointer}
@media (prefers-reduced-motion:no-preference){.hn-coach{animation:hn-rise .35s cubic-bezier(.22,1,.36,1)}}
@keyframes hn-rise{from{opacity:0;transform:translate(-50%,10px)}}
@media (prefers-color-scheme:dark){
  .hn-inapp{background:#1a2d36;color:#f5f0e6;border-bottom-color:rgba(245,240,230,.12)}
  .hn-inapp .hn-copy{border-color:rgba(245,240,230,.3)}
  .hn-coach{background:#f5f0e6;color:#14232b;box-shadow:0 10px 32px rgba(0,0,0,.45)}
  .hn-coach button{background:#14232b;color:#f5f0e6}
}`;

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.append(s);
}

/**
 * The in-app-browser strip, at the very top of the page (it pushes the page down a little, never covers it).
 * @param getLink the link to copy (the page with its place)
 */
export function showInAppHint(getLink: () => string = () => location.href, d: Device = detectDevice()): void {
  if (!d.inApp || d.standalone || seen(HINT_KEY) || document.querySelector(".hn-inapp")) return;
  style();
  const browser = d.android ? "Chrome" : "Safari";
  const bar = document.createElement("div");
  bar.className = "hn-inapp";
  bar.setAttribute("role", "note");
  bar.innerHTML = `<p>Open in ${browser} to add HazeNow to your Home Screen.</p><button class="hn-copy" type="button">Copy link</button><button class="hn-x" type="button" aria-label="Close">×</button>`;
  const text = bar.querySelector("p")!;
  bar.querySelector<HTMLButtonElement>(".hn-copy")!.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getLink());
      text.textContent = `Link copied. Paste it into ${browser}.`;
    } catch {
      text.textContent = `Couldn't copy. Use the ••• menu, then Open in ${browser}.`;
    }
  });
  bar.querySelector<HTMLButtonElement>(".hn-x")!.addEventListener("click", () => {
    remember(HINT_KEY);
    bar.remove();
  });
  document.body.prepend(bar);
}

/** The one-time Add to Home Screen coach mark, for Safari on iPhone and iPad. Call it once a verdict is on screen. */
export function maybeShowCoachMark(d: Device = detectDevice()): void {
  if (!d.iosSafari || d.standalone || seen(COACH_KEY) || document.querySelector(".hn-coach")) return;
  remember(COACH_KEY); // once, even if they never tap "Got it"
  style();
  const box = document.createElement("div");
  box.className = "hn-coach";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Add HazeNow to your Home Screen");
  box.innerHTML = `<p><b>Add HazeNow to your Home Screen:</b> tap Share, then Add to Home Screen.</p>
<div class="hn-row"><a href="${installStepsUrl(d)}">Show me how</a><button type="button">Got it</button></div>`;
  const close = () => box.remove();
  box.querySelector("button")!.addEventListener("click", close);
  document.addEventListener("keydown", (e) => e.key === "Escape" && close(), { once: true });
  document.body.append(box);
}
