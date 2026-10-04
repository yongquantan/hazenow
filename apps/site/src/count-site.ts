/**
 * The site's counters (docs/PRIVACY.md): download_click per platform when a download or install button is clicked,
 * and qr_shown when /download/ shows the desktop QR code. Fixed labels only, via ../../web/src/count.ts.
 * The Scriptable file itself is counted when it is served (functions/widget/[file].js), not here.
 */
import { count } from "../../web/src/count";

/** A link or copy button → its platform label, or null when it isn't a download. */
export function downloadPlatform(el: Element): string | null {
  const href = el.getAttribute("href") ?? el.getAttribute("data-copy") ?? "";
  const copyText = el.getAttribute("data-copy-text");
  if (/HazeNow-android\.apk$/i.test(href)) return "android";
  if (/HazeNow-mac\.zip$/i.test(href)) return "mac";
  if (/\.scriptable$/i.test(href)) return "scriptable";
  if (/HazeNow-scriptable\.js$|\/get\/HazeNow\.js$/i.test(href)) return "scriptable_js";
  if (/home-assistant\.zip$/i.test(href)) return "home_assistant";
  if (/\.2m\.py$/i.test(href)) return "swiftbar";
  if (/hazenow-status\.sh$/i.test(href)) return "shell";
  if (copyText === "#cli-cmd") return "cli";
  // "Open HazeNow in Safari / Chrome" on the iPhone and Android cards: the web app, to add to the Home Screen.
  const way = el.closest("li.dl")?.id;
  if (el instanceof HTMLAnchorElement && /^https?:/.test(el.href) && new URL(el.href).host !== location.host && el.closest(".dl-actions")) {
    if (way === "iphone" && !/apps\.apple\.com/.test(el.href)) return "iphone_web";
    if (way === "android" && /pages\.dev|hazenow/.test(el.href) && !/github\.com/.test(el.href)) return "android_web";
  }
  return null;
}

document.addEventListener(
  "click",
  (e) => {
    const el = (e.target as Element | null)?.closest?.("a[href], button[data-copy], button[data-copy-text]");
    const platform = el && downloadPlatform(el);
    if (platform) count("download_click", { platform });
  },
  { capture: true },
);

// Desktop: the "scan to open on your phone" QR code appears (download.ts un-hides #dl-qr). Once per tab session.
const qr = document.getElementById("dl-qr");
if (qr) {
  const seen = () => {
    if (qr.hidden) return false;
    try {
      if (sessionStorage.getItem("hn.m.qr")) return true;
      sessionStorage.setItem("hn.m.qr", "1");
    } catch {
      /* count it anyway */
    }
    count("qr_shown");
    return true;
  };
  if (!seen()) {
    const mo = new MutationObserver(() => seen() && mo.disconnect());
    mo.observe(qr, { attributes: true, attributeFilter: ["hidden"] });
  }
}
