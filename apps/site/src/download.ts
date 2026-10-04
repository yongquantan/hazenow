/**
 * /download/: highlight the option for this device, show the latest release, and the copy buttons.
 * No analytics, no cookies. The only network call is the public GitHub Releases API (and the copy fetch).
 */

import "./count-site"; // download clicks and the QR code, counted in total only

const REPO = __RELEASES_REPO__;
const RELEASES_URL = `https://github.com/${REPO}/releases`;

/* ------------------------------------------------------------------ platform */

type Platform = "ios" | "android" | "mac" | "web";

export function detectPlatform(ua: string, maxTouchPoints: number): Platform {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/macintosh|mac os x/i.test(ua)) return maxTouchPoints > 1 ? "ios" : "mac";
  return "web";
}

const forced = new URLSearchParams(location.search).get("platform") as Platform | null;
const platform: Platform =
  forced && ["ios", "android", "mac", "web"].includes(forced) ? forced : detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);

const list = document.getElementById("dl-list");
const card = list?.querySelector<HTMLElement>(`[data-platform="${platform}"]`);
if (list && card) {
  card.classList.add("is-rec");
  const rec = card.querySelector<HTMLElement>(".dl-rec");
  if (rec) rec.hidden = false;
  list.prepend(card);
  // Put the matching platform first in the jump links too.
  const jump = document.querySelector(".dl-jump");
  const link = jump?.querySelector<HTMLAnchorElement>(`a[href="#${card.id}"]`);
  if (jump && link) {
    link.classList.add("is-rec");
    jump.prepend(link);
  }
}

/* ------------------------------------------------------------------ QR: desktop → phone */

/**
 * "Scan to open HazeNow on your phone": the site, with the place picked on the home page (or in this page's own link),
 * so the phone lands on the same reading. Made on this page by src/qr.ts, no network. A "Near you" spot is never put
 * in the code: the phone finds its own.
 */
function qrTarget(): { url: string; place: string } {
  const here = new URLSearchParams(location.search);
  const q = new URLSearchParams();
  let place = "";
  for (const k of ["country", "area", "region"]) {
    const v = here.get(k);
    if (v) q.set(k, v);
  }
  if (![...q.keys()].length) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("hazenow-site-place");
    } catch {
      /* storage blocked */
    }
    if (saved?.startsWith("a:")) {
      place = saved.slice(2);
      q.set("area", place);
    } else if (saved?.startsWith("r:")) q.set("region", saved.slice(2));
    else if (saved?.startsWith("c:")) {
      const [, cc, id] = saved.split(":");
      if (cc && id) {
        q.set("country", cc.toLowerCase());
        q.set("area", id);
      }
    }
  } else place = q.get("area") ?? "";
  const qs = q.toString();
  return { url: `${__SITE_URL__}/${qs ? `?${qs}` : ""}`, place: /^[a-z0-9-]+$/.test(place) && q.has("country") ? "" : place };
}

const qrBox = document.getElementById("dl-qr");
if (qrBox && (platform === "mac" || platform === "web")) {
  import("./qr").then(({ qrSvg }) => {
    const { url, place } = qrTarget();
    const svg = qrSvg(url, `QR code that opens ${url}`);
    const code = document.getElementById("dl-qr-code");
    if (!svg || !code) return;
    code.innerHTML = svg;
    const where = document.getElementById("dl-qr-place");
    if (where && place) where.textContent = ` for ${place}`;
    qrBox.hidden = false;
  });
}

/* ------------------------------------------------------------------ latest release */

type Release = { tag: string; date: string; url: string };
const CACHE_KEY = "hazenow.release.v1";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // "29 Sep 2026" in Singapore time, built by hand so every browser prints the same month names.
  const sg = new Date(d.getTime() + 8 * 3600_000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${sg.getUTCDate()} ${months[sg.getUTCMonth()]} ${sg.getUTCFullYear()}`;
}

async function latestRelease(): Promise<Release | null> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached) as Release;
  } catch {
    /* storage blocked: just fetch */
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: ctrl.signal,
    });
    // 404 while the repo is private or has no release yet; 403/429 when rate-limited.
    if (!res.ok) return null;
    const j = (await res.json()) as { tag_name?: string; published_at?: string; html_url?: string };
    if (!j.tag_name) return null;
    const rel: Release = { tag: j.tag_name, date: j.published_at ?? "", url: j.html_url ?? RELEASES_URL };
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(rel));
    } catch {
      /* ignore */
    }
    return rel;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const releaseEl = document.getElementById("dl-release");
latestRelease().then((rel) => {
  if (!releaseEl || !rel) return; // the static fallback link stays
  const a = document.createElement("a");
  a.href = /^https:\/\/github\.com\//.test(rel.url) ? rel.url : RELEASES_URL;
  a.rel = "noopener";
  const date = formatDate(rel.date);
  a.textContent = `Version ${rel.tag.replace(/^v/, "")}${date ? ` · ${date}` : ""}`;
  const label = document.createElement("span");
  label.className = "dl-release-label";
  label.textContent = "Latest";
  releaseEl.replaceChildren(label, a);
});

/* ------------------------------------------------------------------ copy */

function statusFor(el: Element): HTMLElement | null {
  const scope = el.closest(".dl-way, .dl");
  return scope?.querySelector<HTMLElement>(".copy-status") ?? null;
}

document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const status = statusFor(btn);
    const src = btn.dataset.copy as string;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      await navigator.clipboard.writeText(await res.text());
      if (status) status.textContent = "Copied. Paste it into a new Scriptable script.";
    } catch {
      if (status) {
        status.textContent = "Couldn't copy. ";
        const a = document.createElement("a");
        a.href = src;
        a.textContent = "Open the script";
        status.append(a, " and copy it from there.");
      }
    }
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-copy-text]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const status = statusFor(btn);
    const text = document.querySelector(btn.dataset.copyText as string)?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text.trim());
      if (status) status.textContent = "Copied.";
    } catch {
      if (status) status.textContent = "Couldn't copy. Select the command and copy it.";
    }
  });
});
