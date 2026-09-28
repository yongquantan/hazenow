// Builds data/sg-areas.json (SPEC v1.4 §6) from URA's Master Plan 2019 Planning Area Boundary (No Sea)
// on data.gov.sg (dataset d_4765db0e87b9c86336792efe8a1f7a66), fetched live.
//
// For each of the 55 planning areas: the area-weighted centroid of its largest polygon part
// (so island groups resolve to their main island, e.g. Southern Islands → Sentosa). If that
// centroid falls outside the polygon (concave shapes), we use the nearest interior grid point.
// Every point is validated: inside its own polygon and inside Singapore's bounding box.
//
// Run: node scripts/make-areas.mjs [path/to/local.geojson]
import { readFileSync, writeFileSync } from "node:fs";

const DATASET = "d_4765db0e87b9c86336792efe8a1f7a66";
const BBOX = { minLat: 1.15, maxLat: 1.48, minLon: 103.59, maxLon: 104.1 };

// Common estate / neighbourhood names → planning area. Conservative: only names that sit clearly
// inside the planning area (URA subzones or well-known estates).
const ALIASES = {
  "Ang Mo Kio": ["AMK", "Cheng San", "Teck Ghee", "Yio Chu Kang", "Sembawang Hills"],
  Bedok: ["Bedok North", "Bedok South", "Bedok Reservoir", "Chai Chee", "Kembangan", "Frankel", "Kaki Bukit", "Siglap"],
  Bishan: ["Bishan North", "Sin Ming", "Marymount"],
  "Boon Lay": ["Boon Lay Place", "Liu Fang"],
  "Bukit Batok": ["Bukit Gombak", "Hillview", "Guilin", "Brickworks"],
  "Bukit Merah": ["Redhill", "Tiong Bahru", "Telok Blangah", "HarbourFront", "Henderson", "Depot Road", "Alexandra", "Kampong Bahru", "Everton Park"],
  "Bukit Panjang": ["Senja", "Fajar", "Bangkit", "Segar", "Pending", "Petir", "Jelapang", "Saujana"],
  "Bukit Timah": ["Sixth Avenue", "King Albert Park", "Beauty World", "Toh Yi", "Hillcrest", "Coronation Road", "Swiss Club", "Farrer Court"],
  "Central Water Catchment": ["MacRitchie", "MacRitchie Reservoir", "Upper Peirce"],
  Changi: ["Changi Airport", "Changi Village", "Changi Point"],
  "Changi Bay": [],
  "Choa Chu Kang": ["CCK", "Chua Chu Kang", "Yew Tee", "Teck Whye", "Keat Hong", "Brickland"],
  Clementi: ["Clementi West", "Clementi Central", "West Coast", "Sunset Way", "Faber"],
  "Downtown Core": ["CBD", "Raffles Place", "City Hall", "Marina Centre", "Tanjong Pagar", "Cecil", "Bugis", "Bayfront", "Anson"],
  Geylang: ["Aljunied", "Geylang East", "Kampong Ubi", "MacPherson", "Eunos"],
  Hougang: ["Kovan", "Lorong Ah Soo", "Upper Paya Lebar", "Tai Seng", "Defu"],
  "Jurong East": ["Yuhua", "Toh Guan", "Teban Gardens", "Jurong Gateway", "Jurong Lake", "Penjuru"],
  "Jurong West": ["Hong Kah", "Taman Jurong", "Yunnan", "Wenya", "Gek Poh", "Jurong West Central"],
  Kallang: ["Kallang Bahru", "Bendemeer", "Lavender", "Boon Keng", "Geylang Bahru", "Jalan Besar", "Crawford", "Kallang Riverside"],
  "Lim Chu Kang": ["Sungei Gedong"],
  Mandai: ["Mandai Estate"],
  "Marina East": [],
  "Marina South": ["Gardens by the Bay", "Marina Barrage"],
  "Marine Parade": ["Katong", "Mountbatten", "East Coast", "East Coast Park", "Joo Chiat"],
  Museum: ["Dhoby Ghaut", "Fort Canning", "Bras Basah"],
  Newton: ["Newton Circus", "Cairnhill", "Goodwood Park"],
  "North-Eastern Islands": ["Pulau Ubin", "Pulau Tekong"],
  Novena: ["Balestier", "Moulmein", "Thomson", "Mount Pleasant"],
  Orchard: ["Orchard Road", "Somerset", "Boulevard"],
  Outram: ["Chinatown", "Pearl's Hill", "People's Park", "China Square"],
  "Pasir Ris": ["Loyang", "Elias", "Pasir Ris Park", "Pasir Ris West"],
  "Paya Lebar": ["Paya Lebar Airbase"],
  Pioneer: ["Pioneer Sector"],
  Punggol: ["Punggol Waterway", "Matilda", "Coney Island", "Punggol Field", "Northshore"],
  Queenstown: ["Commonwealth", "Dover", "Buona Vista", "one-north", "Tanglin Halt", "Kent Ridge", "NUS", "Mei Chin", "Ghim Moh", "Holland Village"],
  "River Valley": ["Great World", "Leonie Hill", "Oxley"],
  Rochor: ["Little India", "Kampong Glam", "Farrer Park", "Victoria Street", "Sungei Road"],
  Seletar: ["Seletar Aerospace", "Seletar Airport"],
  Sembawang: ["Canberra", "Sembawang Springs", "Admiralty Park"],
  Sengkang: ["Anchorvale", "Compassvale", "Rivervale", "Fernvale", "Sengkang West"],
  Serangoon: ["Serangoon Gardens", "Serangoon North", "Lorong Chuan", "Serangoon Central"],
  Simpang: [],
  "Singapore River": ["Clarke Quay", "Boat Quay", "Robertson Quay"],
  "Southern Islands": ["Sentosa", "St John's Island", "Kusu Island"],
  "Straits View": [],
  "Sungei Kadut": ["Kranji"],
  Tampines: ["Tampines East", "Tampines West", "Tampines North", "Simei"],
  Tanglin: ["Botanic Gardens", "Dempsey", "Nassim", "Tyersall", "Chatsworth", "Ridout"],
  Tengah: ["Tengah Garden", "Tengah Park"],
  "Toa Payoh": ["Braddell", "Potong Pasir", "Woodleigh", "Bidadari", "Boon Teck", "Caldecott"],
  Tuas: ["Tuas South", "Tuas View", "Tuas Link", "Joo Koon"],
  "Western Islands": ["Jurong Island", "Pulau Bukom"],
  "Western Water Catchment": ["Tengeh", "Poyan"],
  Woodlands: ["Admiralty", "Marsiling", "Woodlands North", "Woodlands South", "Causeway"],
  Yishun: ["Khatib", "Chong Pang", "Nee Soon", "Yishun East", "Yishun West"],
};

