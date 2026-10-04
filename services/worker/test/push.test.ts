// Web Push alerts: RFC 8291/8292 crypto, the subscribe/unsubscribe/test endpoints, and the hourly alert pass.
import { beforeEach, describe, expect, test } from "bun:test";
import { fromV1 } from "../../../packages/core/src/parse.js";
import { MAX_PER_PLACE, SENDS_PER_RUN, clearPushMemo, handlePush, placeInfo, runPush, type PushEnv, type PushPayload } from "../src/push.js";
import { K, kvPut } from "../src/store.js";
import { b64uDecode, b64uEncode, encryptPayload, generateVapidKeys, importVapidKey, vapidAuthorization, type FetchFn } from "../src/webpush.js";
import { asD1, FakeD1 } from "./d1-shim.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** A browser (user agent): its keys, and RFC 8291 decryption as the browser does it. */
async function browser() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    keys: { p256dh: b64uEncode(pub), auth: b64uEncode(auth) },
    async decrypt(body: Uint8Array): Promise<string> {
      const salt = body.slice(0, 16);
      const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
      const idlen = body[20];
      const asPub = body.slice(21, 21 + idlen);
      const ct = body.slice(21 + idlen);
      expect(rs).toBe(4096);
      expect(ct.length).toBeLessThanOrEqual(rs);
      const asKey = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
      const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, pair.privateKey, 256));
      const info = new Uint8Array([...enc.encode("WebPush: info\0"), ...pub, ...asPub]);
      const ikm = await hkdf(auth, ecdh, info, 32);
      const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
      const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
      const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ct));
      let end = plain.length - 1;
      while (end >= 0 && plain[end] === 0) end--;
      expect(plain[end]).toBe(0x02); // last-record delimiter
      return dec.decode(plain.slice(0, end));
    },
  };
}

describe("RFC 8291 encryption", () => {
  test("Appendix A test vector, byte for byte", async () => {
    const asPub = b64uDecode("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
    const jwk = { kty: "EC", crv: "P-256", x: b64uEncode(asPub.slice(1, 33)), y: b64uEncode(asPub.slice(33)), d: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw" };
    const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const publicKey = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, true, []);
    const body = await encryptPayload(
      { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" },
      enc.encode("When I grow up, I want to be a watermelon"),
      { salt: b64uDecode("DGv6ra1nlYgDCS1FRnbzlw"), localKeys: { privateKey, publicKey } },
    );
    expect(b64uEncode(body)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  test("a browser decrypts what we send; fresh salt and key every time", async () => {
    const ua = await browser();
    const msg = JSON.stringify({ title: "Haze now High in Tampines", body: "PM2.5 172. …" });
    const a = await encryptPayload(ua.keys, enc.encode(msg));
    const b = await encryptPayload(ua.keys, enc.encode(msg));
    expect(await ua.decrypt(a)).toBe(msg);
    expect(b64uEncode(a.slice(0, 16))).not.toBe(b64uEncode(b.slice(0, 16)));
    expect(b64uEncode(a.slice(21, 86))).not.toBe(b64uEncode(b.slice(21, 86)));
  });

  test("refuses bad keys and oversize payloads", async () => {
    const ua = await browser();
    await expect(encryptPayload({ ...ua.keys, auth: "AAAA" }, enc.encode("x"))).rejects.toThrow();
    await expect(encryptPayload(ua.keys, new Uint8Array(4000))).rejects.toThrow();
  });
});

describe("RFC 8292 VAPID", () => {
  test("an ES256 JWT for the push service origin, verifiable with the public key", async () => {
    const keys = await generateVapidKeys();
    const v = { ...keys, subject: "https://hazenow.pages.dev" };
    const now = Date.parse("2026-10-05T03:00:00Z");
    const auth = await vapidAuthorization(v, await importVapidKey(v), "https://web.push.apple.com", now);
    const m = auth.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
    expect(m).not.toBeNull();
    expect(m[4]).toBe(keys.publicKey);
    expect(JSON.parse(dec.decode(b64uDecode(m[1])))).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(dec.decode(b64uDecode(m[2])))).toEqual({ aud: "https://web.push.apple.com", exp: now / 1000 + 12 * 3600, sub: "https://hazenow.pages.dev" });
    const pub = await crypto.subtle.importKey("raw", b64uDecode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const sig = b64uDecode(m[3]);
    expect(sig.length).toBe(64);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, enc.encode(`${m[1]}.${m[2]}`))).toBe(true);
  });
});

/* ------------------------------------------------------------------ endpoints and the alert pass */

const REGIONS = ["north", "south", "east", "west", "central"];
const COORDS: Record<string, [number, number]> = { north: [1.41803, 103.82], south: [1.29587, 103.82], east: [1.35735, 103.94], west: [1.35735, 103.7], central: [1.35735, 103.82] };

/** NEA v1 pm25 for today: one item per hour (SGT "HH"), the same value in every region unless given per region. */
function neaV1(hours: Record<string, number | Record<string, number>>) {
  return {
    region_metadata: REGIONS.map((name) => ({ name, label_location: { latitude: COORDS[name][0], longitude: COORDS[name][1] } })),
    items: Object.entries(hours).map(([hh, v]) => ({
      timestamp: `2026-10-05T${hh}:00:00+08:00`,
      update_timestamp: `2026-10-05T${hh}:00:59+08:00`,
      readings: { pm25_one_hourly: Object.fromEntries(REGIONS.map((r) => [r, typeof v === "number" ? v : v[r] ?? 40])) },
    })),
    api_info: { status: "healthy" },
  };
}
const at = (hhmm: string) => Date.parse(`2026-10-05T${hhmm}:00+08:00`);

async function setup() {
  const d1 = new FakeD1();
  const keys = await generateVapidKeys();
  const env: PushEnv = { DB: asD1(d1), VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, ADMIN_TOKEN: "secret-token" };
  const sent: { url: string; headers: Record<string, string>; body: Uint8Array }[] = [];
  const statusFor = new Map<string, number>();
  const fetchFn: FetchFn = async (url, init) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: init.body as Uint8Array });
    return new Response(null, { status: statusFor.get(url) ?? 201 });
  };
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}, now = at("16:05")) => {
    const r = await handlePush(new Request(`https://w.example${path}`, { method: "POST", body: JSON.stringify(body), headers }), env, { now, fetch: fetchFn });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  const setRaw = (hours: Record<string, number | Record<string, number>>, written: number) =>
    kvPut(env.DB, K.sgRaw, JSON.stringify({ v1Pm25: [fromV1(neaV1(hours) as never)], v1Psi: [], pm25Latest: null, pm25Days: [], psi: null, psiDays: [] }), written).run();
  return { d1, env, sent, statusFor, fetchFn, post, setRaw };
}

