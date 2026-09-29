export * from "./types.js";
export * from "./constants.js";
export * from "./math.js";
export * from "./parse.js";
export * from "./snapshot.js";
export * from "./format.js";
export * from "./badge.js";
export * from "./experience.js";
export { getSnapshot, fetchRaw, clearCache, v2BackoffUntil, FetchError, type FetchLike, type GetSnapshotOptions, type RawResponses } from "./client.js";
export * from "./mock.js";
export * from "./areas.js";
export * from "./share.js";
// SPEC v2.0 — Southeast Asia (additive). Namespaced to avoid clashing with v1 names such as `locate`.
export * as sea from "./countries/index.js";
export {
  locate as locateCountry,
  countryAt,
  buildCountrySnapshot,
  countryVerdict,
  getAdapter,
  ADAPTERS,
  SCALES as BAND_SCALES,
  COUNTRIES,
  type CountryCode,
  type CountrySnapshot,
  type CountryAdapter,
  type Observation,
  type ObservationSet,
} from "./countries/index.js";
// SPEC v2.1 — country guess (light: no catalogue, borders or scales, so the Singapore web bundle can use it at boot).
export {
  guessCountry,
  deviceGuessInput,
  wantsServerHint,
  languageCountry,
  type CountryGuess,
  type CountryGuessInput,
  type GuessConfidence,
} from "./countries/guess.js";
