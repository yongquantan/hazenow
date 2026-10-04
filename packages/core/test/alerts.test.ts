// Band-crossing alerts: the native apps' test vectors (Android AlertsTest, Apple ExperienceTests), ported verbatim.
import { describe, expect, test } from "bun:test";
import { bandFor, confirmedBand, elevatedEnabled, evaluateAlert, inQuietHours, type AlertPrefs, type AlertState, type LocationMode, type Snapshot } from "../src/index.js";

const day = Date.parse("2026-09-28T04:00:00Z"); // 12:00 SGT
const night = Date.parse("2026-09-28T15:00:00Z"); // 23:00 SGT
const morning = Date.parse("2026-09-28T23:30:00Z"); // 07:30 SGT next day

function s(values: number[], mode: LocationMode = "region"): Snapshot {
  const history = values.map((pm25, i) => ({ time: `2026-09-28T${String(i).padStart(2, "0")}:00:00+08:00`, pm25 }));
  const pm25 = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : pm25;
  return {
    pm25,
    band: bandFor(pm25),
    instantPsi: 0,
    instantPsiLabel: "Good",
    officialPsi24h: 80,
    trend: { delta: pm25 - prev, direction: pm25 > prev ? "up" : pm25 < prev ? "down" : "steady" },
    history,
    regions: {},
    nearestRegion: "west",
    locationMode: mode,
    observedAt: history[history.length - 1].time,
    publishedAt: history[history.length - 1].time,
    stale: false,
    source: "NEA via data.gov.sg",
  };
}

const sensitive: AlertPrefs = { profiles: ["kids"] };
const general: AlertPrefs = { profiles: ["general"] };

describe("alerts (Android AlertsTest)", () => {
  test("first run adopts silently", () => {
    const o = evaluateAlert({}, s([100]), general, day);
    expect(o.state.band).toBe("elevated");
    expect(o.alert).toBeNull();
  });

  test("hysteresis", () => {
    const st: AlertState = { band: "normal" };
    expect(evaluateAlert(st, s([40, 58]), sensitive, day).alert).toBeNull(); // 3 over, one hour
    expect(evaluateAlert(st, s([40, 57, 58]), sensitive, day).alert).not.toBeNull(); // 2 hours in a row
    expect(evaluateAlert(st, s([40, 65]), sensitive, day).alert).not.toBeNull(); // ≥10 over
  });

  test("Elevated is off by default for general-only", () => {
    const st: AlertState = { band: "normal" };
    const o = evaluateAlert(st, s([40, 80]), general, day);
    expect(o.alert).toBeNull();
    expect(o.state.band).toBe("elevated");
    expect(elevatedEnabled(general)).toBe(false);
    expect(elevatedEnabled({ profiles: ["exercising"] })).toBe(true);
    expect(evaluateAlert(st, s([40, 80]), { ...general, elevated: true }, day).alert).not.toBeNull();
    const high = evaluateAlert(o.state, s([80, 170]), general, day).alert!;
    expect(high.title).toBe("Haze now High in the West");
    expect(high.body).toBe("PM2.5 170. Short trips out are OK. Exercise indoors. Close windows and keep cool with aircon or a fan.");
  });

  test("copy verbatim: rising and all clear", () => {
    const o = evaluateAlert({ band: "normal" }, s([40, 105]), { ...general, elevated: true }, day);
    expect(o.alert!.title).toBe("Haze rising in the West");
    expect(o.alert!.body).toBe("Now Elevated (PM2.5 105). OK to be out. Go easy on hard exercise.");
    const kidsHigh = evaluateAlert({ band: "elevated" }, s([100, 172], "gps"), sensitive, day).alert!;
    expect(kidsHigh.title).toBe("Haze now High near you");
    expect(kidsHigh.body).toBe("PM2.5 172. Indoor play for now. Keep trips out short. Close windows and keep cool with aircon or a fan.");
    expect(evaluateAlert({ band: "normal" }, s([40, 105], "gps"), { ...general, elevated: true, placeName: "Tampines" }, day).alert!.title).toBe(
      "Haze rising in Tampines",
    );
    const clear = evaluateAlert(o.state, s([105, 40]), general, day);
    expect(clear.alert!.title).toBe("All clear in the West");
    expect(clear.alert!.body).toBe("Air's back to Normal (PM2.5 40). Fine to be out. Good time to open the windows.");
    expect(clear.alert!.kind).toBe("allClear");
    expect(clear.state.episodeAlerted).toBe(false);
  });

  test("no all-clear if nothing was sent", () => {
    const o = evaluateAlert({ band: "elevated" }, s([80, 40]), general, day);
    expect(o.alert).toBeNull();
    expect(o.state.band).toBe("normal");
  });

  test("daily cap, but the all-clear gets through", () => {
    const capped: AlertState = { band: "elevated", episodeAlerted: true, day: "2026-09-28", sentToday: 3 };
    expect(evaluateAlert(capped, s([100, 180]), sensitive, day).alert).toBeNull();
    expect(evaluateAlert(capped, s([100, 30]), sensitive, day).alert!.body).toBe("Air's back to Normal (PM2.5 30). Fine for outdoor play again.");
    expect(evaluateAlert(capped, s([100, 180]), sensitive, Date.parse("2026-09-29T04:00:00Z")).alert).not.toBeNull(); // new day
  });

  test("quiet hours, then a morning catch-up", () => {
    expect(inQuietHours(night)).toBe(true);
    expect(inQuietHours(day)).toBe(false);
    expect(inQuietHours(morning)).toBe(false);
    const o = evaluateAlert({ band: "normal", day: "2026-09-28" }, s([40, 170]), sensitive, night);
    expect(o.alert).toBeNull();
    expect(o.state.overnightPeak).toBe("high");
    const m = evaluateAlert(o.state, s([130, 120]), sensitive, morning);
    expect(m.alert!.title).toBe("Overnight air update");
    expect(m.alert!.body).toBe("The haze reached High overnight. Now: Elevated, PM2.5 120, easing. Calm play outside is OK. Skip running games for now.");
    expect(m.state.overnightPeak).toBeNull();
  });
});

