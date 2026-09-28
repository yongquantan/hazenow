/**
 * Southeast Asia switcher: country tabs → city tabs → the web app's real screen for that city, plus the facts.
 * Facts come from docs/sea/COVERAGE.md and SPEC v2.0 (§4 big number, §5 chip scales). Keep them in step.
 * ARIA tabs pattern: roving tabindex, arrows / Home / End move and select, both tab rows control one panel.
 */

type Status = "live" | "preview" | "none";

interface City {
  id: string; // app slug and screenshot name
  name: string;
  status: Status;
  source: string;
  reading: string;
  alt: string;
  note?: string;
}

interface Country {
  cc: string;
  name: string;
  bands: string; // the local words, whose they are
  cities: City[];
}

const CROWD = "AirGradient community sensors (CC BY-SA 4.0)";
const ID_BANDS = "KLH/BMKG ISPU: Baik · Sedang · Tidak Sehat · Sangat Tidak Sehat · Berbahaya";
const MY_BANDS = "DOE Malaysia API: Baik · Sederhana · Tidak Sihat · Sangat Tidak Sihat · Merbahaya · Kecemasan";
const TH_BANDS =
  "PCD Thai AQI: ดีมาก · ดี · ปานกลาง · เริ่มมีผลกระทบต่อสุขภาพ · มีผลกระทบต่อสุขภาพ (Excellent · Satisfactory · Moderate · Starting to affect health · Affects health)";
const PREVIEW = "Built and tested on recorded data from 28 Sep 2026. It goes live once our data server is up.";

