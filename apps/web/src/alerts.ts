/**
 * Opt-in haze alerts by Web Push (services/worker/src/push.ts). Free, no account, no app store: it works in Chrome,
 * Edge, Firefox and Android browsers, and on iPhone and iPad (iOS 16.4+) once HazeNow is on the Home Screen.
 *
 * - The card shows after the first verdict, for a place in Singapore (the native apps' alerts are Singapore-only too).
 * - In a Safari tab on iPhone it never asks for permission (iOS can't grant it there): it explains Add to Home Screen.
 * - Permission is requested only when "Get alerts" is tapped.
 * - "Turn off" is one tap: the server row is deleted and the browser's subscription is dropped.
 * - The server keeps only the push address, the area (never coordinates: a GPS spot is sent as its nearest area's
 *   name), who you're checking for (so the advice fits) and the alert state. Nothing else.
 */
import { elevatedEnabled, forWhom, nearestArea, regionLabel, type Profile } from "hazenow";
import { count } from "./count";
import { detectDevice, installStepsUrl, maybeShowCoachMark } from "./install-hints";
import type { Place } from "./start";
import { esc, store } from "./util";

const env = import.meta.env as Record<string, string | undefined>;
const API = (env.VITE_PROXY_URL ?? "").trim().replace(/\/$/, "");
const VAPID = (env.VITE_VAPID_PUBLIC_KEY ?? "").trim();
const KEY = "hn.alerts";

/** COPY §22, verbatim. */
export const ALERTS_PRIVACY =
  "Alerts are optional. If you turn them on, we keep only a push address from your browser, the area you chose and who you're checking for, so we can tell you when the air changes there. Turn them off anytime and all of it is deleted.";

export interface AlertPlace {
  country: "SG";
  area?: string;
  region?: string;
}

interface Saved {
  endpoint: string;
  place: AlertPlace;
  label: string;
  /** null = the default for the profile (COPY §11). */
  elevated: boolean | null;
}

type Support = "ok" | "ios-install" | "ios-old" | "unsupported" | "denied" | "off";

const ui = {
  saved: store.get<Saved | null>(KEY, null),
  busy: false as false | "on" | "off" | "sync",
  settings: false,
  error: null as string | null,
};

/** For the render key: anything that changes the card. */
export const alertsKey = () => JSON.stringify([ui.saved, ui.busy, ui.settings, ui.error, permission()]);

function permission(): NotificationPermission | "none" {
  try {
    return "Notification" in window ? Notification.permission : "none";
  } catch {
    return "none";
  }
}

function support(): Support {
  if (!API || !VAPID) return "off";
  const d = detectDevice();
  // A Safari (or Chrome, or in-app) tab on iOS can't subscribe: Home Screen web apps only. Never show a prompt there.
  if (d.ios && !d.standalone) return "ios-install";
  const can = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!can) return d.ios ? "ios-old" : "unsupported";
  if (permission() === "denied") return "denied";
  return "ok";
}

/** The alert place for what's on screen. A GPS spot becomes its nearest area's name: coordinates are never sent. */
export function alertPlaceOf(where: Place): { place: AlertPlace; label: string; nearest: boolean } | null {
  switch (where.kind) {
    case "area":
      return { place: { country: "SG", area: where.name }, label: where.name, nearest: false };
    case "gps": {
      const a = nearestArea(where.point);
      return { place: { country: "SG", area: a.name }, label: a.name, nearest: true };
    }
    case "region":
      return { place: { country: "SG", region: where.region }, label: regionLabel(where.region), nearest: false };
    case "island":
      return { place: { country: "SG", region: "island" }, label: "Singapore", nearest: false };
    default:
      return null;
  }
}

const samePlace = (a: AlertPlace, b: AlertPlace) => a.area === b.area && a.region === b.region;

function b64uToBytes(s: string): Uint8Array {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "===".slice((b.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  if (reg.active) return reg;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, no) => setTimeout(() => no(new Error("The service worker didn't start")), 10_000)),
  ]);
}

