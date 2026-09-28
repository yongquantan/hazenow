// Run: node --experimental-strip-types src/bot.test.ts
// LIVE=1 also drives the worker against data.gov.sg with a fake Telegram + KV and prints every message.
import assert from "node:assert/strict";
import worker, { decide, type Sub } from "./index.ts";

// SGT times: 16:00 SGT = 08:00Z. Quiet hours default 22–7 SGT.
const at = (sgtHour: number, day = 28) => new Date(Date.UTC(2026, 8, day, sgtHour - 8, 10));
const base: Sub = { chatId: 1, region: "west", profile: "general", elevatedOptIn: false, band: "normal", lastObservedAt: "h0", alerted: false, quiet: [22, 7], sentCount: 0 };

// general: Elevated is opt-in → no message, but band still tracked
let r = decide(base, 80, "h1", at(16));
assert.equal(r.event, null);
assert.equal(r.sub.band, "elevated");
// rise to High (clears 150 by ≥10) → rise alert
r = decide(r.sub, 170, "h2", at(17));
assert.deepEqual(r.event, { kind: "rise", band: "high" });
// ease to Elevated → easing message (we alerted this episode)
r = decide(r.sub, 120, "h3", at(18));
assert.deepEqual(r.event, { kind: "ease", band: "elevated" });
// back to Normal → all-clear
r = decide(r.sub, 30, "h4", at(19));
assert.deepEqual(r.event, { kind: "clear", band: "normal" });
assert.equal(r.sub.alerted, false);

// hysteresis: 60 is only 5 over 55 → needs 2 consecutive hours (kids profile: Elevated alerts on)
const kids: Sub = { ...base, profile: "kids" };
r = decide(kids, 60, "h1", at(10));
assert.equal(r.event, null);
r = decide(r.sub, 61, "h1", at(10)); // same hour re-poll
assert.equal(r.event, null);
r = decide(r.sub, 62, "h2", at(11));
assert.deepEqual(r.event, { kind: "rise", band: "elevated" });

// daily cap: 3 rise/ease messages, all-clear still gets through
let s: Sub = { ...kids, sentCount: 3, day: "2026-09-28", band: "normal" };
r = decide(s, 80, "h1", at(12));
assert.equal(r.event, null, "capped");
s = { ...kids, sentCount: 3, day: "2026-09-28", band: "elevated", alerted: true };
r = decide(s, 20, "h1", at(12));
assert.deepEqual(r.event, { kind: "clear", band: "normal" }, "all-clear exempt from cap");
// cap resets next SGT day
r = decide({ ...kids, sentCount: 3, day: "2026-09-27" }, 80, "h1", at(12));
assert.deepEqual(r.event, { kind: "rise", band: "elevated" });

// quiet hours: overnight spike + recovery → silent, then one morning catch-up
r = decide(base, 200, "n1", at(23));
assert.equal(r.event, null);
assert.equal(r.sub.overnightPeak, "high");
r = decide(r.sub, 40, "n2", at(3));
assert.equal(r.event, null);
r = decide(r.sub, 42, "n3", at(7));
assert.deepEqual(r.event, { kind: "morning", band: "normal", peak: "high" });
assert.equal(r.sub.overnightPeak, undefined);
// general + Elevated-only overnight → no catch-up (below their threshold)
r = decide(base, 90, "n1", at(23));
r = decide(r.sub, 40, "n2", at(3));
r = decide(r.sub, 40, "n3", at(8));
assert.equal(r.event, null);
// outdoor_worker gets Elevated alerts by default
r = decide({ ...base, profile: "outdoor_worker" }, 80, "h1", at(12));
assert.deepEqual(r.event, { kind: "rise", band: "elevated" });
console.log("alert logic tests ok");

if (process.env.LIVE) {
  const kv = new Map<string, string>();
  const KV = {
    get: async (k: string, t?: string) => (kv.has(k) ? (t === "json" ? JSON.parse(kv.get(k)!) : kv.get(k)) : null),
    put: async (k: string, v: string) => void kv.set(k, v),
    delete: async (k: string) => void kv.delete(k),
    list: async ({ prefix }: { prefix: string }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  };
  const sent: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://api.telegram.org/")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.text) sent.push(body.text);
      return new Response('{"ok":true}');
    }
    return realFetch(input, init);
  }) as typeof fetch;
  const env = { HAZENOW_KV: KV, TELEGRAM_BOT_TOKEN: "x", WEBHOOK_SECRET: "s" } as any;
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as any;
  const chat = { id: 42, type: "private" };
  const update = async (message: object) => {
    await worker.fetch(new Request("https://bot/webhook", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "s" }, body: JSON.stringify({ update_id: 1, message }) }), env, ctx);
    await Promise.all(pending.splice(0));
  };
  const bad = await worker.fetch(new Request("https://bot/webhook", { method: "POST", body: "{}" }), env, ctx);
  assert.equal(bad.status, 403);
  await update({ message_id: 1, chat, text: "/now west" });
  await update({ message_id: 2, chat, text: "/profile kids" });
  await update({ message_id: 3, chat, location: { latitude: 1.3521, longitude: 103.8198 } });
  await update({ message_id: 4, chat, text: "/regions" });
  await update({ message_id: 5, chat, text: "/alert south" });
  // pretend the subscriber's confirmed band was Normal → next cron sees a real rise
  const sub = JSON.parse(kv.get("sub:42")!);
  kv.set("sub:42", JSON.stringify({ ...sub, band: "normal", lastObservedAt: "old", quiet: [0, 0] }));
  await worker.scheduled!({} as any, env, ctx);
  await Promise.all(pending.splice(0));
  for (const t of sent) console.log("----\n" + t.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
}
