#!/usr/bin/env node
/**
 * Build HazeNow.scriptable: the file Scriptable imports in one tap (open it on the iPhone → "Open in Scriptable").
 * It's the JSON document Scriptable itself writes when you share a script as a file:
 *   { always_run_in_app, icon: { color, glyph }, name, script, share_sheet_inputs }
 * The icon comes from HazeNow.js's own "// icon-color: …; icon-glyph: …;" header.
 *
 *   node integrations/scriptable/make-scriptable.mjs [out]   (default: ./HazeNow.scriptable)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function makeScriptable(script = readFileSync(resolve(here, "HazeNow.js"), "utf8")) {
  const m = /^\/\/ icon-color: ([a-z-]+); icon-glyph: ([a-z0-9-]+);$/m.exec(script.split("\n").slice(0, 5).join("\n"));
  if (!m) throw new Error("HazeNow.js needs the Scriptable header: // icon-color: …; icon-glyph: …;");
  return {
    always_run_in_app: false,
    icon: { color: m[1], glyph: m[2] },
    name: "HazeNow",
    script,
    share_sheet_inputs: [],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? "HazeNow.scriptable");
  writeFileSync(out, JSON.stringify(makeScriptable(), null, 2) + "\n");
  console.log(`wrote ${out}`);
}
