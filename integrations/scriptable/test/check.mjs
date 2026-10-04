#!/usr/bin/env node
// Offline checks for the Scriptable widget (no network, no phone):
//  1. HazeNow.scriptable matches the format Scriptable writes when it exports a script, exactly those keys and types.
//  2. The script inside is HazeNow.js byte for byte, and compiles as an async function body (how Scriptable runs it).
//  3. The embedded planning-area table matches packages/core/src/areas-data.ts.
// Usage: node integrations/scriptable/test/check.mjs [path/to/HazeNow.scriptable]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeScriptable } from "../make-scriptable.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(resolve(here, "../HazeNow.js"), "utf8");
const doc = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : JSON.parse(JSON.stringify(makeScriptable()));

// 1. Schema (as exported by Scriptable 1.7: see e.g. any "<name>.scriptable" file shared from the app).
const COLORS = ["red", "pink", "purple", "deep-purple", "deep-blue", "blue", "light-blue", "cyan", "teal", "green",
  "deep-green", "light-green", "yellow", "orange", "deep-orange", "brown", "deep-brown", "gray", "deep-gray"];
assert.deepEqual(Object.keys(doc).sort(), ["always_run_in_app", "icon", "name", "script", "share_sheet_inputs"]);
assert.equal(typeof doc.always_run_in_app, "boolean");
assert.deepEqual(Object.keys(doc.icon).sort(), ["color", "glyph"]);
assert.ok(COLORS.includes(doc.icon.color), `icon.color ${doc.icon.color}`);
assert.match(doc.icon.glyph, /^[a-z0-9-]+$/);
assert.equal(doc.name, "HazeNow");
assert.ok(Array.isArray(doc.share_sheet_inputs));
// 2. Payload
assert.equal(doc.script, js, "the .scriptable file is stale: rebuild it from HazeNow.js");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
new AsyncFunction(doc.script); // throws on a syntax error
// 3. Area table in sync with the core
const core = readFileSync(resolve(here, "../../../packages/core/src/areas-data.ts"), "utf8");
const areas = JSON.parse(core.slice(core.indexOf("= [") + 2, core.lastIndexOf("];") + 1));
const m = /^const AREAS = (\[.*\]);$/m.exec(js);
assert.ok(m, "AREAS table missing");
assert.deepEqual(JSON.parse(m[1]), areas.map((a) => [a.name, a.lat, a.lon, a.aliases.join("|")]), "AREAS drifted from packages/core");
console.log(`ok: ${process.argv[2] ?? "HazeNow.scriptable (in memory)"}: Scriptable export format, script ${doc.script.length} chars, ${areas.length} areas`);
