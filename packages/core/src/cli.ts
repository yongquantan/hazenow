#!/usr/bin/env node
/** `npx hazenow`: Singapore haze right now, in your terminal. */
import { getSnapshot } from "./client.js";
import { bandInfo, TREND_ARROWS } from "./math.js";
import { backoffMs, formatSgtTime, nextPollDelayMs, placeLabel, signed } from "./format.js";
import type { Snapshot } from "./types.js";
import { trendWords, verdict } from "./experience.js";
import { findArea, searchAreas } from "./areas.js";

const VERSION = "0.1.0";

const HELP = `hazenow: Singapore haze right now. NEA's 1-hr PM2.5 and band, plus NEA's 24-hr PSI.

Usage: hazenow [options]

  --region <name>     north | south | east | west | central (default: central)
  --area <name>       a town or planning area, e.g. "Tampines", "Jurong East" (offline lookup)
  --lat <n> --lon <n> your location (inverse-distance weighted across regions)
  --json              print the full Snapshot as JSON
  --oneline           compact "● 105 ▲" for status bars
  --tmux              like --oneline, with tmux #[fg=…] colours
  --watch             keep running; refresh on the publication cadence
  --no-color          disable colours (also honours NO_COLOR)
  -h, --help          show this help
  -v, --version       show version

Both numbers are from NEA: the PSI averages 24 hours, PM2.5 shows the last hour.
Data: NEA via data.gov.sg`;

interface Args {
  region?: string;
  lat?: number;
  lon?: number;
  json: boolean;
  oneline: boolean;
  tmux: boolean;
  watch: boolean;
  color: boolean;
}

function fail(msg: string): never {
  process.stderr.write(`hazenow: ${msg}\nTry 'hazenow --help'.\n`);
  process.exit(2);
}

export function parseArgs(argv: string[]): Args {
  const env = process.env;
  const args: Args = {
    json: false,
    oneline: false,
    tmux: false,
    watch: false,
    color: env.FORCE_COLOR ? env.FORCE_COLOR !== "0" : !env.NO_COLOR && !!process.stdout.isTTY,
  };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let inline: string | undefined;
    const eq = a.indexOf("=");
    if (a.startsWith("--") && eq > 0) {
      inline = a.slice(eq + 1);
      a = a.slice(0, eq);
    }
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      return v;
    };
    const num = () => {
      const v = Number(value());
      if (!Number.isFinite(v)) fail(`${a} must be a number`);
      return v;
    };
    switch (a) {
      case "--region":
      case "-r":
        args.region = value().toLowerCase();
        break;
      case "--area": {
        const name = value();
        const a = findArea(name) ?? searchAreas(name, 1)[0] ?? null;
        if (!a) fail(`unknown area '${name}'`);
        args.lat = a.lat;
        args.lon = a.lon;
        break;
      }
      case "--lat":
        args.lat = num();
        break;
      case "--lon":
      case "--lng":
        args.lon = num();
        break;
      case "--json":
        args.json = true;
        break;
      case "--oneline":
        args.oneline = true;
        break;
      case "--tmux":
        args.tmux = true;
        args.oneline = true;
        break;
      case "--watch":
      case "-w":
        args.watch = true;
        break;
      case "--no-color":
        args.color = false;
        break;
      case "--color":
        args.color = true;
        break;
      case "-h":
      case "--help":
        process.stdout.write(HELP + "\n");
        process.exit(0);
      case "-v":
      case "--version":
        process.stdout.write(VERSION + "\n");
        process.exit(0);
      default:
        fail(`unknown option '${argv[i]}'`);
    }
  }
  if ((args.lat === undefined) !== (args.lon === undefined)) fail("--lat and --lon must be given together");
  if (args.region && !["north", "south", "east", "west", "central"].includes(args.region)) {
    fail(`unknown region '${args.region}' (north, south, east, west, central)`);
  }
  return args;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function paint(color: boolean) {
  const wrap = (open: string, close: string) => (s: string) => (color ? `\x1b[${open}m${s}\x1b[${close}m` : s);
  return {
    fg: (hex: string) => (s: string) => {
      const [r, g, b] = rgb(hex);
      return color ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m` : s;
    },
    bold: wrap("1", "22"),
    dim: wrap("2", "22"),
  };
}

export function render(s: Snapshot, args: Pick<Args, "oneline" | "tmux" | "color">): string {
  const info = bandInfo(s.band);
  const arrow = TREND_ARROWS[s.trend.direction];
  if (args.tmux) {
    return `#[fg=${info.color}]●#[default] ${s.pm25} ${arrow}${s.stale ? " ?" : ""}`;
  }
  const c = paint(args.color);
  const band = c.fg(info.color);
  if (args.oneline) {
    return `${band("●")} ${s.pm25} ${arrow}${s.stale ? c.dim(" stale") : ""}`;
  }
  const trendTxt = s.trend.direction === "steady" ? arrow : `${arrow}${signed(s.trend.delta)}`;
  const sep = c.dim(" · ");
  const line = [
    `${band("●")} ${c.dim("PM2.5")} ${c.bold(band(String(s.pm25)))} ${c.dim("µg/m³")} ${band(info.label)} ${trendTxt}`,
    `${c.dim("NEA 24-hr PSI")} ${s.officialPsi24h ?? "–"}`,
    placeLabel(s),
    `${c.dim("as of")} ${formatSgtTime(s.observedAt)}${s.stale ? c.fg("#E4572E")(" (old)") : ""}`,
  ].join(sep);
  const v = verdict(s.band, ["general"], s.trend, { stale: s.stale, observedAt: s.observedAt, history: s.history });
  return `${line}\n  ${v.headline}${v.secondLine ? ` ${v.secondLine}` : ""} ${c.dim(`${trendWords(s.history)}.`)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const query = { region: args.region, lat: args.lat, lon: args.lon };
  const once = async () => {
    const s = await getSnapshot(query);
    return s;
  };
  const print = (s: Snapshot) =>
    process.stdout.write((args.json ? JSON.stringify(s, null, args.watch ? 0 : 2) : render(s, args)) + "\n");

  if (!args.watch) {
    try {
      print(await once());
    } catch (e) {
      process.stderr.write(`hazenow: ${(e as Error).message}\n`);
      process.exit(1);
    }
    return;
  }

  let lastKey = "";
  let observedAt: string | null = null;
  let failures = 0;
  process.on("SIGINT", () => process.exit(0));
  for (;;) {
    let delay: number;
    try {
      const s = await once();
      failures = 0;
      observedAt = s.observedAt;
      const key = `${s.observedAt}|${s.pm25}|${s.officialPsi24h}|${s.stale}`;
      if (key !== lastKey) {
        lastKey = key;
        print(s);
      }
      delay = nextPollDelayMs(Date.now(), observedAt);
    } catch (e) {
      delay = backoffMs(failures++);
      process.stderr.write(`hazenow: ${(e as Error).message} (retrying in ${Math.round(delay / 1000)} s)\n`);
    }
    await sleep(delay);
  }
}

main();
