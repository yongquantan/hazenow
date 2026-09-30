/**
 * SPEC v2.1 — country guess. Which country (and which starting place) to show a first-time visitor, from signals the
 * device already has: its time zone and its preferred languages. No location, no permission prompt, nothing sent.
 *
 * Pure and dependency-free on purpose: the Singapore web bundle imports it at boot, so it must not pull in the place
 * catalogue, the borders or the scales. `startPlace()` in places.ts turns a guess into a catalogue place.
 *
 * Optional third signal: `serverCountry`, the country of the visitor's connection (Cloudflare `request.cf.country`,
 * from the web's `/api/where`). Clients only ask for it when the device guess is not "high", and never wait for it.
 */
import type { CountryCode } from "./types.js";

export type GuessConfidence = "high" | "medium" | "low";

export interface CountryGuessInput {
  /** IANA time zone, e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone` / `TimeZone.current.identifier`. */
  timeZone?: string | null;
  /** BCP 47 tags in preference order, e.g. `navigator.languages` / `Locale.preferredLanguages`. */
  languages?: readonly string[] | null;
  /** ISO 3166-1 alpha-2 country of the connection (web `/api/where` only). Any country, not only SEA. */
  serverCountry?: string | null;
}

export interface CountryGuess {
  /** A Southeast Asian country, or null for "outside Southeast Asia / no idea" (clients then show Singapore). */
  country: CountryCode | null;
  confidence: GuessConfidence;
  /** One plain sentence on why, for debugging and QA. Not shown to visitors. */
  reason: string;
  /** Catalogue slug of the suggested starting place in `country` (resolve with places.ts `startPlace`), or null. */
  place: string | null;
  /**
   * True when `place` comes from the time zone itself (Asia/Makassar → Denpasar, Asia/Kuching → Kuching), not the
   * country default. It's only a suggestion: Asia/Makassar also covers Sulawesi, Lombok and more.
   */
  placeFromZone: boolean;
}

interface Zone {
  cc: CountryCode;
  /** Zone-specific starting place (slug), else the country default. */
  place?: string;
  /** Other countries whose devices commonly use this zone too. */
  shared?: readonly CountryCode[];
}

/** IANA zones (and their old link names) → country. Every other zone is outside Southeast Asia. */
export const SEA_TIME_ZONES: Readonly<Record<string, Zone>> = {
  "Asia/Singapore": { cc: "SG" },
  Singapore: { cc: "SG" },
  // Asia/Bangkok is also the default on many devices in Vietnam, Laos and Cambodia (and tzdb links Asia/Vientiane
  // and Asia/Phnom_Penh to it), so on its own it only says "somewhere in mainland SEA, probably Thailand".
  "Asia/Bangkok": { cc: "TH", shared: ["VN", "LA", "KH"] },
  "Asia/Kuala_Lumpur": { cc: "MY" },
  "Asia/Kuching": { cc: "MY", place: "kuching" },
  "Asia/Jakarta": { cc: "ID" },
  "Asia/Pontianak": { cc: "ID", place: "pontianak" },
  "Asia/Makassar": { cc: "ID", place: "denpasar" },
  "Asia/Ujung_Pandang": { cc: "ID", place: "denpasar" },
  "Asia/Jayapura": { cc: "ID" },
  "Asia/Ho_Chi_Minh": { cc: "VN" },
  "Asia/Saigon": { cc: "VN" },
  "Asia/Manila": { cc: "PH" },
  "Asia/Vientiane": { cc: "LA" },
  "Asia/Phnom_Penh": { cc: "KH" },
  "Asia/Yangon": { cc: "MM" },
  "Asia/Rangoon": { cc: "MM" },
  "Asia/Brunei": { cc: "BN" },
  "Asia/Dili": { cc: "TL" },
};

/** Default starting place per country: the capital or the most-populous city (slugs of registry `defaultPlace`). */
export const GUESS_DEFAULT_PLACE: Readonly<Record<CountryCode, string>> = {
  SG: "singapore",
  TH: "bangkok",
  MY: "kuala-lumpur",
  ID: "jakarta",
  VN: "hanoi",
  PH: "metro-manila",
  LA: "vientiane",
  KH: "siem-reap",
  MM: "yangon",
  BN: "bandar-seri-begawan",
  TL: "dili",
};

/** Language subtag → country (tie-breaker only). "my" is Burmese, "in" is the old code for Indonesian. */
export const SEA_LANGUAGES: Readonly<Record<string, CountryCode>> = {
  th: "TH",
  vi: "VN",
  id: "ID",
  in: "ID",
  ms: "MY",
  fil: "PH",
  tl: "PH",
  lo: "LA",
  km: "KH",
  my: "MM",
  tet: "TL",
};

const CODES = Object.keys(GUESS_DEFAULT_PLACE) as CountryCode[];
const isSea = (x: string): x is CountryCode => (CODES as string[]).includes(x);
const NAMES: Record<CountryCode, string> = {
  SG: "Singapore", TH: "Thailand", MY: "Malaysia", ID: "Indonesia", VN: "Vietnam", PH: "the Philippines", LA: "Laos",
  KH: "Cambodia", MM: "Myanmar", BN: "Brunei", TL: "Timor-Leste",
};

/**
 * The country a language tag points at: its region subtag when that's a SEA country ("en-SG", "zh-MY"), else the
 * language itself ("th", "vi-VN"). Script subtags are skipped ("zh-Hans-SG").
 */
export function languageCountry(tag: string): CountryCode | null {
  const parts = tag.trim().replace(/_/g, "-").split("-");
  const lang = (parts[0] ?? "").toLowerCase();
  const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$/.test(p))?.toUpperCase();
  if (region && isSea(region)) return region;
  return SEA_LANGUAGES[lang] ?? null;
}