async function post(path: string, body: unknown): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15_000);
  try {
    return await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      cache: "no-store",
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

async function register(sub: PushSubscription, place: AlertPlace, profile: Profile[], elevated: boolean | null): Promise<string | null> {
  const res = await post("/v1/push/subscribe", { subscription: sub.toJSON(), place, prefs: { profiles: profile, elevated } });
  if (res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Couldn't turn on alerts just now. Please try again.";
}

function save(s: Saved | null) {
  ui.saved = s;
  store.set(KEY, s);
}

/* ------------------------------------------------------------------ actions (called from main.ts's click handler) */

/**
 * "Get alerts". Must be called straight from the tap: the permission request is the first thing it does.
 * Resolves to the toast to show.
 */
export async function turnOn(where: Place, profile: Profile[], rerender: () => void): Promise<string | null> {
  const p = alertPlaceOf(where);
  if (!p || support() !== "ok" || ui.busy) return null;
  // First, inside the tap's user activation (iOS needs it).
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    rerender();
    return perm === "denied" ? null : "No alerts for now. You can turn them on any time.";
  }
  ui.busy = "on";
  ui.error = null;
  rerender();
  try {
    const reg = await registration();
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID) as BufferSource }));
    const err = await register(sub, p.place, profile, null);
    if (err) {
      ui.error = err;
      return null;
    }
    save({ endpoint: sub.endpoint, place: p.place, label: p.label, elevated: null });
    count("alerts_on");
    return `Alerts are on for ${p.label}.`;
  } catch {
    ui.error = "Couldn't turn on alerts just now. Please try again.";
    return null;
  } finally {
    ui.busy = false;
    rerender();
  }
}

/** "Turn off": one tap. Deletes the server row, then drops the browser's subscription. */
export async function turnOff(rerender: () => void): Promise<string | null> {
  const s = ui.saved;
  if (!s || ui.busy) return null;
  ui.busy = "off";
  ui.error = null;
  rerender();
  let serverOk = false;
  try {
    serverOk = (await post("/v1/push/unsubscribe", { endpoint: s.endpoint })).ok;
  } catch {
    serverOk = false;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* already gone */
  }
  save(null);
  ui.settings = false;
  ui.busy = false;
  count("alerts_off");
  rerender();
  // If the server couldn't be reached, the push service now answers "gone" for this address, and the server deletes
  // the row the next time it would have sent an alert.
  return serverOk ? "Alerts are off. Your push address and area are deleted." : "Alerts are off on this device. We'll delete the rest the next time we'd have sent an alert.";
}

/** Re-send the prefs (place, profile, Elevated opt-in). Quietly; keeps the alert state when the place is the same. */
export async function syncAlerts(profile: Profile[], rerender: () => void, change: Partial<Pick<Saved, "place" | "label" | "elevated">> = {}): Promise<string | null> {
  const s = ui.saved;
  if (!s || ui.busy || support() !== "ok") return null;
  ui.busy = "sync";
  ui.error = null;
  rerender();
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      save(null);
      return "Alerts were turned off in your browser settings.";
    }
    const next: Saved = { ...s, ...change, endpoint: sub.endpoint };
    const err = await register(sub, next.place, profile, next.elevated);
    if (err) {
      ui.error = err;
      return null;
    }
    if (s.endpoint !== sub.endpoint) post("/v1/push/unsubscribe", { endpoint: s.endpoint }).catch(() => {});
    save(next);
    return change.place ? `Alerts now follow ${next.label}.` : null;
  } catch {
    ui.error = "Couldn't update your alerts just now. Please try again.";
    return null;
  } finally {
    ui.busy = false;
    rerender();
  }
}

/**
 * On launch: if alerts are on here but the browser replaced or dropped the subscription (it can, rarely), re-register
 * without asking again (permission is already granted). If permission was taken away, show alerts as off.
 */
export async function healAlerts(profile: Profile[], rerender: () => void): Promise<void> {
  const s = ui.saved;
  if (!s || support() === "ios-install" || support() === "off") return;
  if (permission() !== "granted") {
    save(null);
    rerender();
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.endpoint === s.endpoint) return;
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID) as BufferSource });
    if (!(await register(sub, s.place, profile, s.elevated))) {
      post("/v1/push/unsubscribe", { endpoint: s.endpoint }).catch(() => {});
      save({ ...s, endpoint: sub.endpoint });
      rerender();
    }
  } catch {
    /* next launch */
  }
}

export function toggleAlertSettings() {
  ui.settings = !ui.settings;
}

export function showAddToHomeScreen() {
  maybeShowCoachMark(detectDevice(), true);
}

export const alertsOn = () => !!ui.saved;

/* ------------------------------------------------------------------ the card */

const H = "Get an alert when the air changes here";