const COUNTRIES: Country[] = [
  {
    cc: "sg",
    name: "Singapore",
    bands: "NEA 1-hr PM2.5 bands: Normal · Elevated · High · Very High",
    cities: [
      {
        id: "tampines",
        name: "Tampines",
        status: "live",
        source: "National Environment Agency (NEA), via data.gov.sg",
        reading: "1-hr PM2.5, official. NEA's 24-hr PSI is shown alongside.",
        note: "The screen uses NEA readings captured on 28 Sep 2026, 4pm.",
        alt: "HazeNow for Tampines, Singapore. Headline: OK to be out. Go easy on hard exercise. 84 µg/m³ PM2.5 in the last hour, Elevated, rising fast: up 20 in the last hour. NEA 24-hr PSI: 73 (Moderate).",
      },
    ],
  },
  {
    cc: "th",
    name: "Thailand",
    bands: TH_BANDS,
    cities: [
      {
        id: "bangkok",
        name: "Bangkok",
        status: "live",
        source: "Pollution Control Department (PCD), Air4Thai. Includes Bangkok's BMA stations.",
        reading: "1-hr PM2.5, official. The band follows PCD's 24-hr Thai AQI.",
        note: "PCD's licence to redistribute is still to be confirmed. Thai wording is a draft awaiting native review.",
        alt: "HazeNow for Bangkok. Headline: Fine to be out. 13 µg/m³ PM2.5 in the last hour, band Excellent ดีมาก, the PCD category for the 24-hr Thai AQI. PCD Thai AQI (24-hr): 20. Easing: down 5 in the last hour. Measured at Phra Nakhon District Office, 0.9 km away.",
      },
      {
        id: "chiang-mai",
        name: "Chiang Mai",
        status: "live",
        source: "Pollution Control Department (PCD), Air4Thai",
        reading: "1-hr PM2.5, official. The band follows PCD's 24-hr Thai AQI.",
        note: "PCD's licence to redistribute is still to be confirmed. Thai wording is a draft awaiting native review.",
        alt: "HazeNow for Chiang Mai. Headline: Fine to be out. 7 µg/m³ PM2.5 in the last hour, band Excellent ดีมาก. PCD Thai AQI (24-hr): 11. Steady over the last hour. Measured at Yupparaj Wittayalai School, 0.6 km away.",
      },
    ],
  },
  {
    cc: "my",
    name: "Malaysia",
    bands: MY_BANDS,
    cities: [
      {
        id: "kuala-lumpur",
        name: "Kuala Lumpur",
        status: "preview",
        source: `Department of Environment Malaysia (DOE, APIMS), plus ${CROWD}`,
        reading: "1-hr estimate from community sensors. DOE publishes only a 24-hr index (API), and the band follows it.",
        note: `${PREVIEW} Written permission from DOE Malaysia is also needed.`,
        alt: "Preview of HazeNow for Kuala Lumpur, with recorded data from 28 Sep, 6pm. Headline: Based on the 24-hr index: fine to be out. 64 µg/m³ PM2.5 from community sensors, band Moderate Sederhana, the DOE category for the 24-hr API. DOE Malaysia API (24-hr): 87.",
      },
      {
        id: "johor-bahru",
        name: "Johor Bahru",
        status: "preview",
        source: "Department of Environment Malaysia (DOE, APIMS)",
        reading: "24-hr index only (DOE API). There's no 1-hr reading nearby, so there's no big number.",
        note: `${PREVIEW} Written permission from DOE Malaysia is also needed.`,
        alt: "Preview of HazeNow for Johor Bahru, with recorded data from 28 Sep, 6pm. Headline: Based on the 24-hr index: fine to be out. A box says there's no official hourly reading here, band Moderate Sederhana. DOE Malaysia API (24-hr): 97. A community sensor nearby reads 104 µg/m³.",
      },
    ],
  },
  {
    cc: "id",
    name: "Indonesia",
    bands: ID_BANDS,
    cities: [
      {
        id: "palembang",
        name: "Palembang",
        status: "preview",
        source: "BMKG hourly PM2.5, plus KLH's 24-hr ISPU",
        reading: "1-hr PM2.5, official (BMKG). ISPU categories are applied to the hourly value, as BMKG does.",
        note: `${PREVIEW} Permission from BMKG and KLH is also needed.`,
        alt: "Preview of HazeNow for Palembang, with recorded data from 28 Sep, 5pm WIB. Headline: Cut back on long or hard activity outside for now. 120 µg/m³ PM2.5 in the last hour, band Unhealthy Tidak Sehat, the ISPU category for this hour. KLH ISPU (24-hr): 142.",
      },
      {
        id: "jakarta",
        name: "Jakarta",
        status: "preview",
        source: "BMKG hourly PM2.5, plus KLH's 24-hr ISPU",
        reading: "1-hr PM2.5, official (BMKG). ISPU categories are applied to the hourly value, as BMKG does.",
        note: `${PREVIEW} Permission from BMKG and KLH is also needed.`,
        alt: "Preview of HazeNow for Jakarta, with recorded data from 28 Sep, 5pm WIB. Headline: Fine to be out. 33 µg/m³ PM2.5 in the last hour, band Moderate Sedang. KLH ISPU (24-hr): 113, Unhealthy Tidak Sehat. Measured at Kemayoran station, 5.9 km away.",
      },
    ],
  },
  {
    cc: "vn",
    name: "Vietnam",
    bands: "VN_AQI: Tốt · Trung bình · Kém · Xấu · Rất xấu · Nguy hại",
    cities: [
      {
        id: "hanoi",
        name: "Hanoi",
        status: "preview",
        source: "Hanoi's air-quality stations (moitruongthudo.vn)",
        reading: "1-hr, official: the published hourly VN_AQI and its PM2.5.",
        note: `${PREVIEW} Permission from the Hanoi Environment Technical Centre is also needed.`,
        alt: "Preview of HazeNow for Hanoi, with recorded data from 28 Sep, 5pm ICT. Headline: Fine to be out. 11 µg/m³ PM2.5 in the last hour, band Good Tốt, the category for the hourly VN_AQI. VN_AQI (hourly): 34. Rising: up 7 in the last hour.",
      },
    ],
  },
  {
    cc: "ph",
    name: "Philippines",
    bands: "DENR DAO 2020-14: Good · Fair · Unhealthy for sensitive groups · Very Unhealthy · Acutely unhealthy · Emergency",
    cities: [
      {
        id: "metro-manila",
        name: "Metro Manila",
        status: "preview",
        source: `${CROWD}. The government feed (DENR-EMB) can't be read yet.`,
        reading: "1-hr estimate from community sensors, labelled as not a government reading.",
        note: PREVIEW,
        alt: "Preview of HazeNow for Metro Manila, with recorded data from 28 Sep, 6pm. Headline: Fine to be out. 21 µg/m³ PM2.5 from community sensors, band Good, the DENR-EMB category. Estimate from 4 community sensors, not a government reading.",
      },
    ],
  },
  {
    cc: "la",
    name: "Laos",
    bands: "No official scale. We show the number and the WHO daily guideline instead.",
    cities: [
      {
        id: "vientiane",
        name: "Vientiane",
        status: "preview",
        source: `${CROWD}, from a UNICEF-supported school network`,
        reading: "1-hr estimate from community sensors. There's no government feed.",
        note: `${PREVIEW} A courtesy agreement with UNICEF Laos and AirGradient is also needed.`,
        alt: "Preview of HazeNow for Vientiane, with recorded data from 28 Sep, 5pm ICT. Headline: There's no official air-quality scale here. 3 µg/m³ PM2.5 from community sensors, 0.2 times the WHO daily guideline. Estimate from 5 community sensors.",
      },
    ],
  },
  {
    cc: "kh",
    name: "Cambodia",
    bands: "No official scale.",
    cities: [
      {
        id: "phnom-penh",
        name: "Phnom Penh",
        status: "none",
        source: "None yet. Cambodia's Ministry of Environment doesn't publish live readings.",
        reading: "No reading. The only 2 community sensors are 14 km or more from the city, too far to estimate it.",
        note: "We'd rather show nothing than a number we can't stand behind. This changes when more sensors or a government feed appear.",
        alt: "HazeNow for Phnom Penh. Headline: Not available yet. Cambodia doesn't publish live air-quality readings yet, and there are only a couple of community sensors, too far out to estimate the city. A button: Pick another place.",
      },
    ],
  },
];

