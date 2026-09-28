/** Dev-only: render every share card for the QA scenarios (used by the headless export script). */
import "./styles.css";
import {
  buildSnapshot,
  findArea,
  pickShareCard,
  shareCardContent,
  type Profile,
  type Scenario,
  type ShareCardId,
  type ShareContext,
} from "hazenow";
import { ensureCardFonts, renderCard, type CardInput } from "./cards";

const files = import.meta.glob<Scenario>("../../../packages/core/fixtures/scenarios/*.json", { import: "default" });
const load = (n: string) => files[`../../../packages/core/fixtures/scenarios/${n}.json`]();

interface Job {
  name: string;
  input: CardInput;
}

/** The exact sample data in docs/share-cards/*.html, for side-by-side comparison with the designs. */
function samples(): Job[] {
  const credit = "Yong Quan Tan";
  return [
    { name: "sample-now", input: { kind: "now", when: "Mon 28 Sep, 5pm", place: "Tampines", hook: "Air near Tampines · Mon 28 Sep, 5pm", headline: "Elevated, and rising.", pm25: 134, band: "elevated", pmDetail: "µg/m³ 1-hr PM2.5 · up 36 in 2 hours", adviceLabel: "NEA’s advice for the next hour", adviceMost: "Reduce strenuous outdoor activity.", adviceVulnerable: "Avoid strenuous outdoor activity.", psiLine: "The 24-hr PSI (88) averages the whole day. This is the last hour. Same NEA data, different clock.", station: "NEA East station · 2.2 km away", credit } },
    { name: "sample-clocks", input: { kind: "clocks", when: "Mon 28 Sep, 5pm", place: "South", headlineLines: ["Same NEA data.", "Two clocks."], pm25: 134, band: "elevated", avg: 43, psi: 88, bars: [18,15,14,13,17,22,24,26,28,33,34,33,33,32,34,38,42,52,62,71,101,98,101,134], caption: "The daily number catches up slowly, both ways: when haze clears, it stays high for a while too.", axisEnd: "Now", nowLabel: "The last hour", credit } },
    { name: "sample-group", input: { kind: "group", when: "Mon 28 Sep, 10am", place: "Tampines", chip: "For the kids · Recess check", headline: "Calm play only, for now.", pm25: 71, band: "elevated", statsRest: "µg/m³ · Elevated · steady", actions: ["Skip running games outside this hour.", "Classroom windows shut if it smells hazy.", "Next check at 11am."], station: "East station", credit } },
    { name: "sample-clear", input: { kind: "clear", when: "Tue 29 Sep, 7am", place: "West", headline: "Air’s back to Normal.", pm25: 22, band: "normal", bodyLines: ["PM2.5 22 µg/m³. Fine to be out.", "Open the windows."], stats: "Worst hour this episode: 162 at 7pm Sun. 38 hours above Normal.", credit } },
    { name: "sample-preview", input: { kind: "preview", when: "Mon 28 Sep, 5pm", place: "South", hook: "Air near South · Mon 28 Sep, 5pm", headline: "Elevated, and rising.", pm25: 134, band: "elevated", direction: "up", psi: 88, credit } },
  ];
}

async function jobs(): Promise<Job[]> {
  if (new URLSearchParams(location.search).has("sample")) return samples();
  const out: Job[] = [];
  const place = (area: string) => {
    const a = findArea(area)!;
    return { q: { lat: a.lat, lon: a.lon }, ctx: { placeName: a.name, point: { lat: a.lat, lon: a.lon } } as ShareContext };
  };
  const runs: { sc: string; where: ReturnType<typeof place> | { q: { region: string }; ctx: ShareContext } }[] = [
    { sc: "normal", where: place("Tampines") },
    { sc: "elevated", where: place("Tampines") },
    { sc: "high", where: place("Jurong East") },
    { sc: "very_high", where: place("Choa Chu Kang") },
    { sc: "all_clear", where: { q: { region: "west" }, ctx: {} } },
    { sc: "south_offline", where: { q: { region: "south" }, ctx: {} } },
    { sc: "rising_fast", where: place("North-Eastern Islands") },
    { sc: "all_offline_stale", where: { q: { region: "west" }, ctx: {} } },
  ];
  for (const r of runs) {
    const sc = await load(r.sc);
    const now = Date.parse(sc._meta.now);
    const snap = buildSnapshot(
      { pm25Days: [sc.pm25, sc.pm25Yesterday], psiDays: [sc.psi, sc.psiYesterday] },
      r.where.q,
      now,
    );
    const pick = pickShareCard(snap, ["general"], snap.history, r.where.ctx);
    const cards: ShareCardId[] = [pick.card, ...pick.alternates];
    for (const c of cards) out.push({ name: `${r.sc}-${c}${c === pick.card ? "-picked" : ""}`, input: shareCardContent(c, snap, ["general"], r.where.ctx) });
    out.push({ name: `${r.sc}-linkpreview`, input: shareCardContent("preview", snap, ["general"], r.where.ctx) });
    if (r.sc === "all_offline_stale") out.push({ name: `${r.sc}-group-kids`, input: shareCardContent("group", snap, ["kids"], r.where.ctx) });
    if (r.sc === "elevated" || r.sc === "very_high") {
      for (const p of ["kids", "elderly", "heart_lung", "pregnant", "exercising", "outdoor_worker"] as Profile[]) {
        out.push({ name: `${r.sc}-group-${p}`, input: shareCardContent("group", snap, [p], r.where.ctx) });
      }
    }
  }
  out.push({ name: "og-generic", input: { kind: "generic" } });
  return out;
}

(async () => {
  await ensureCardFonts();
  const grid = document.getElementById("grid")!;
  const results: { name: string; w: number; h: number; dataUrl: string }[] = [];
  for (const j of await jobs()) {
    const c = renderCard(j.input);
    const dataUrl = c.toDataURL("image/png");
    results.push({ name: j.name, w: c.width, h: c.height, dataUrl });
    const f = document.createElement("figure");
    f.innerHTML = `<img class="${c.width > c.height ? "wide" : ""}" src="${dataUrl}" alt=""><figcaption>${j.name} · ${c.width}×${c.height}</figcaption>`;
    grid.append(f);
  }
  (window as unknown as { __cards: typeof results }).__cards = results;
})();
