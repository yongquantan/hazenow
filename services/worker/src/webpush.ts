/**
 * Web Push from a Worker, with WebCrypto only (no Node APIs):
 *  - RFC 8291 message encryption (aes128gcm, RFC 8188), one record, ECDH P-256 + HKDF-SHA-256 + AES-128-GCM.
 *  - RFC 8292 VAPID: an ES256 JWT signed with our private key, sent as `Authorization: vapid t=…, k=…`.
 * Tested against RFC 8291 Appendix A and with a user-agent-side decrypt (test/push.test.ts).
 */

const enc = new TextEncoder();

export function b64uEncode(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(str: string): Uint8Array {
  const s = str.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

export interface PushKeys {
  /** The browser's P-256 public key, uncompressed (65 bytes), base64url. */
  p256dh: string;
  /** The browser's 16-byte auth secret, base64url. */
  auth: string;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: PushKeys;
}

/** Record size written in the header. One record holds the whole message (push services accept 4096 bytes). */
export const RECORD_SIZE = 4096;
/** Largest plaintext that fits in one 4096-byte message: header 86, delimiter 1, GCM tag 16. */
export const MAX_PLAINTEXT = RECORD_SIZE - 86 - 1 - 16;

/** Valid keys: an uncompressed P-256 point and a 16-byte secret. */
export function validKeys(k: Partial<PushKeys> | undefined | null): k is PushKeys {
  if (!k || typeof k.p256dh !== "string" || typeof k.auth !== "string") return false;
  try {
    const pub = b64uDecode(k.p256dh);
    return pub.length === 65 && pub[0] === 0x04 && b64uDecode(k.auth).length === 16;
  } catch {
    return false;
  }
}

/**
 * RFC 8291 §3–4: encrypt `plaintext` for one subscription. `testing` pins the salt and the ephemeral key pair
 * (only the RFC's test vector does that; a real send always uses fresh ones).
 */
export async function encryptPayload(
  keys: PushKeys,
  plaintext: Uint8Array,
  testing?: { salt: Uint8Array; localKeys: CryptoKeyPair },
): Promise<Uint8Array> {
  if (plaintext.length > MAX_PLAINTEXT) throw new Error(`Payload is ${plaintext.length} bytes; the maximum is ${MAX_PLAINTEXT}`);
  const uaPublic = b64uDecode(keys.p256dh);
  const authSecret = b64uDecode(keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04 || authSecret.length !== 16) throw new Error("Bad subscription keys");
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const local = testing?.localKeys ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  // workers-types spells the member `$public`; at runtime (WebCrypto, workerd) it is `public`.
  const ecdhParams = { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, local.privateKey, 256));
  const salt = testing?.salt ?? crypto.getRandomValues(new Uint8Array(16));

  // §3.4: IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" 0x00 ua_public as_public, 32)
  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  // RFC 8188 §2.2–2.3: CEK and nonce from the salt.
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // One (last) record: plaintext, then the 0x02 delimiter. No extra padding.
  const record = concat(plaintext, new Uint8Array([0x02]));
  const aes = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aes, record));

  // RFC 8188 §2.1 header: salt (16) | rs (uint32) | idlen (1) | keyid (the 65-byte as_public).
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, sealed);
}

/** The VAPID key pair: public = uncompressed point (base64url, 65 bytes), private = the scalar `d` (base64url). */
export interface Vapid {
  publicKey: string;
  privateKey: string;
  /** RFC 8292 §2.1 contact: a mailto: or https: URL. Apple rejects anything else. */
  subject: string;
}

export async function importVapidKey(v: Vapid): Promise<CryptoKey> {
  const pub = b64uDecode(v.publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("Bad VAPID public key");
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: v.privateKey, ext: false },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** RFC 8292 §2–3: `Authorization` for one push service origin. Valid for 12 h (the maximum is 24 h). */
export async function vapidAuthorization(v: Vapid, key: CryptoKey, audience: string, now = Date.now()): Promise<string> {
  const part = (o: unknown) => b64uEncode(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: v.subject })}`;
  // WebCrypto's ECDSA signature is already JOSE's raw r||s (64 bytes).
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));
  return `vapid t=${unsigned}.${b64uEncode(sig)}, k=${v.publicKey}`;
}

export interface PushMessage {
  /** Seconds the push service may hold the message for an offline device. */
  ttl: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  /** A newer message with the same topic replaces an undelivered older one (≤ 32 base64url chars). */
  topic?: string;
}

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Encrypt and POST one message. Returns the push service's status: 201 delivered to the service, 404/410 the
 * subscription is gone (delete it), 413 too large, 429 slow down. Network errors return 0.
 */
export async function sendPush(
  sub: PushSubscriptionJSON,
  payload: string,
  msg: PushMessage,
  authorization: string,
  fetchFn: FetchFn = (u, i) => fetch(u, i),
): Promise<number> {
  const body = await encryptPayload(sub.keys, enc.encode(payload));
  const headers: Record<string, string> = {
    ttl: String(msg.ttl),
    "content-encoding": "aes128gcm",
    "content-type": "application/octet-stream",
    authorization,
  };
  if (msg.urgency) headers.urgency = msg.urgency;
  if (msg.topic) headers.topic = msg.topic;
  try {
    const res = await fetchFn(sub.endpoint, { method: "POST", headers, body });
    // Drain so the connection can be reused.
    await res.arrayBuffer().catch(() => undefined);
    return res.status;
  } catch {
    return 0;
  }
}

/** Generate a VAPID key pair (scripts/vapid-keys.ts uses it once). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  return { publicKey: b64uEncode(pub), privateKey: jwk.d! };
}
