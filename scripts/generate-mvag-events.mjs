#!/usr/bin/env node
/*
 * MVAG (Mars in Aries · Venus in Gemini) Events Generator
 * -------------------------------------------------------
 * Stand‑alone Node script that builds a static JSON file of windows where
 *   Mars ∈ Aries  AND  Venus ∈ Gemini
 * using:
 *   • IAU J2000 constellation bounds (GeoJSON polygons; lon = RA°, lat = Dec°)
 *   • JPL Horizons JSON API (geocentric observer, astrometric RA/Dec, ICRF/J2000)
 *
 * No website required. Run this once, commit the JSON, ship it.
 *
 * Requires: Node 18+ (global fetch). No external deps.
 *
 * USAGE (examples)
 * ----------------
 * # 1) Quick sanity (short span)
 * node generate-mvag-events.js \
 *   --bounds ./public/data/constellations.bounds.geojson \
 *   --out ./public/data/mvag_events_1990_2030.json \
 *   --start 1990-01-01T00:00:00Z --stop 2030-01-01T00:00:00Z
 *
 * # 2) Full 1600 → 2500
 * node generate-mvag-events.js \
 *   --bounds ./public/data/constellations.bounds.geojson \
 *   --out ./public/data/mvag_events_1600_2500.json \
 *   --start 1600-01-01T00:00:00Z --stop 2500-01-01T00:00:00Z
 *
 * Tuning flags (optional)
 * -----------------------
 *   --chunkYears 5          # years per Horizons batch (coarse scan)
 *   --stepHours 6           # coarse cadence in hours
 *   --edgeHours 1           # edge refinement step in hours
 *   --sleepMs 350           # throttle between Horizons calls
 *
 * Output format (mvag-v1)
 * -----------------------
 * {
 *   "version": "mvag-v1",
 *   "source": {
 *     "boundaries_url": "<your bounds file path or URL>",
 *     "ephemeris": "JPL Horizons (geocenter 500@399, RA/Dec, J2000)",
 *     "step_hours": 6,
 *     "edge_precision_hours": 1,
 *     "computed_utc": "2025-11-05T10:00:00Z",
 *     "range": { "start_utc": "1600-01-01T00:00:00Z", "end_utc": "2500-01-01T00:00:00Z" }
 *   },
 *   "events": [ { "start_utc": ISO, "end_utc": ISO }, ... ]
 * }
 */

// ---------------- Config from CLI ----------------
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur) => {
  if (cur.startsWith("--")) { acc.push([cur.slice(2), true]); } else if (acc.length && acc[acc.length-1][1] === true) { acc[acc.length-1][1] = cur; } return acc; }, []));

const BOUNDS_PATH = String(args.bounds || "./public/data/constellations.bounds.geojson");
const OUT_PATH    = String(args.out    || "./public/data/mvag_events_1600_2500.json");
const START_ISO   = String(args.start  || "1600-01-01T00:00:00Z");
const STOP_ISO    = String(args.stop   || "2500-01-01T00:00:00Z");
const CHUNK_YEARS = Number(args.chunkYears ?? 5);
const STEP_HOURS  = Number(args.stepHours  ?? 6);
const EDGE_HOURS  = Number(args.edgeHours  ?? 1);
const SLEEP_MS    = Number(args.sleepMs    ?? 350);

// ---------------- Imports ----------------
import fs from "node:fs";
import path from "node:path";

// ---------------- Helpers ----------------
const sleep = (ms)=> new Promise(res=>setTimeout(res, ms));
const toISO = (d)=> new Date(d).toISOString();
const fromISO = (s)=> new Date(s);

/** Normalize longitudes to [0,360) */
const normLon = (lon)=> lon < 0 ? lon + 360 : lon % 360;