/** The first language in preference order that points at a SEA country. */
function firstLanguage(languages: readonly string[] | null | undefined): { cc: CountryCode; tag: string } | null {
  for (const tag of languages ?? []) {
    if (typeof tag !== "string") continue;
    const cc = languageCountry(tag);
    if (cc) return { cc, tag };
  }
  return null;
}

/** A real, non-SEA IANA zone ("Europe/London"). UTC, "Etc/…" and junk count as "no time zone" (privacy browsers). */
function isOtherZone(tz: string): boolean {
  return /^(Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/[A-Za-z_\-/+0-9]+$/.test(tz);
}

const guess = (country: CountryCode | null, confidence: GuessConfidence, reason: string, zone?: Zone): CountryGuess => {
  const fromZone = !!(country && zone?.place && zone.cc === country);
  return {
    country,
    confidence,
    reason,
    place: country ? (fromZone ? zone!.place! : GUESS_DEFAULT_PLACE[country]) : null,
    placeFromZone: fromZone,
  };
};

/**
 * Guess the visitor's country from device signals, with an optional connection country as a tie-breaker.
 *
 * - A SEA time zone decides the country ("high"), except Asia/Bangkok, which is shared: a Vietnamese, Lao or Khmer
 *   language (or the connection) picks VN/LA/KH, Thai confirms TH, anything else is TH at "low".
 * - Languages only break ties. When they point at a different SEA country than the zone, confidence drops to "medium"
 *   (the zone still wins), and the connection country, if given, decides between the two.
 * - A non-SEA zone ("Europe/London") → null ("medium"): show Singapore with a picker hint. Its languages are ignored.
 * - No usable zone (UTC, missing): the connection, else the languages ("low"), else null ("low").
 */
export function guessCountry(input: CountryGuessInput = {}): CountryGuess {
  const tz = (input.timeZone ?? "").trim();
  const zone = SEA_TIME_ZONES[tz];
  const lang = firstLanguage(input.languages);
  const rawServer = (input.serverCountry ?? "").trim().toUpperCase();
  // Cloudflare uses XX (unknown) and T1 (Tor); neither is a country.
  const server = /^[A-Z]{2}$/.test(rawServer) && rawServer !== "XX" && rawServer !== "T1" ? rawServer : null;
  const seaServer = server && isSea(server) ? server : null;

  if (zone?.shared) {
    const candidates = [zone.cc, ...zone.shared];
    const list = "Thailand, Vietnam, Laos and Cambodia";
    if (seaServer && candidates.includes(seaServer)) {
      return guess(seaServer, "high", `${tz} is used in ${list}; the connection is in ${NAMES[seaServer]}.`, zone);
    }
    if (lang && candidates.includes(lang.cc)) {
      return lang.cc === zone.cc
        ? guess(zone.cc, "high", `${tz} with ${lang.tag} points at ${NAMES[zone.cc]}.`, zone)
        : guess(lang.cc, "medium", `${tz} is used in ${list}; the language ${lang.tag} points at ${NAMES[lang.cc]}.`, zone);
    }
    return guess(zone.cc, "low", `${tz} is also used in Vietnam, Laos and Cambodia, and no language settles it.`, zone);
  }

  if (zone) {
    const cc = zone.cc;
    if (!lang || lang.cc === cc) return guess(cc, "high", `Time zone ${tz} is ${NAMES[cc]}${lang ? `, and ${lang.tag} agrees` : ""}.`, zone);
    // The zone and the language disagree (an expat, or a traveller who kept their language): the connection decides.
    if (seaServer === cc) return guess(cc, "high", `Time zone ${tz} and the connection agree on ${NAMES[cc]}.`, zone);
    if (seaServer === lang.cc) return guess(lang.cc, "high", `The language ${lang.tag} and the connection agree on ${NAMES[lang.cc]}.`, zone);
    return guess(cc, "medium", `Time zone ${tz} says ${NAMES[cc]}, but the language ${lang.tag} says ${NAMES[lang.cc]}.`, zone);
  }

  if (tz && isOtherZone(tz)) {
    if (seaServer) return guess(seaServer, "medium", `Time zone ${tz} is outside Southeast Asia, but the connection is in ${NAMES[seaServer]}.`);
    if (server) return guess(null, "high", `Time zone ${tz} and the connection (${server}) are outside Southeast Asia.`);
    return guess(null, "medium", `Time zone ${tz} is outside Southeast Asia.`);
  }

  // No usable time zone (missing, UTC or Etc/*, as privacy-hardened browsers report).
  if (seaServer) return guess(seaServer, "medium", `No usable time zone; the connection is in ${NAMES[seaServer]}.`);
  if (server) return guess(null, "high", `No usable time zone; the connection (${server}) is outside Southeast Asia.`);
  if (lang) return guess(lang.cc, "low", `No usable time zone; only the language ${lang.tag} points at ${NAMES[lang.cc]}.`);
  return guess(null, "low", "No usable time zone or language.");
}

/** Whether a client should ask for the connection country (web `/api/where`) to firm up this guess. */
export function wantsServerHint(g: Pick<CountryGuess, "confidence">): boolean {
  return g.confidence !== "high";
}

/** Read the device signals (browser or any JS runtime). Never throws; missing signals come back null. */
export function deviceGuessInput(): CountryGuessInput {
  let timeZone: string | null = null;
  let languages: string[] | null = null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    /* no Intl time zone support */
  }
  try {
    const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
    languages = nav?.languages?.length ? [...nav.languages] : nav?.language ? [nav.language] : null;
  } catch {
    /* no navigator */
  }
  return { timeZone, languages };
}