const sub = (endpoint: string, keys: { p256dh: string; auth: string }) => ({ endpoint, keys });

beforeEach(() => clearPushMemo());

describe("POST /v1/push/subscribe and /unsubscribe", () => {
  test("stores only endpoint, keys, place, prefs, state and the creation day", async () => {
    const t = await setup();
    const ua = await browser();
    const r = await t.post("/v1/push/subscribe", { subscription: sub("https://web.push.apple.com/QAbc", ua.keys), place: { country: "SG", area: "tampines" }, prefs: { profiles: ["kids", "general", "bogus"] } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, place: "SG:area:Tampines", label: "Tampines" });
    const rows = t.d1.q("SELECT * FROM push_subs");
    expect(rows.length).toBe(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["auth", "created_at", "endpoint", "id", "p256dh", "place", "prefs", "state"]);
    expect(JSON.parse(rows[0].prefs as string)).toEqual({ profiles: ["kids"], elevated: null });
    expect(rows[0].state).toBe("{}");
    expect(rows[0].created_at).toBe(Math.floor(at("16:05") / 86_400_000) * 86_400);
  });

  test("validates the subscription, the place and the push service", async () => {
    const t = await setup();
    const ua = await browser();
    const place = { country: "SG", region: "west" };
    expect((await t.post("/v1/push/subscribe", { subscription: sub("https://evil.example/x", ua.keys), place })).status).toBe(400);
    expect((await t.post("/v1/push/subscribe", { subscription: sub("http://fcm.googleapis.com/fcm/send/x", ua.keys), place })).status).toBe(400);
    expect((await t.post("/v1/push/subscribe", { subscription: sub("https://fcm.googleapis.com/fcm/send/x", { ...ua.keys, auth: "short" }), place })).status).toBe(400);
    expect((await t.post("/v1/push/subscribe", { subscription: sub("https://fcm.googleapis.com/fcm/send/x", ua.keys), place: { country: "TH", area: "Bangkok" } })).status).toBe(422);
    expect((await t.post("/v1/push/subscribe", { subscription: sub("https://fcm.googleapis.com/fcm/send/x", ua.keys), place: { country: "SG", area: "Atlantis" } })).status).toBe(400);
    for (const ep of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/x", "https://wns2-sg2p.notify.windows.com/w/?token=x"])
      expect((await t.post("/v1/push/subscribe", { subscription: sub(ep, ua.keys), place })).status).toBe(200);
    expect(t.d1.q("SELECT COUNT(*) AS n FROM push_subs")[0].n).toBe(4);
  });

  test("re-subscribing keeps the alert state for the same place, and starts again for a new one", async () => {
    const t = await setup();
    const ua = await browser();
    const ep = "https://fcm.googleapis.com/fcm/send/a";
    await t.post("/v1/push/subscribe", { subscription: sub(ep, ua.keys), place: { country: "SG", region: "west" } });
    t.d1.db.exec(`UPDATE push_subs SET state = '{"band":"high","episodeAlerted":true}'`);
    await t.post("/v1/push/subscribe", { subscription: sub(ep, ua.keys), place: { country: "SG", region: "west" }, prefs: { profiles: ["general"], elevated: true } });
    let row = t.d1.q("SELECT state, prefs FROM push_subs")[0];
    expect(JSON.parse(row.state as string).band).toBe("high");
    expect(JSON.parse(row.prefs as string).elevated).toBe(true);
    await t.post("/v1/push/subscribe", { subscription: sub(ep, ua.keys), place: { country: "SG", region: "island" } });
    row = t.d1.q("SELECT state, place FROM push_subs")[0];
    expect(row).toEqual({ state: "{}", place: "SG:island" });
    expect(t.d1.q("SELECT COUNT(*) AS n FROM push_subs")[0].n).toBe(1);
  });

  test("caps subscriptions per place", async () => {
    const t = await setup();
    const ua = await browser();
    const ins = t.d1.db.prepare("INSERT INTO push_subs (endpoint, p256dh, auth, place, prefs, created_at) VALUES (?, 'k', 'a', 'SG:region:west', '{}', 0)");
    for (let i = 0; i < MAX_PER_PLACE; i++) ins.run(`https://fcm.googleapis.com/fcm/send/${i}`);
    const r = await t.post("/v1/push/subscribe", { subscription: sub("https://fcm.googleapis.com/fcm/send/new", ua.keys), place: { country: "SG", region: "west" } });
    expect(r.status).toBe(429);
    expect((await t.post("/v1/push/subscribe", { subscription: sub("https://fcm.googleapis.com/fcm/send/new", ua.keys), place: { country: "SG", region: "east" } })).status).toBe(200);
  });

  test("unsubscribe deletes the row (one call), and is idempotent", async () => {
    const t = await setup();
    const ua = await browser();
    const ep = "https://web.push.apple.com/QAbc";
    await t.post("/v1/push/subscribe", { subscription: sub(ep, ua.keys), place: { country: "SG", area: "Bedok" } });
    expect(await t.post("/v1/push/unsubscribe", { endpoint: ep })).toEqual({ status: 200, body: { ok: true, deleted: 1 } });
    expect(t.d1.q("SELECT COUNT(*) AS n FROM push_subs")[0].n).toBe(0);
    expect(await t.post("/v1/push/unsubscribe", { endpoint: ep })).toEqual({ status: 200, body: { ok: true, deleted: 0 } });
  });

  test("CORS preflight, wrong method, bad JSON, rate limit", async () => {
    const t = await setup();
    const pre = await handlePush(new Request("https://w.example/v1/push/subscribe", { method: "OPTIONS" }), t.env);
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-headers")).toContain("content-type");
    expect((await handlePush(new Request("https://w.example/v1/push/subscribe"), t.env)).status).toBe(405);
    expect((await handlePush(new Request("https://w.example/v1/push/subscribe", { method: "POST", body: "{nope" }), t.env)).status).toBe(400);
    const hit = () => handlePush(new Request("https://w.example/v1/push/unsubscribe", { method: "POST", body: '{"endpoint":"x"}', headers: { "cf-connecting-ip": "203.0.113.9" } }), t.env);
    for (let i = 0; i < 20; i++) expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(429);
  });

  test("the debug send needs the stats token", async () => {
    const t = await setup();
    const ua = await browser();
    const ep = "https://fcm.googleapis.com/fcm/send/dbg";
    await t.post("/v1/push/subscribe", { subscription: sub(ep, ua.keys), place: { country: "SG", area: "Tampines" } });
    expect((await t.post("/v1/push/test", { endpoint: ep })).status).toBe(401);
    expect((await t.post("/v1/push/test", { endpoint: ep }, { authorization: "Bearer nope" })).status).toBe(401);
    const ok = await t.post("/v1/push/test", { endpoint: ep }, { authorization: "Bearer secret-token" });
    expect(ok).toEqual({ status: 200, body: { ok: true, status: 201 } });
    const p = JSON.parse(await ua.decrypt(t.sent[0].body)) as PushPayload;
    expect(p.title).toBe("HazeNow test alert");
    expect(p.url).toBe("/?area=Tampines");
    expect((await t.post("/v1/push/test", { endpoint: "https://fcm.googleapis.com/fcm/send/none" }, { authorization: "Bearer secret-token" })).status).toBe(404);
  });
});

describe("the hourly alert pass", () => {
  test("adopts silently, then alerts each place with its own estimate and wording; 410 deletes", async () => {
    const t = await setup();
    const kids = await browser();
    const west = await browser();
    const island = await browser();
    await t.post("/v1/push/subscribe", { subscription: sub("https://web.push.apple.com/kids", kids.keys), place: { country: "SG", area: "Tampines" }, prefs: { profiles: ["kids"] } });
    await t.post("/v1/push/subscribe", { subscription: sub("https://fcm.googleapis.com/fcm/send/west", west.keys), place: { country: "SG", region: "west" }, prefs: { profiles: ["general"] } });
    await t.post("/v1/push/subscribe", { subscription: sub("https://updates.push.services.mozilla.com/wpush/v2/isl", island.keys), place: { country: "SG", region: "island" } });

    // 16:00 reading: everyone adopts Normal silently.
    await t.setRaw({ "15": 40, "16": 40 }, at("16:02"));
    expect(await runPush(t.env, at("16:03"), t.fetchFn)).toMatchObject({ status: "pass", scanned: 3, sent: 0, done: true });
    expect(t.sent.length).toBe(0);
    expect(t.d1.q("SELECT state FROM push_subs").map((r) => JSON.parse(r.state as string).band)).toEqual(["normal", "normal", "normal"]);
    // Nothing new: one D1 read, no work.
    expect((await runPush(t.env, at("16:04"), t.fetchFn)).status).toBe("idle");

    // 17:00: High everywhere (≥10 past the edge, so confirmed in one hour). East is a bit higher, so Tampines' IDW differs.
    t.statusFor.set("https://updates.push.services.mozilla.com/wpush/v2/isl", 410);
    await t.setRaw({ "15": 40, "16": 40, "17": { north: 170, south: 170, east: 200, west: 172, central: 170 } }, at("17:02"));
    const r = await runPush(t.env, at("17:03"), t.fetchFn);
    expect(r).toMatchObject({ status: "pass", sent: 2, gone: 1, done: true });
    expect(t.sent.length).toBe(3);
    for (const s of t.sent) {
      expect(s.headers["content-encoding"]).toBe("aes128gcm");
      expect(s.headers.ttl).toBe("7200");
      expect(s.headers.urgency).toBe("high");
      expect(s.headers.topic).toBe("hazenow-band");
      expect(s.headers.authorization).toMatch(new RegExp(`^vapid t=.+, k=${t.env.VAPID_PUBLIC_KEY}$`));
    }
    const byUrl = new Map(t.sent.map((s) => [s.url, s.body]));
    const pk = JSON.parse(await kids.decrypt(byUrl.get("https://web.push.apple.com/kids")!)) as PushPayload;
    expect(pk.title).toBe("Haze now High in Tampines");
    expect(pk.body).toMatch(/^PM2\.5 1\d\d\. Indoor play for now\. Keep trips out short\. Close windows and keep cool with aircon or a fan\.$/);
    expect(pk.url).toBe("/?area=Tampines");
    const pw = JSON.parse(await west.decrypt(byUrl.get("https://fcm.googleapis.com/fcm/send/west")!)) as PushPayload;
    expect(pw).toEqual({
      title: "Haze now High in the West",
      body: "PM2.5 172. Short trips out are OK. Exercise indoors. Close windows and keep cool with aircon or a fan.",
      url: "/?region=west",
      tag: "hazenow-band",
      kind: "rising",
    });
    // The 410 subscriber is gone; the others remember the alert.
    expect(t.d1.q("SELECT place, state FROM push_subs ORDER BY place").map((x) => [x.place, JSON.parse(x.state as string)])).toEqual([
      ["SG:area:Tampines", { band: "high", day: "2026-10-05", sentToday: 1, episodeAlerted: true }],
      ["SG:region:west", { band: "high", day: "2026-10-05", sentToday: 1, episodeAlerted: true }],
    ]);

    // The SG job re-writes the same hour (v2 back-fill): no second pass.
    await t.setRaw({ "15": 40, "16": 40, "17": { north: 170, south: 170, east: 200, west: 172, central: 170 } }, at("17:07"));
    expect((await runPush(t.env, at("17:08"), t.fetchFn)).status).toBe("idle");
    expect(t.sent.length).toBe(3);

    // 18:00 back to Normal: the all-clear (with each profile's wording).
    await t.setRaw({ "16": 40, "17": 170, "18": 30 }, at("18:02"));
    await runPush(t.env, at("18:03"), t.fetchFn);
    const clear = t.sent.slice(3);
    expect(clear.length).toBe(2);
    const ck = JSON.parse(await kids.decrypt(clear.find((s) => s.url.endsWith("/kids"))!.body)) as PushPayload;
    expect(ck).toMatchObject({ title: "All clear in Tampines", body: "Air's back to Normal (PM2.5 30). Fine for outdoor play again.", kind: "allClear" });
  });

  test("a big pass is spread over several minutes, and a failed send is retried next hour, not lost", async () => {
    const t = await setup();
    const ua = await browser();
    const ins = t.d1.db.prepare(`INSERT INTO push_subs (endpoint, p256dh, auth, place, prefs, state, created_at) VALUES (?, ?, ?, ?, '{"profiles":["general"],"elevated":null}', '{"band":"normal"}', 0)`);
    for (let i = 0; i < 90; i++) ins.run(`https://fcm.googleapis.com/fcm/send/${i}`, ua.keys.p256dh, ua.keys.auth, i % 2 ? "SG:region:east" : "SG:area:Bedok");
    t.statusFor.set("https://fcm.googleapis.com/fcm/send/7", 503);
    await t.setRaw({ "11": 40, "12": 180 }, at("12:02"));
    const r1 = await runPush(t.env, at("12:03"), t.fetchFn);
    expect(r1).toMatchObject({ status: "pass", sent: SENDS_PER_RUN, done: false });
    let r3 = r1;
    let minutes = 1;
    while (!r3.done) {
      r3 = await runPush(t.env, at(`12:${String(3 + minutes).padStart(2, "0")}`), t.fetchFn);
      expect(r3.status).toBe("pass");
      minutes++;
    }
    expect(minutes).toBe(Math.ceil(90 / SENDS_PER_RUN));
    expect(t.sent.length).toBe(90);
    expect(new Set(t.sent.map((s) => s.url)).size).toBe(90);
    expect(r3.sent).toBe(89);
    expect(JSON.parse(t.d1.q("SELECT state FROM push_subs WHERE endpoint = ?", "https://fcm.googleapis.com/fcm/send/7")[0].state as string)).toEqual({ band: "normal" });
    expect((await runPush(t.env, at("12:30"), t.fetchFn)).status).toBe("idle");
  });

  test("quiet hours hold alerts for one morning update", async () => {
    const t = await setup();
    const ua = await browser();
    await t.post("/v1/push/subscribe", { subscription: sub("https://web.push.apple.com/q", ua.keys), place: { country: "SG", region: "central" } });
    t.d1.db.exec(`UPDATE push_subs SET state = '{"band":"normal"}'`);
    await t.setRaw({ "21": 40, "22": 175 }, at("22:02"));
    await runPush(t.env, at("22:03"), t.fetchFn);
    expect(t.sent.length).toBe(0);
    expect(JSON.parse(t.d1.q("SELECT state FROM push_subs")[0].state as string)).toMatchObject({ band: "high", overnightPeak: "high" });
  });

  test("without VAPID keys or data it does nothing", async () => {
    const t = await setup();
    expect((await runPush({ DB: t.env.DB }, at("12:00"), t.fetchFn)).status).toBe("no-keys");
    expect((await runPush(t.env, at("12:00"), t.fetchFn)).status).toBe("no-data");
  });

  test("place keys round-trip to the web app's deep links", () => {
    expect(placeInfo("SG:area:Choa Chu Kang")?.url).toBe("/?area=Choa%20Chu%20Kang");
    expect(placeInfo("SG:region:north")).toMatchObject({ url: "/?region=north", label: "North", placeName: null });
    expect(placeInfo("SG:island")?.url).toBe("/?region=island");
    expect(placeInfo("SG:area:Atlantis")).toBeNull();
    expect(placeInfo("TH:area:Bangkok")).toBeNull();
  });
});