const STATUS: Record<Status, { cls: string; label: string }> = {
  live: { cls: "s-live", label: "Live" },
  preview: { cls: "s-beta", label: "Preview · needs our server" },
  none: { cls: "s-soon", label: "Not available yet" },
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Roving-tabindex tabs: arrows/Home/End move focus and select (automatic activation). */
function tabKeys(list: HTMLElement, onSelect: (i: number) => void) {
  list.addEventListener("keydown", (e) => {
    const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
    const i = tabs.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % tabs.length
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onSelect(next);
    list.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  });
}

export function initSea(appBase: string) {
  const root = document.querySelector<HTMLElement>("[data-sea]");
  const countriesEl = root?.querySelector<HTMLElement>("[data-sea-countries]");
  const panel = root?.querySelector<HTMLElement>("[data-sea-panel]");
  const citiesEl = root?.querySelector<HTMLElement>("[data-sea-cities]");
  const body = root?.querySelector<HTMLElement>("[data-sea-body]");
  if (!root || !countriesEl || !panel || !citiesEl || !body) return;

  let ci = 0;
  let ti = 0;

  countriesEl.innerHTML = COUNTRIES.map((c, i) => {
    const st = c.cities.every((x) => x.status === "live") ? "live" : c.cities.some((x) => x.status === "preview") ? "preview" : "none";
    return `<button type="button" role="tab" id="sea-tab-${c.cc}" aria-controls="sea-country-panel" data-i="${i}" class="sea-tab" data-status="${st}"><i aria-hidden="true"></i>${esc(c.name)}</button>`;
  }).join("");

  const renderCountry = () => {
    const c = COUNTRIES[ci];
    countriesEl.querySelectorAll<HTMLElement>('[role="tab"]').forEach((t, i) => {
      t.setAttribute("aria-selected", String(i === ci));
      t.tabIndex = i === ci ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", `sea-tab-${c.cc}`);
    citiesEl.setAttribute("aria-label", `Cities in ${c.name}`);
    citiesEl.innerHTML = c.cities
      .map((x, i) => `<button type="button" role="tab" id="sea-city-${c.cc}-${x.id}" aria-controls="sea-city-panel" data-i="${i}" class="sea-chip">${esc(x.name)}</button>`)
      .join("");
    renderCity();
  };

  const renderCity = () => {
    const c = COUNTRIES[ci];
    const x = c.cities[ti];
    citiesEl.querySelectorAll<HTMLElement>('[role="tab"]').forEach((t, i) => {
      t.setAttribute("aria-selected", String(i === ti));
      t.tabIndex = i === ti ? 0 : -1;
    });
    body.setAttribute("aria-labelledby", `sea-city-${c.cc}-${x.id}`);
    const st = STATUS[x.status];
    const href = `${appBase}?country=${c.cc}&area=${encodeURIComponent(x.id)}`;
    body.innerHTML = `
      <figure class="sea-shot">
        <div class="sea-frame"><img src="/img/sea-${c.cc}-${x.id}.webp" width="540" height="1094" loading="lazy" decoding="async" alt="${esc(x.alt)}" /></div>
      </figure>
      <div class="sea-facts">
        <p class="sea-place">${esc(x.name)}, ${esc(c.name)}</p>
        <p><span class="status ${st.cls}"><i aria-hidden="true"></i>${esc(st.label)}</span></p>
        <dl>
          <div><dt>Data source</dt><dd>${esc(x.source)}</dd></div>
          <div><dt>The big number</dt><dd>${esc(x.reading)}</dd></div>
          <div><dt>Band words</dt><dd>${esc(c.bands)}</dd></div>
        </dl>
        ${x.note ? `<p class="sea-note">${esc(x.note)}</p>` : ""}
        <p class="sea-open"><a class="btn btn-ghost btn-sm" href="${esc(href)}">Open in HazeNow</a></p>
      </div>`;
  };

  countriesEl.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    if (!t) return;
    ci = Number(t.dataset.i);
    ti = 0;
    renderCountry();
  });
  citiesEl.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    if (!t) return;
    ti = Number(t.dataset.i);
    renderCity();
  });
  tabKeys(countriesEl, (i) => {
    ci = i;
    ti = 0;
    renderCountry();
  });
  tabKeys(citiesEl, (i) => {
    ti = i;
    renderCity();
  });
  renderCountry();
}