/** Point in polygon (ray casting). rings[0]=outer, rings[1..]=holes */
function pointInRings(lon, lat, rings) {
  const inRing = (ring)=>{
    let inside = false;
    for (let i=0, j=ring.length-1; i<ring.length; j=i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersect = (yi>lat) !== (yj>lat) && lon < ( (xj-xi)*(lat-yi) ) / ((yj-yi)||1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };
  if (!rings.length) return false;
  if (!inRing(rings[0])) return false;           // outside outer
  for (let k=1; k<rings.length; k++) {           // in any hole ⇒ exclude
    if (inRing(rings[k])) return false;
  }
  return true;
}

/** Classify RA/Dec to constellation name using FeatureCollection */
function makeClassifier(fc) {
  // Normalize longitudes and precompute simple bboxes
  const feats = fc.features.map(f=>{
    const g = f.geometry;
    const name = f.properties?.name;
    if (g.type === "Polygon") {
      const rings = g.coordinates.map(r=> r.map(([x,y])=>[normLon(x), y]));
      const xs = rings.flat().map(p=>p[0]); const ys = rings.flat().map(p=>p[1]);
      const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      return { name, polys: [rings], bbox };
    } else {
      const polys = g.coordinates.map(poly => poly.map(r=> r.map(([x,y])=>[normLon(x), y])));
      const allPts = polys.flat(2);
      const xs = allPts.map(p=>p[0]); const ys = allPts.map(p=>p[1]);
      const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      return { name, polys, bbox };
    }
  });
  return function classify(ra_deg, dec_deg) {
    let lon = normLon(ra_deg); const lat = dec_deg;
    for (const f of feats) {
      const [minX,minY,maxX,maxY] = f.bbox;
      if (lon<minX || lon>maxX || lat<minY || lat>maxY) continue;
      for (const rings of f.polys) { if (pointInRings(lon, lat, rings)) return f.name || null; }
    }
    return null;
  };
}

// ---------------- Horizons fetch ----------------
const HORIZONS_BASE = "https://ssd.jpl.nasa.gov/api/horizons.api";

async function fetchHorizonsSeries(command, startIso, stopIso, stepHours) {
  const params = new URLSearchParams({
    format: "json",
    COMMAND: `'${command}'`,            // 499=Mars, 299=Venus
    EPHEM_TYPE: "OBSERVER",
    CENTER: `'500@399'`,                // geocenter
    START_TIME: `'${startIso}'`,
    STOP_TIME: `'${stopIso}'`,
    STEP_SIZE: `'${stepHours} h'`,
    QUANTITIES: `'1'`,                  // astrometric RA/Dec
    ANG_FORMAT: `'DEG'`,                // RA/DEC in decimal degrees
    MAKE_EPHEM: "YES",
    OBJ_DATA: "NO",
    TIME_DIGITS: "MINUTES",
  });
  const url = `${HORIZONS_BASE}?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Horizons HTTP ${r.status}`);
  const j = await r.json();
  const txt = String(j.result || "");
  const block = txt.split("$$SOE")[1]?.split("$$EOE")[0] || "";
  const lines = block.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    let tIso = null, ra = null, dec = null;
    if (line.includes(",")) {
      const parts = line.split(",").map(s=>s.trim());
      if (parts.length >= 3) {
        // e.g. "1994-Jun-03 00:00" → ISO
        const d0 = parts[0].replace(/^A\.D\.\s*/i, "").replace(/\s+/, "T") + "Z";
        const d = new Date(d0);
        if (!isNaN(d.valueOf())) tIso = d.toISOString();
        ra = parseFloat(parts[1]);
        dec = parseFloat(parts[2]);
      }
    } else {
      // fixed-width fallback: extract first date, last two floats
      const floats = line.match(/[-+]?\d+\.\d+(?:[eE][-+]?\d+)?/g);
      if (floats && floats.length >= 2) {
        dec = parseFloat(floats.pop());
        ra  = parseFloat(floats.pop());
      }
      const datePart = line.slice(0, 21).trim();
      const d = Date.parse(datePart.replace(/\s+/, "T") + "Z");
      if (!isNaN(d)) tIso = new Date(d).toISOString();
    }
    if (tIso && Number.isFinite(ra) && Number.isFinite(dec)) out.push({ t: tIso, ra_deg: ra, dec_deg: dec });
  }
  return out;
}

// ---------------- Window detection ----------------
function findWindows(mars, venus, classify, stepHours) {
  const map = new Map();
  for (const s of mars) map.set(s.t, { m: s });
  for (const s of venus) { const e = map.get(s.t) || {}; e.v = s; map.set(s.t, e); }
  const ts = [...map.keys()].sort();
  const good = [];
  for (const t of ts) {
    const row = map.get(t);
    if (!row?.m || !row?.v) continue;
    const mC = classify(row.m.ra_deg, row.m.dec_deg);
    const vC = classify(row.v.ra_deg, row.v.dec_deg);
    if (mC === "Aries" && vC === "Gemini") good.push(t);
  }
  // group contiguous by stepHours
  const windows = [];
  let start = null, prev = null;
  for (const t of good) {
    const cur = fromISO(t);
    if (!start) { start = cur; prev = cur; continue; }
    const dh = (cur - prev) / (3600*1000);
    if (Math.abs(dh - stepHours) <= 1e-9 || dh < stepHours + 1e-9) { // tolerant
      prev = cur; continue;
    } else {
      windows.push({ startUtc: start, endUtc: prev });
      start = cur; prev = cur;
    }
  }
  if (start && prev) windows.push({ startUtc: start, endUtc: prev });
  return windows;
}