describe("alerts (Apple ExperienceTests)", () => {
  test("hysteresis vectors", () => {
    const h = (v: number[]) => v.map((pm25) => ({ pm25 }));
    expect(confirmedBand("normal", h([50, 58]))).toBe("normal");
    expect(confirmedBand("normal", h([57, 58]))).toBe("elevated");
    expect(confirmedBand("normal", h([40, 65]))).toBe("elevated");
    expect(confirmedBand("elevated", h([60, 50]))).toBe("elevated");
    expect(confirmedBand("elevated", h([60, 45]))).toBe("normal");
  });

  test("Elevated copy for kids and opted-in general", () => {
    const at = Date.parse("2026-09-28T16:40:00+08:00");
    expect(evaluateAlert({ band: "normal" }, s([90, 105]), general, at).alert).toBeNull();
    const kids = evaluateAlert({ band: "normal" }, s([90, 105]), sensitive, at).alert!;
    expect(kids.title).toBe("Haze rising in the West");
    expect(kids.body).toBe("Now Elevated (PM2.5 105). Calm play outside is OK. Skip running games for now.");
    expect(evaluateAlert({ band: "normal" }, s([90, 105]), { ...general, elevated: true }, at).alert!.body).toBe(
      "Now Elevated (PM2.5 105). OK to be out. Go easy on hard exercise.",
    );
  });

  test("Very High copy, and stale never alerts", () => {
    const vh = evaluateAlert({ band: "high" }, s([240, 300]), general, day).alert!;
    expect(vh.title).toBe("Haze now Very High in the West");
    expect(vh.body).toBe("PM2.5 300. Stay indoors for now. Go out only if you need to. Check on older family.");
    expect(evaluateAlert({ band: "normal" }, { ...s([170, 172]), stale: true }, general, day).alert).toBeNull();
  });

  test("easing follows an alert this episode", () => {
    const st: AlertState = { band: "high", episodeAlerted: true, day: "2026-09-28", sentToday: 1 };
    const e = evaluateAlert(st, s([160, 120]), general, day).alert!;
    expect(e.title).toBe("Haze easing in the West");
    expect(e.body).toBe("Down to Elevated (PM2.5 120). OK to be out. Go easy on hard exercise.");
    expect(evaluateAlert({ ...st, episodeAlerted: false }, s([160, 120]), general, day).alert).toBeNull();
  });

  test("exercise all-clear, and islandwide", () => {
    const st: AlertState = { band: "elevated", episodeAlerted: true };
    const a = evaluateAlert(st, { ...s([80, 30], "island") }, { profiles: ["exercising"] }, day).alert!;
    expect(a.title).toBe("All clear islandwide");
    expect(a.body).toBe("Air's back to Normal (PM2.5 30). Fine for your run.");
  });
});