const title = (s) =>
  s
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, p, c) => p + c.toUpperCase());

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}
function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
  }
  a /= 2;
  return [cx / (6 * a), cy / (6 * a)];
}
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolygon = (pt, poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h));

function representativePoint(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const main = polys.map((p) => ({ p, a: Math.abs(ringArea(p[0])) })).sort((x, y) => y.a - x.a)[0].p;
  const c = ringCentroid(main[0]);
  if (inPolygon(c, main)) return { pt: c, adjusted: false, poly: main };
  // Nearest interior point on a fine grid.
  const xs = main[0].map((p) => p[0]), ys = main[0].map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let best = null, bestD = Infinity;
  const N = 120;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const p = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
      if (!inPolygon(p, main)) continue;
      const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
      if (d < bestD) (bestD = d), (best = p);
    }
  return { pt: best, adjusted: true, poly: main };
}

async function load() {
  if (process.argv[2]) return JSON.parse(readFileSync(process.argv[2], "utf8"));
  const poll = await (await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET}/poll-download`)).json();
  if (!poll?.data?.url) throw new Error(`poll-download failed: ${JSON.stringify(poll).slice(0, 200)}`);
  return await (await fetch(poll.data.url)).json();
}

const gj = await load();
const out = [];
for (const f of gj.features) {
  const name = title(f.properties.PLN_AREA_N);
  const { pt, adjusted, poly } = representativePoint(f.geometry);
  const lat = Math.round(pt[1] * 1e5) / 1e5;
  const lon = Math.round(pt[0] * 1e5) / 1e5;
  if (!inPolygon([lon, lat], poly)) throw new Error(`${name}: point not inside its polygon`);
  if (lat < BBOX.minLat || lat > BBOX.maxLat || lon < BBOX.minLon || lon > BBOX.maxLon) throw new Error(`${name}: outside Singapore bbox`);
  if (!(name in ALIASES)) throw new Error(`${name}: no alias entry (add one, even if empty)`);
  if (adjusted) console.log(`note: ${name} centroid was outside the polygon; used nearest interior point`);
  out.push({ name, aliases: ALIASES[name], lat, lon });
}
out.sort((a, b) => a.name.localeCompare(b.name));
if (out.length !== 55) throw new Error(`expected 55 planning areas, got ${out.length}`);
const extra = Object.keys(ALIASES).filter((n) => !out.some((a) => a.name === n));
if (extra.length) throw new Error(`alias keys without an area: ${extra}`);
const all = out.flatMap((a) => [a.name, ...a.aliases].map((n) => n.toLowerCase()));
const dup = all.filter((n, i) => all.indexOf(n) !== i);
if (dup.length) throw new Error(`duplicate names/aliases: ${dup}`);
writeFileSync(new URL("../data/sg-areas.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
// Same data as a TS module so the core package can bundle it without JSON import attributes.
writeFileSync(
  new URL("../src/areas-data.ts", import.meta.url),
  `// GENERATED by scripts/make-areas.mjs from data/sg-areas.json. Do not edit.\n` +
    `// Source: URA Master Plan 2019 Planning Area Boundary (No Sea), data.gov.sg ${DATASET}.\n` +
    `import type { Area } from "./areas.js";\n\nexport const SG_AREAS: readonly Area[] = ${JSON.stringify(out)};\n`,
);
console.log(`wrote ${out.length} areas, ${all.length - out.length} aliases`);