export function alertsCard(where: Place, profile: Profile[]): string {
  const sup = support();
  const p = alertPlaceOf(where);
  if (sup === "off" || (!p && !ui.saved)) return "";
  const s = ui.saved;
  const err = ui.error ? `<p class="flag" role="alert">${esc(ui.error)}</p>` : "";
  const priv = `<p class="fine">${esc(ALERTS_PRIVACY)}</p>`;
  const wrap = (h: string, body: string) => `<section class="alerts-card" aria-labelledby="alerts-h"><h2 id="alerts-h">${esc(h)}</h2>${body}${err}</section>`;

  if (s) {
    const elevated = elevatedEnabled({ profiles: profile, elevated: s.elevated });
    const switchTo = p && !samePlace(p.place, s.place) ? p : null;
    const settings = ui.settings
      ? `<div class="alerts-settings" id="alerts-settings">
  ${switchTo ? `<p><button class="btn-quiet" data-action="alerts-switch" data-key="alerts-switch"${ui.busy ? " disabled" : ""}>Switch alerts to ${esc(switchTo.label)}</button></p>` : ""}
  <label class="alerts-check"><input type="checkbox" data-action="alerts-elevated" data-key="alerts-elevated"${elevated ? " checked" : ""}${ui.busy ? " disabled" : ""}/> <span>Also alert at Elevated</span></label>
  <p class="fine">High and Very High always alert. Advice in alerts is ${esc(forWhom(profile).replace(/^For /, "for "))}, as on this screen.</p>
  <p class="fine">Quiet hours: 10pm to 7am. Anything overnight comes as one morning update. At most 3 alerts a day, and the all-clear always comes through.</p>
  ${priv}
</div>`
      : "";
    return wrap(
      `Alerts are on for ${s.label}`,
      `<p>We'll message when the band changes there, and when it's clear again. Never at night.</p>
  <div class="row-actions">
    <button class="btn btn-sm" data-action="alerts-off" data-key="alerts-off"${ui.busy ? " disabled" : ""}>${ui.busy === "off" ? "Turning off…" : "Turn off alerts"}</button>
    <button class="link" data-action="alerts-settings" data-key="alerts-settings" aria-expanded="${ui.settings}" aria-controls="alerts-settings">Alert settings</button>
  </div>
  ${settings}`,
    );
  }

  const forPlace = p!.nearest
    ? `For ${esc(p!.label)}, the area nearest you. Only the area's name is sent, never your location.`
    : `For ${esc(p!.label)}.`;
  if (sup === "ios-install") {
    const d = detectDevice();
    return wrap(
      H,
      `<p>On iPhone and iPad, alerts work once HazeNow is on your Home Screen. Add it, open it from there, then tap “Get alerts”.</p>
  <div class="row-actions">
    ${d.iosSafari ? `<button class="btn btn-sm" data-action="alerts-a2hs" data-key="alerts-a2hs">Show me how</button>` : ""}
    <a class="link" href="${installStepsUrl(d)}">Steps to add HazeNow</a>
  </div>`,
    );
  }
  if (sup === "ios-old") return wrap(H, `<p>Alerts need iOS 16.4 or newer. Update your iPhone, then open HazeNow from your Home Screen.</p>`);
  if (sup === "unsupported") return wrap(H, `<p>This browser can't show alerts. Try Chrome, Edge, Firefox or Safari.</p>`);
  if (sup === "denied")
    return wrap(
      H,
      `<p>Notifications are blocked for HazeNow. Allow them in your browser's site settings (on iPhone: Settings, then Notifications, then HazeNow), then come back here.</p>`,
    );
  return wrap(
    H,
    `<p>${forPlace} We'll only message when the band changes, and when it's clear again. Never at night.</p>
  <div class="row-actions"><button class="btn btn-solid btn-sm" data-action="alerts-on" data-key="alerts-on"${ui.busy ? " disabled" : ""}>${ui.busy === "on" ? "Turning on…" : "Get alerts"}</button></div>
  ${priv}`,
  );
}

/** Settings' "Switch alerts to {place}". */
export function switchAlerts(where: Place, profile: Profile[], rerender: () => void) {
  const p = alertPlaceOf(where);
  if (!p) return Promise.resolve(null);
  return syncAlerts(profile, rerender, { place: p.place, label: p.label });
}

export function setElevated(on: boolean, profile: Profile[], rerender: () => void) {
  return syncAlerts(profile, rerender, { elevated: on });
}
