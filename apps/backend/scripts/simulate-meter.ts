/**
 * Writes the three grid fixtures to disk. All the generation logic lives in @minga/shared so the
 * backend, the serverless route handlers and the tests share one implementation.
 *
 *   fixtures/grid-baseline-week.json   five ordinary weekday evenings -> the baseline profile
 *   fixtures/grid-event-delivered.json the event evening, site shed load, commitment MET
 *   fixtures/grid-event-shortfall.json the same event, site barely reduced, commitment MISSED
 *
 * The shortfall file exists so the demo can show the agent REFUSING to settle.
 *
 * Run: npm run simulate:meter --workspace=@minga/backend
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixtures, BASELINE_DAYS, SITE_NAME } from "@minga/shared";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

function write(name: string, value: unknown) {
  mkdirSync(FIXTURES, { recursive: true });
  const path = resolve(FIXTURES, name);
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
  return path;
}

const f = await buildFixtures();
const files = [
  write("grid-baseline-week.json", f.baseline),
  write("grid-event-delivered.json", f.delivered),
  write("grid-event-shortfall.json", f.shortfall),
];
const sum = (b: typeof f.delivered) => b.readings.reduce((t, r) => t + r.reading.wh, 0);
console.log(`device            ${f.device}`);
console.log(`site              ${SITE_NAME} (${f.siteId})`);
console.log(`event window      ${new Date(f.windowStart * 1000).toISOString()} -> ${new Date(f.windowEnd * 1000).toISOString()} (18:00-21:00 COT)`);
console.log(`baseline readings ${f.baseline.readings.length} over ${BASELINE_DAYS} days`);
console.log(`delivered window  ${f.delivered.readings.length} readings, ${sum(f.delivered)} Wh`);
console.log(`shortfall window  ${f.shortfall.readings.length} readings, ${sum(f.shortfall)} Wh`);
for (const p of files) console.log(`wrote ${p}`);