async function refineWindow(win, classify, stepHours) {
  // Expand start backward in 1h steps until classification flips false
  const step = stepHours; // 1h
  let s = new Date(win.startUtc), e = new Date(win.endUtc);
  // Backward
  {
    const a = new Date(s.getTime() - 48*3600*1000); // 2 days margin
    const b = new Date(s.getTime() + 48*3600*1000);
    const [mars, venus] = await Promise.all([
      fetchHorizonsSeries(499, toISO(a), toISO(b), step),
      fetchHorizonsSeries(299, toISO(a), toISO(b), step),
    ]);
    const times = new Set(mars.map(x=>x.t));
    const mByT = new Map(mars.map(x=>[x.t,x]));
    const vByT = new Map(venus.map(x=>[x.t,x]));
    // walk backward from s to earlier
    for (let tMs = s.getTime(); tMs >= a.getTime(); tMs -= step*3600*1000) {
      const iso = new Date(tMs).toISOString();
      if (!times.has(iso)) continue;
      const m = mByT.get(iso), v = vByT.get(iso);
      const ok = m && v && classify(m.ra_deg, m.dec_deg) === "Aries" && classify(v.ra_deg, v.dec_deg) === "Gemini";
      if (!ok) { s = new Date(tMs + step*3600*1000); break; }
      if (tMs === a.getTime()) s = new Date(tMs); // edge case: reaches margin
    }
  }
  // Forward
  {
    const a = new Date(e.getTime() - 48*3600*1000);
    const b = new Date(e.getTime() + 48*3600*1000);
    const [mars, venus] = await Promise.all([
      fetchHorizonsSeries(499, toISO(a), toISO(b), step),
      fetchHorizonsSeries(299, toISO(a), toISO(b), step),
    ]);
    const times = new Set(mars.map(x=>x.t));
    const mByT = new Map(mars.map(x=>[x.t,x]));
    const vByT = new Map(venus.map(x=>[x.t,x]));
    for (let tMs = e.getTime(); tMs <= b.getTime(); tMs += step*3600*1000) {
      const iso = new Date(tMs).toISOString();
      if (!times.has(iso)) continue;
      const m = mByT.get(iso), v = vByT.get(iso);
      const ok = m && v && classify(m.ra_deg, m.dec_deg) === "Aries" && classify(v.ra_deg, v.dec_deg) === "Gemini";
      if (!ok) { e = new Date(tMs - step*3600*1000); break; }
      if (tMs === b.getTime()) e = new Date(tMs); // edge case
    }
  }
  return { startUtc: s, endUtc: e };
}

function mergeAcrossChunks(acc, next, stepHours) {
  const out = acc.slice();
  for (const w of next) {
    const last = out[out.length-1];
    if (last) {
      const dh = (w.startUtc - last.endUtc) / (3600*1000);
      if (Math.abs(dh - stepHours) <= 1e-9 || dh <= stepHours + 1e-9) {
        if (w.endUtc > last.endUtc) last.endUtc = w.endUtc; // extend
        continue;
      }
    }
    out.push({ startUtc: w.startUtc, endUtc: w.endUtc });
  }
  return out;
}

async function main() {
  console.log("MVAG generator starting…");
  // Load bounds
  const raw = JSON.parse(fs.readFileSync(path.resolve(BOUNDS_PATH), "utf8"));
  const classify = makeClassifier(raw);

  const startYear = fromISO(START_ISO).getUTCFullYear();
  const stopYear  = fromISO(STOP_ISO).getUTCFullYear();

  let allWindows = [];
  let chunkIdx = 0;
  const totalChunks = Math.ceil((stopYear - startYear)/CHUNK_YEARS);

  for (let y = startYear; y < stopYear; y += CHUNK_YEARS) {
    const s = new Date(Date.UTC(y, 0, 1));
    const e = new Date(Date.UTC(Math.min(y + CHUNK_YEARS, stopYear), 0, 1));
    console.log(`[scan] ${y} → ${Math.min(y+CHUNK_YEARS, stopYear)} …`);
    const [mars, venus] = await Promise.all([
      fetchHorizonsSeries(499, toISO(s), toISO(e), STEP_HOURS),
      fetchHorizonsSeries(299, toISO(s), toISO(e), STEP_HOURS),
    ]);
    const wins = findWindows(mars, venus, classify, STEP_HOURS);
    allWindows = mergeAcrossChunks(allWindows, wins, STEP_HOURS);
    chunkIdx++; console.log(`  windows so far: ${allWindows.length} (${chunkIdx}/${totalChunks})`);
    await sleep(SLEEP_MS);
  }

  // Refine edges
  console.log(`[refine] Refining ${allWindows.length} windows to ${EDGE_HOURS} h precision…`);
  const refined = [];
  for (let i=0; i<allWindows.length; i++) {
    const r = await refineWindow(allWindows[i], classify, EDGE_HOURS);
    refined.push(r);
    if ((i+1)%5===0 || i===allWindows.length-1) console.log(`  ${i+1}/${allWindows.length}`);
    await sleep(Math.min(2*SLEEP_MS, 800));
  }

  // Emit JSON
  const payload = {
    version: "mvag-v1",
    source: {
      boundaries_url: BOUNDS_PATH,
      ephemeris: "JPL Horizons (geocenter 500@399, RA/Dec, J2000)",
      step_hours: STEP_HOURS,
      edge_precision_hours: EDGE_HOURS,
      computed_utc: new Date().toISOString(),
      range: { start_utc: START_ISO, end_utc: STOP_ISO },
    },
    events: refined.map(w=>({ start_utc: toISO(w.startUtc), end_utc: toISO(w.endUtc) }))
  };

  fs.writeFileSync(path.resolve(OUT_PATH), JSON.stringify(payload, null, 2));
  console.log(`\n✓ Wrote ${refined.length} events → ${OUT_PATH}`);
}

main().catch(err=>{ console.error("\nERROR:", err?.message || err); process.exit(1); });
