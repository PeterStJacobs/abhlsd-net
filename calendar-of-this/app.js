/* AFdS V2 – tidy baseline
   Sunday = 0 everywhere.
   East/West naming everywhere.
   Single day truth: getDaySnapshot(dateISO)
   Single range truth: getAllDayOccurrencesForRange(startISO,endISO)
*/
const { DateTime, Interval } = luxon;

// -----------------------------
// Constants & configuration
// -----------------------------
const TZKEY_MAP = {
  ET_Toronto: 'America/Toronto',
  AZ_Phoenix: 'America/Phoenix',
  QLD_Brisbane: 'Australia/Brisbane',
  ASTRONOMICAL_UTC: 'UTC',
};

const DEFAULTS = {
  tzEast: 'America/Phoenix',
  tzWest: 'Australia/Brisbane',
};

const DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT']; // Sunday-first

const PATHS = {
  supermonthsConfig: './data/supermonths_config.json',
  supermonthsRanges: './data/supermonths_ranges_fallback.json',
  specialDaysCsv: './data/AFdS_Special_Days.csv',
};

// Barrel Day anchor (Gregorian)
const BARREL_DAY_ISO = '1994-01-19'; // Seoian 01/01/0001

// -----------------------------
// State
// -----------------------------
const state = {
  view: 'month',
  displayTZ: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  focusDateISO: DateTime.now().toISODate(), // interpreted in displayTZ
  filters: { superMonths: true, specialDays: true, standardDays: true },

  tzEast: DEFAULTS.tzEast,
  tzWest: DEFAULTS.tzWest,

  snapshot: null,
  highlightDateISO: null,

  data: {
    config: null,
    ranges: null,
    rangesBySeoYear: new Map(),     // syYear -> [range...]
    rangeByYearMonth: new Map(),    // `${syYear}-${monthNo}` -> range
    monthNoByName: new Map(),
    nameByMonthNo: new Map(),

    syByKey: new Map(),             // `${syMonth}-${syDay}` -> [defs...]
    gyDefs: [],                     // defs with Anchor_Type starting "GY_"
  },
};

// -----------------------------
// DOM helpers
// -----------------------------
function el(id){ return document.getElementById(id); }
function clamp(n,a,b){ return Math.max(a, Math.min(b,n)); }
function pad2(n){ return String(n).padStart(2,'0'); }
function pad4(n){ return String(n).padStart(4,'0'); }

// -----------------------------
// CSV + boolean parsing
// -----------------------------
function toBool(v){
  const s = String(v ?? '').trim().toLowerCase();
  if(['true','t','1','yes','y'].includes(s)) return true;
  if(['false','f','0','no','n'].includes(s)) return false;
  return false;
}
function toBoolDefault(v, def){
  const s = String(v ?? '').trim();
  if(s === '') return def;
  return toBool(s);
}

function parseCSV(text){
  // simple CSV parser with quoted fields
  const rows = [];
  let i=0, field='', row=[], inQ=false;
  const pushField = ()=>{ row.push(field); field=''; };
  const pushRow = ()=>{ rows.push(row); row=[]; };

  while(i < text.length){
    const ch = text[i];

    if(inQ){
      if(ch === '"'){
        if(text[i+1] === '"'){ field += '"'; i+=2; continue; }
        inQ = false; i++; continue;
      }else{
        field += ch; i++; continue;
      }
    }else{
      if(ch === '"'){ inQ=true; i++; continue; }
      if(ch === ','){ pushField(); i++; continue; }
      if(ch === '\r'){ i++; continue; }
      if(ch === '\n'){ pushField(); pushRow(); i++; continue; }
      field += ch; i++; continue;
    }
  }
  pushField();
  if(row.length > 1 || row[0] !== '') pushRow();

  const headers = rows[0].map(h => String(h||'').trim());
  const out = [];
  for(let r=1;r<rows.length;r++){
    const obj = {};
    for(let c=0;c<headers.length;c++){
      obj[headers[c]] = rows[r][c] ?? '';
    }
    out.push(obj);
  }
  return out;
}

// -----------------------------
// Timezone list
// -----------------------------
function getIanaTimezones(){
  try{
    if(typeof Intl.supportedValuesOf === 'function'){
      return Intl.supportedValuesOf('timeZone');
    }
  }catch(e){}
  // fallback minimal list
  return [
    'UTC',
    'America/Phoenix',
    'America/Toronto',
    'Australia/Brisbane',
    'Australia/Adelaide',
    'America/New_York',
    'Europe/London',
  ];
}

function populateTZSelect(selectEl, defaultTZ){
  const zones = getIanaTimezones();
  selectEl.innerHTML = '';
  for(const z of zones){
    const opt = document.createElement('option');
    opt.value = z;
    opt.textContent = z;
    selectEl.appendChild(opt);
  }
  selectEl.value = defaultTZ;
}

// Ensure tzEast is actually east of tzWest at “now”
// (east = larger UTC offset typically)
function ensureEastWestOrder(){
  const now = DateTime.now();
  const offE = now.setZone(state.tzEast).offset;
  const offW = now.setZone(state.tzWest).offset;
  if(offE < offW){
    // swap
    const tmp = state.tzEast;
    state.tzEast = state.tzWest;
    state.tzWest = tmp;
    el('tzEast').value = state.tzEast;
    el('tzWest').value = state.tzWest;
  }
}

// -----------------------------
// SuperDay maths
// -----------------------------
function superDayBounds(dateISO, tzEast, tzWest){
  // same calendar date in each TZ
  const start = DateTime.fromISO(dateISO, {zone: tzEast}).startOf('day');
  const end = DateTime.fromISO(dateISO, {zone: tzWest}).endOf('day');
  const durMs = end.toMillis() - start.toMillis();
  return { tzEast, tzWest, start, end, durMs };
}

function ceilMinutesTo30(mins){
  return Math.ceil(mins / 30) * 30;
}

function durationToHHMMCeil30(ms){
  const minutes = ceilMinutesTo30(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function msToHHMM(ms){
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function superDayFactsForDate(dateISO, tzEast, tzWest){
  const b = superDayBounds(dateISO, tzEast, tzWest);
  return {
    east: b.tzEast,
    west: b.tzWest,
    start: b.start.toFormat('ccc dd LLL yyyy HH:mm'),
    end: b.end.toFormat('ccc dd LLL yyyy HH:mm'),
    length: durationToHHMMCeil30(b.durMs),
    startDT: b.start,
    endDT: b.end,
    durMs: b.durMs,
  };
}

// Find the “label dateISO” such that now falls within that SuperDay
function currentSuperDayLabelISO(nowDT){
  const base = nowDT.setZone(state.displayTZ).toISODate();
  const b0 = superDayBounds(base, state.tzEast, state.tzWest);
  const t = nowDT.toMillis();
  if(t < b0.start.toMillis()){
    return DateTime.fromISO(base, {zone: state.displayTZ}).minus({days:1}).toISODate();
  }
  if(t > b0.end.toMillis()){
    return DateTime.fromISO(base, {zone: state.displayTZ}).plus({days:1}).toISODate();
  }
  return base;
}

// -----------------------------
// Seoian date engine
// -----------------------------
function jan19ForYear(gy){
  return DateTime.fromObject({year: gy, month: 1, day: 19}, {zone: state.displayTZ}).toISODate();
}

function seoianYearForGregorian(dateISO){
  const dt = DateTime.fromISO(dateISO, {zone: state.displayTZ});
  // No dates before Barrel Day
  if(dt.toISODate() < BARREL_DAY_ISO) return null;

  const gy = dt.year;
  const cut = DateTime.fromObject({year: gy, month: 1, day: 19}, {zone: state.displayTZ});
  const sy = (dt >= cut) ? (gy - 1993) : (gy - 1994);
  if(sy < 1) return null;
  return sy;
}

function rangeForDateISO(dateISO){
  // Find which SuperMonth range “contains” this date (canonical membership).
  // It’s possible multiple SuperMonths overlap, but canonicalSeoianDate uses the one
  // in the Seoian year that contains the date and has the latest start <= date.
  const sy = seoianYearForGregorian(dateISO);
  if(!sy) return null;

  const candidates = [];
  for(const y of [sy-1, sy, sy+1]){
    const arr = state.data.rangesBySeoYear.get(y) || [];
    for(const r of arr){
      if(r.start <= dateISO && dateISO <= r.end) candidates.push(r);
    }
  }
  if(candidates.length === 0) return null;
  candidates.sort((a,b)=>{
    if(a.start !== b.start) return a.start.localeCompare(b.start);
    return (a.monthNo ?? 0) - (b.monthNo ?? 0);
  });
  // pick the one with latest start
  return candidates[candidates.length - 1];
}

function canonicalSeoianDate(dateISO){
  const r = rangeForDateISO(dateISO);
  if(!r) return { year:null, monthNo:null, day:null, label:'—' };

  const dt = DateTime.fromISO(dateISO, {zone: state.displayTZ});
  const start = DateTime.fromISO(r.start, {zone: state.displayTZ});
  const day = Math.round(dt.diff(start, 'days').days) + 1;
  const label = `${pad2(day)}/${pad2(r.monthNo)}/${pad4(r.seoianYear)}`;
  return {
    year: r.seoianYear,
    monthNo: r.monthNo,
    monthName: r.monthName,
    day,
    label,
    range: r,
  };
}

function gregorianISOForSeoian(syYear, monthNo, day){
  const key = `${syYear}-${monthNo}`;
  const r = state.data.rangeByYearMonth.get(key);
  if(!r) return null;
  const dt = DateTime.fromISO(r.start, {zone: state.displayTZ}).plus({days: day-1});
  const iso = dt.toISODate();
  if(iso < r.start || iso > r.end) return null;
  return iso;
}

function fmtGreg(dateISO){
  return DateTime.fromISO(dateISO, {zone: state.displayTZ}).toFormat('ccc dd LLL yyyy');
}

function startOfWeekSunday(dateISO){
  const dt = DateTime.fromISO(dateISO, {zone: state.displayTZ}).startOf('day');
  // Luxon weekday: Mon=1 ... Sun=7
  const idxSun0 = dt.weekday % 7; // Sun -> 0, Mon -> 1, ... Sat -> 6
  return dt.minus({days: idxSun0}).toISODate();
}

function endOfWeekSunday(dateISO){
  const ws = DateTime.fromISO(startOfWeekSunday(dateISO), {zone: state.displayTZ});
  return ws.plus({days:6}).toISODate();
}

// Active SuperMonths for a date (can be >1 due to overlap rule)
function activeSuperMonths(dateISO){
  const sy = seoianYearForGregorian(dateISO);
  const out = [];
  for(const y of [sy-1, sy, sy+1]){
    const arr = state.data.rangesBySeoYear.get(y) || [];
    for(const r of arr){
      if(r.start <= dateISO && dateISO <= r.end) out.push(r);
    }
  }
  // unique by year+monthNo
  const seen = new Set();
  const uniq = [];
  for(const r of out){
    const k = `${r.seoianYear}-${r.monthNo}`;
    if(seen.has(k)) continue;
    seen.add(k);
    uniq.push(r);
  }
  uniq.sort((a,b)=> (a.monthNo-b.monthNo) || (a.start.localeCompare(b.start)) );
  return uniq;
}

// -----------------------------
// Gregorian rule engine (Standard Days etc.)
// Weekday in CSV: 0=Sun..6=Sat
// Luxon weekday: 1=Mon..7=Sun
// -----------------------------
function weekdayToLuxon(w){
  if(w === null || w === undefined || w === '') return null;
  const n = Number(w);
  if(!Number.isFinite(n)) return null;
  if(n === 0) return 7;
  return n; // 1..6
}

function easterSundayMonthDay(year){
  // Meeus/Jones/Butcher algorithm for Gregorian Easter Sunday
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function occurrenceISOForGregorianRule(def, year){
  const startY = def.gregorianStartYear || 1;
  if(year < startY) return null;

  const t = String(def.anchorType || '').toUpperCase();
  const gyMonth = Number(def.gyMonth);
  const gyDay = Number(def.gyDay);
  const nth = Number(def.nth);
  const wLux = weekdayToLuxon(def.weekday);
  const offset = Number(def.offsetDays || 0);

  if(t === 'GY_FIXED'){
    if(!gyMonth || !gyDay) return null;
    return DateTime.fromObject({year, month: gyMonth, day: gyDay}, {zone: 'UTC'}).toISODate();
  }

  if(t === 'GY_NTH_DOW'){
    if(!gyMonth || !nth || !wLux) return null;
    // nth weekday of month
    const first = DateTime.fromObject({year, month: gyMonth, day: 1}, {zone:'UTC'});
    const shift = (wLux - first.weekday + 7) % 7;
    const d = 1 + shift + 7*(nth-1);
    const dt = DateTime.fromObject({year, month: gyMonth, day: d}, {zone:'UTC'});
    // guard for overflow into next month
    if(dt.month !== gyMonth) return null;
    return dt.toISODate();
  }

  if(t === 'GY_LAST_DOW'){
    if(!gyMonth || !wLux) return null;
    const last = DateTime.fromObject({year, month: gyMonth, day: 1}, {zone:'UTC'}).endOf('month');
    const back = (last.weekday - wLux + 7) % 7;
    return last.minus({days: back}).toISODate();
  }

  if(t === 'GY_LAST_DOW_BEFORE_DATE'){
    if(!gyMonth || !gyDay || !wLux) return null;
    // start from day-1 and walk back to weekday
    const start = DateTime.fromObject({year, month: gyMonth, day: gyDay}, {zone:'UTC'}).minus({days:1});
    const back = (start.weekday - wLux + 7) % 7;
    return start.minus({days: back}).toISODate();
  }

  if(t === 'GY_EASTER'){
    const es = easterSundayMonthDay(year);
    const base = DateTime.fromObject({year, month: es.month, day: es.day}, {zone:'UTC'});
    return base.plus({days: offset}).toISODate();
  }

  return null;
}

// -----------------------------
// Event defs loading & indexing
// -----------------------------
function normalizeDef(row){
  // Handle common header variants + historical typo
  const get = (...keys)=>{
    for(const k of keys){
      if(Object.prototype.hasOwnProperty.call(row, k)) return row[k];
    }
    return '';
  };

  const id = String(get('ID','id')).trim();
  const title = String(get('Title','title')).trim();
  const notes = String(get('Notes','notes')).trim();

  const anchorType = String(get('Anchor_Type','anchor_type','AnchorType')).trim() || 'SY';
  const categoryRaw = String(get('Category','category')).trim();
  const category = categoryRaw ? categoryRaw.toLowerCase() : (anchorType.toUpperCase().startsWith('GY_') ? 'standard' : 'special');

  const syMonth = Number(get('SY_Month','sy_month','syMonth')) || null;
  const syDay = Number(get('SY_Day','sy_day','syDay')) || null;
  const syStartYear = Number(get('SY_Start_Year','sy_year_start','syYearStart')) || null;

  const gregStart = Number(
    get('Gregorian_Start_Year','Gregorian_First_Year','Gergorian_First_Year','Gergorian_Start_Year')
  ) || null;

  const gyMonth = Number(get('GY_Month','gy_month','GYMonth')) || null;
  const gyDay = Number(get('GY_Day','gy_day','GYDay')) || null;
  const nth = Number(get('Nth','nth')) || null;
  const weekday = (get('Weekday','weekday') === '' ? null : Number(get('Weekday','weekday')));
  const offsetDays = (get('Offset_Days','offset_days','OffsetDays') === '' ? null : Number(get('Offset_Days','offset_days','OffsetDays')));

  const rank = Number(get('Rank','rank')) || null;
  const sequence = Number(get('Sequence','sequence','Seq','seq')) || null;

  const showOnCalendar = toBoolDefault(get('ShowOnCalendar','showOnCalendar'), true);
  const showInInspector = toBoolDefault(get('ShowInInspector','showInInspector'), true);
  const showNotesOnCalendar = toBoolDefault(get('ShowNotesOnCalendar','showNotesOnCalendar'), false);

  const allDay = toBoolDefault(get('All_Day','all_day','AllDay'), true);

  return {
    id, title, notes,
    anchorType,
    category,
    syMonth, syDay, syStartYear,
    gregorianStartYear: gregStart,
    gyMonth, gyDay, nth, weekday, offsetDays,
    rank: rank ?? (category === 'special' ? 1 : 2),
    sequence: sequence ?? 9999,
    showOnCalendar, showInInspector, showNotesOnCalendar,
    allDay,
  };
}

function enabledForCategory(category){
  const c = String(category||'').toLowerCase();
  if(c === 'special') return state.filters.specialDays;
  if(c === 'standard') return state.filters.standardDays;
  // default: treat as special-ish unless filtered off
  return true;
}

function syEventDefsForDate(dateISO){
  const seo = canonicalSeoianDate(dateISO);
  if(!seo.monthNo || !seo.day) return [];
  const key = `${seo.monthNo}-${seo.day}`;
  const defs = state.data.syByKey.get(key) || [];
  return defs.filter(d =>
    enabledForCategory(d.category) &&
    (seo.year >= (d.syStartYear || 1))
  );
}

function gregorianDefsForDate(dateISO){
  const dt = DateTime.fromISO(dateISO, {zone: state.displayTZ});
  const year = dt.year;
  const out = [];
  for(const def of state.data.gyDefs){
    if(!enabledForCategory(def.category)) continue;
    const occ = occurrenceISOForGregorianRule(def, year);
    if(occ === dateISO) out.push(def);
  }
  return out;
}

// -----------------------------
// Day snapshot (single truth)
// -----------------------------
function getDaySnapshot(dateISO){
  const seo = canonicalSeoianDate(dateISO);
  const showG = el('toggleGregorian')?.checked;

  const periods = state.filters.superMonths
    ? activeSuperMonths(dateISO).sort((a,b)=>a.monthNo-b.monthNo).map(p=>p.monthName)
    : [];

  const syDefs = state.filters.specialDays ? syEventDefsForDate(dateISO) : [];
  const specialDays = syDefs.filter(d => String(d.category).toLowerCase() === 'special' && d.showInInspector);

  const standardDays = state.filters.standardDays
    ? gregorianDefsForDate(dateISO).filter(d => String(d.category).toLowerCase() === 'standard' && d.showInInspector)
    : [];

  const facts = superDayFactsForDate(dateISO, state.tzEast, state.tzWest);

  return {
    dateISO,
    seoianLabel: seo.label,
    gregorianLabel: fmtGreg(dateISO),
    showGregorian: !!showG,
    periods,
    specialDays,
    standardDays,
    facts,
    tzAtSnapshot: { tzEast: state.tzEast, tzWest: state.tzWest },
  };
}

function snapshotDay(dateISO){
  state.snapshot = getDaySnapshot(dateISO);
  state.highlightDateISO = dateISO;
  renderInspector();
  render();
}

// -----------------------------
// All-day occurrences over a range (single truth)
// -----------------------------
function kindPriority(kind){
  if(kind === 'supermonth') return 0;
  if(kind === 'special') return 1;
  if(kind === 'standard') return 2;
  return 9;
}

function getAllDayOccurrencesForRange(rangeStartISO, rangeEndISO){
  const events = [];
  const startDT = DateTime.fromISO(rangeStartISO, {zone: state.displayTZ}).startOf('day');
  const endDT = DateTime.fromISO(rangeEndISO, {zone: state.displayTZ}).startOf('day');

  // SuperMonths (Priority 0)
  if(state.filters.superMonths){
    const syA = seoianYearForGregorian(rangeStartISO);
    const syB = seoianYearForGregorian(rangeEndISO);
    const years = new Set([syA, syB, syA-1, syB+1].filter(Boolean));
    for(const y of years){
      const arr = state.data.rangesBySeoYear.get(y) || [];
      for(const r of arr){
        if(r.end < rangeStartISO || r.start > rangeEndISO) continue;
        events.push({
          id: `SM_${r.seoianYear}_${pad2(r.monthNo)}`,
          label: r.monthName,
          notes: r.extendedName || '',
          start: r.start,
          end: r.end,
          kind: 'supermonth',
          rank: 0,
          sequence: r.monthNo,
          showNotesOnCalendar: false,
        });
      }
    }
  }

  // SY anchored (Special Days)
  const days = Math.round(endDT.diff(startDT, 'days').days);
  for(let i=0;i<=days;i++){
    const dateISO = startDT.plus({days:i}).toISODate();
    const seo = canonicalSeoianDate(dateISO);

    const defs = syEventDefsForDate(dateISO);
    for(const def of defs){
      if(!def.showOnCalendar) continue;
      if(String(def.category).toLowerCase() !== 'special') continue;

      events.push({
        id: `${def.id}_${pad4(seo.year)}`,
        label: def.title,
        notes: def.notes || '',
        start: dateISO,
        end: dateISO,
        kind: 'special',
        rank: def.rank ?? 1,
        sequence: def.sequence ?? 9999,
        showNotesOnCalendar: def.showNotesOnCalendar,
      });
    }
  }

  // Gregorian rules (Standard Days)
  const startY = startDT.year;
  const endY = endDT.year;
  for(let y=startY; y<=endY; y++){
    for(const def of state.data.gyDefs){
      if(!def.showOnCalendar) continue;
      if(String(def.category).toLowerCase() !== 'standard') continue;
      if(!enabledForCategory(def.category)) continue;

      const occ = occurrenceISOForGregorianRule(def, y);
      if(!occ) continue;
      if(occ < rangeStartISO || occ > rangeEndISO) continue;

      events.push({
        id: `${def.id}_${pad4(y)}`,
        label: def.title,
        notes: def.notes || '',
        start: occ,
        end: occ,
        kind: 'standard',
        rank: def.rank ?? 2,
        sequence: def.sequence ?? 9999,
        showNotesOnCalendar: def.showNotesOnCalendar,
      });
    }
  }

  // Sort: kind priority, then sequence, then start, then label
  events.sort((a,b)=>
    kindPriority(a.kind) - kindPriority(b.kind) ||
    (a.sequence ?? 9999) - (b.sequence ?? 9999) ||
    a.start.localeCompare(b.start) ||
    a.label.localeCompare(b.label)
  );

  return events;
}

// -----------------------------
// Lane placement for all-day bars within a week span
// Convention: colStart/colEnd are 0..6 inclusive
// -----------------------------
function gridColumnForDaySpan(colStart0, colEnd0, hasGutter){
  const gutter = hasGutter ? 1 : 0;
  const startLine = colStart0 + 1 + gutter;
  const endLine = colEnd0 + 2 + gutter;
  return `${startLine} / ${endLine}`;
}

function placeEventsInWeek(events, weekStartISO, weekEndISO, maxLanes){
  const placed = [];
  const hiddenByDay = new Map();

  const lanes = Array.from({length:maxLanes}, ()=> Array(7).fill(false));
  const ws = DateTime.fromISO(weekStartISO, {zone: state.displayTZ}).startOf('day');

  function dayIndex(dateISO){
    const dt = DateTime.fromISO(dateISO, {zone: state.displayTZ}).startOf('day');
    return Math.round(dt.diff(ws,'days').days);
  }

  for(const ev of events){
    const segStart = ev.start < weekStartISO ? weekStartISO : ev.start;
    const segEnd = ev.end > weekEndISO ? weekEndISO : ev.end;

    const cStart = clamp(dayIndex(segStart), 0, 6);
    const cEnd = clamp(dayIndex(segEnd), 0, 6);

    let lane = -1;
    for(let l=0; l<maxLanes; l++){
      let ok = true;
      for(let c=cStart; c<=cEnd; c++){
        if(lanes[l][c]){ ok=false; break; }
      }
      if(ok){ lane=l; break; }
    }

    if(lane >= 0){
      for(let c=cStart; c<=cEnd; c++) lanes[lane][c] = true;
      placed.push({ ...ev, lane, colStart: cStart, colEnd: cEnd });
    }else{
      for(let c=cStart; c<=cEnd; c++){
        const dISO = ws.plus({days:c}).toISODate();
        hiddenByDay.set(dISO, (hiddenByDay.get(dISO)||0) + 1);
      }
    }
  }

  return { placed, hiddenByDay };
}

// -----------------------------
// Rendering: Inspector
// -----------------------------
function renderInspector(){
  const snap = state.snapshot;
  const showG = el('toggleGregorian').checked;
  el('inspectorGregorian').hidden = !showG;

  if(!snap){
    el('inspectorSeoian').textContent = '—';
    el('inspectorGregorian').textContent = '—';
    el('inspectorPeriods').innerHTML = '<div class="muted">Hover/tap a day.</div>';
    el('inspectorFacts').innerHTML = '<div class="muted">Hover/tap a day.</div>';
    return;
  }

  el('inspectorSeoian').textContent = snap.seoianLabel;
  el('inspectorGregorian').textContent = snap.gregorianLabel;

  const p = el('inspectorPeriods');
  p.innerHTML = '';

  const specials = snap.specialDays || [];
  const standards = snap.standardDays || [];
  let any = false;

  // Priority 0: SuperMonths always first
  if(snap.periods && snap.periods.length){
    any = true;
    for(const item of snap.periods){
      const div = document.createElement('div');
      div.className = 'pill';
      div.textContent = item;
      p.appendChild(div);
    }
  }

  // Special Days next
  if(specials.length){
    any = true;
    for(const s of specials){
      const div = document.createElement('div');
      div.className = 'eventitem';
      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = s.title;
      div.appendChild(t);
      if(s.notes){
        const n = document.createElement('div');
        n.className = 'note';
        n.textContent = s.notes;
        div.appendChild(n);
      }
      p.appendChild(div);
    }
  }

  // Standard Days last
  if(standards.length){
    any = true;
    for(const s of standards){
      const div = document.createElement('div');
      div.className = 'eventitem';
      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = s.title;
      div.appendChild(t);
      if(s.notes){
        const n = document.createElement('div');
        n.className = 'note';
        n.textContent = s.notes;
        div.appendChild(n);
      }
      p.appendChild(div);
    }
  }

  if(!any) p.innerHTML = '<div class="muted">(no periods/events)</div>';

  const f = el('inspectorFacts');
  f.innerHTML = '';
  const rows = [
    ['Eastern TZ', snap.facts.east],
    ['Western TZ', snap.facts.west],
    ['Start', snap.facts.start],
    ['End', snap.facts.end],
    ['Length', snap.facts.length],
    ['Snapshot TZs', `${snap.tzAtSnapshot.tzEast} / ${snap.tzAtSnapshot.tzWest}`],
  ];

  for(const [k,v] of rows){
    const r = document.createElement('div');
    r.className = 'factrow';
    const a = document.createElement('span');
    a.textContent = k;
    const b = document.createElement('span');
    b.textContent = v;
    r.appendChild(a);
    r.appendChild(b);
    f.appendChild(r);
  }
}

// -----------------------------
// Rendering: Modal for "+ more"
// -----------------------------
function openMoreModal(title, items){
  el('moreModalTitle').textContent = title;
  const body = el('moreModalBody');
  body.innerHTML = '';
  for(const it of items){
    const div = document.createElement('div');
    div.className = 'eventitem';
    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = it.label;
    div.appendChild(t);
    if(it.notes){
      const n = document.createElement('div');
      n.className = 'note';
      n.textContent = it.notes;
      div.appendChild(n);
    }
    body.appendChild(div);
  }
  el('moreModal').hidden = false;
}
function closeMoreModal(){
  el('moreModal').hidden = true;
}

// -----------------------------
// Rendering: Calendar (Month / Week / List)
// -----------------------------
function render(){
  const body = el('calendarBody');
  body.innerHTML = '';
  if(state.view === 'month') renderMonthView(body);
  if(state.view === 'week') renderWeekView(body);
  if(state.view === 'list') renderListView(body);
}

function setCalendarTitle(text){
  el('calendarTitle').textContent = text;
}

function renderMonthView(container){
  const focusSeo = canonicalSeoianDate(state.focusDateISO);
  const r = focusSeo.range;
  if(!r){
    setCalendarTitle('—');
    container.innerHTML = '<div class="muted">No Seoian date for this range.</div>';
    return;
  }

  setCalendarTitle(`${r.monthName}, ${pad4(r.seoianYear)}`);

  // Build grid bounds: start Sunday of week containing r.start, end Saturday of week containing r.end
  const startWS = startOfWeekSunday(r.start);
  const endWE = endOfWeekSunday(r.end);

  const monthWrap = document.createElement('div');
  monthWrap.className = 'month';

  // DOW header
  const dow = document.createElement('div');
  dow.className = 'dow';
  for(const d of DOW){
    const dv = document.createElement('div');
    dv.textContent = d;
    dow.appendChild(dv);
  }
  monthWrap.appendChild(dow);

  // Render weeks
  let ws = DateTime.fromISO(startWS, {zone: state.displayTZ});
  const end = DateTime.fromISO(endWE, {zone: state.displayTZ});

  while(ws <= end){
    const weekStartISO = ws.toISODate();
    const weekEndISO = ws.plus({days:6}).toISODate();

    const weekRow = document.createElement('div');
    weekRow.className = 'weekrow';

    // all-day bars for this week segment
    const weekBars = document.createElement('div');
    weekBars.className = 'month-bars';

    const all = getAllDayOccurrencesForRange(weekStartISO, weekEndISO);
    const { placed, hiddenByDay } = placeEventsInWeek(all, weekStartISO, weekEndISO, 3);

    for(const p of placed){
      const bar = document.createElement('div');
      bar.className = `bar kind-${p.kind}`;
      bar.textContent = p.label;
      bar.style.gridColumn = gridColumnForDaySpan(p.colStart, p.colEnd, false);
      bar.style.gridRow = `${p.lane + 1}`;
      weekBars.appendChild(bar);
    }

    weekRow.appendChild(weekBars);

    // day cells
    const grid = document.createElement('div');
    grid.className = 'month-grid';

    for(let i=0;i<7;i++){
      const dateISO = ws.plus({days:i}).toISODate();
      const seo = canonicalSeoianDate(dateISO);

      const day = document.createElement('div');
      day.className = 'day';
      if(dateISO < r.start || dateISO > r.end) day.classList.add('is-out');
      if(state.highlightDateISO === dateISO) day.classList.add('is-highlight');

      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = seo.label;
      day.appendChild(label);

      if(el('toggleGregorian').checked){
        const sub = document.createElement('div');
        sub.className = 'sub';
        sub.textContent = DateTime.fromISO(dateISO, {zone: state.displayTZ}).toFormat('dd LLL yyyy');
        day.appendChild(sub);
      }

      // +more
      const moreN = hiddenByDay.get(dateISO) || 0;
      if(moreN > 0){
        const more = document.createElement('div');
        more.className = 'more';
        more.textContent = `+${moreN} more`;
        more.addEventListener('click', (e)=>{
          e.stopPropagation();
          const items = getAllDayOccurrencesForRange(dateISO, dateISO);
          openMoreModal(`${seo.label}${el('toggleGregorian').checked ? ' | '+fmtGreg(dateISO) : ''}`, items);
        });
        day.appendChild(more);
      }

      day.addEventListener('mouseenter', ()=> snapshotDay(dateISO));
      day.addEventListener('click', ()=> snapshotDay(dateISO));

      grid.appendChild(day);
    }

    weekRow.appendChild(grid);
    monthWrap.appendChild(weekRow);

    ws = ws.plus({days:7});
  }

  container.appendChild(monthWrap);
}

function renderWeekView(container){
  const weekStartISO = startOfWeekSunday(state.focusDateISO);
  const weekEndISO = DateTime.fromISO(weekStartISO, {zone: state.displayTZ}).plus({days:6}).toISODate();

  const seo = canonicalSeoianDate(weekStartISO);
  setCalendarTitle(`${seo.monthName || '—'}, ${pad4(seo.year || 0)} (Week)`);

  const wrap = document.createElement('div');
  wrap.className = 'week';

  // DOW header row
  const dow = document.createElement('div');
  dow.className = 'week-dow';

  const spacer = document.createElement('div');
  spacer.className = 'week-dow-spacer';
  dow.appendChild(spacer);

  const ws = DateTime.fromISO(weekStartISO, {zone: state.displayTZ});
  for(let i=0;i<7;i++){
    const dateISO = ws.plus({days:i}).toISODate();
    const s = canonicalSeoianDate(dateISO);

    const cell = document.createElement('div');
    cell.className = 'week-dow-cell';

    const main = document.createElement('div');
    main.className = 'week-dow-main';
    main.textContent = DOW[i];
    cell.appendChild(main);

    const sub = document.createElement('div');
    sub.className = 'week-dow-sub';
    sub.textContent = s.label + (el('toggleGregorian').checked ? ` | ${DateTime.fromISO(dateISO,{zone:state.displayTZ}).toFormat('dd LLL')}` : '');
    cell.appendChild(sub);

    dow.appendChild(cell);
  }
  wrap.appendChild(dow);

  // all-day bars for the week
  const bars = document.createElement('div');
  bars.className = 'week-bars';

  // spacer cell for gutter
  const barSpacer = document.createElement('div');
  barSpacer.className = 'week-dow-spacer';
  bars.appendChild(barSpacer);

  const all = getAllDayOccurrencesForRange(weekStartISO, weekEndISO);
  const { placed } = placeEventsInWeek(all, weekStartISO, weekEndISO, 3);

  for(const p of placed){
    const bar = document.createElement('div');
    bar.className = `bar kind-${p.kind}`;
    bar.textContent = p.label;
    bar.style.gridColumn = gridColumnForDaySpan(p.colStart, p.colEnd, true);
    bar.style.gridRow = `${p.lane + 1}`;
    bars.appendChild(bar);
  }

  wrap.appendChild(bars);

  // time grid (24 rows)
  const grid = document.createElement('div');
  grid.className = 'week-grid';

  // compute SuperDay length labels for this week (use weekStart date as baseline)
  const facts = superDayFactsForDate(weekStartISO, state.tzEast, state.tzWest);
  const totalMin = ceilMinutesTo30(facts.durMs / 60000);
  const totalHours = totalMin / 60;
  const extraHoursFloat = Math.max(0, totalHours - 24);
  const extraHoursInt = Math.floor(extraHoursFloat); // we show integer markers

  for(let h=0; h<24; h++){
    const timeCell = document.createElement('div');
    timeCell.className = 'timecell';
    timeCell.textContent = `${pad2(h)}:00`;

    if(h < extraHoursInt){
      const sec = document.createElement('div');
      sec.className = 'sec';
      sec.textContent = `${pad2(24+h)}:00`;
      timeCell.appendChild(sec);
    }

    grid.appendChild(timeCell);

    for(let d=0; d<7; d++){
      const slot = document.createElement('div');
      slot.className = 'slot';
      grid.appendChild(slot);
    }
  }

  wrap.appendChild(grid);
  container.appendChild(wrap);
}

function renderListView(container){
  const focusSeo = canonicalSeoianDate(state.focusDateISO);
  const title = `${focusSeo.monthName || '—'}, ${pad4(focusSeo.year || 0)} (List)`;
  setCalendarTitle(title);

  // show 28 days starting at focusDateISO (start of week Sunday for stability)
  const startISO = startOfWeekSunday(state.focusDateISO);
  const start = DateTime.fromISO(startISO, {zone: state.displayTZ});
  const list = document.createElement('div');
  list.className = 'list';

  for(let i=0;i<28;i++){
    const dateISO = start.plus({days:i}).toISODate();
    const snap = getDaySnapshot(dateISO);

    const card = document.createElement('div');
    card.className = 'list-day';

    const head = document.createElement('div');
    head.className = 'head';

    const left = document.createElement('div');
    const seo = document.createElement('div');
    seo.className = 'seo';
    seo.textContent = snap.seoianLabel;
    left.appendChild(seo);

    if(el('toggleGregorian').checked){
      const g = document.createElement('div');
      g.className = 'greg';
      g.textContent = snap.gregorianLabel;
      left.appendChild(g);
    }

    head.appendChild(left);
    card.appendChild(head);

    const items = document.createElement('div');
    items.className = 'items';

    // Priority 0: SuperMonths
    if(state.filters.superMonths && snap.periods.length){
      const sm = document.createElement('div');
      sm.className = 'pill';
      sm.textContent = snap.periods.join(' • ');
      items.appendChild(sm);
    }

    // Special then Standard
    for(const s of (snap.specialDays || [])){
      const div = document.createElement('div');
      div.className = 'eventitem';
      div.innerHTML = `<div class="title">${escapeHTML(s.title)}</div>` + (s.notes ? `<div class="note">${escapeHTML(s.notes)}</div>` : '');
      items.appendChild(div);
    }
    for(const s of (snap.standardDays || [])){
      const div = document.createElement('div');
      div.className = 'eventitem';
      div.innerHTML = `<div class="title">${escapeHTML(s.title)}</div>` + (s.notes ? `<div class="note">${escapeHTML(s.notes)}</div>` : '');
      items.appendChild(div);
    }

    if(items.children.length === 0){
      const m = document.createElement('div');
      m.className = 'muted';
      m.textContent = '(no events)';
      items.appendChild(m);
    }

    card.appendChild(items);

    card.addEventListener('mouseenter', ()=> snapshotDay(dateISO));
    card.addEventListener('click', ()=> snapshotDay(dateISO));

    list.appendChild(card);
  }

  container.appendChild(list);
}

function escapeHTML(s){
  return String(s||'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

// -----------------------------
// Clocks (SVG)
// -----------------------------
function makeClockSVG(hasNumbers, numbers){
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS,'svg');
  svg.setAttribute('viewBox','0 0 200 200');
  svg.classList.add('clocksvg');

  const face = document.createElementNS(svgNS,'circle');
  face.setAttribute('cx','100'); face.setAttribute('cy','100'); face.setAttribute('r','92');
  face.setAttribute('fill','#fff');
  face.setAttribute('stroke','rgba(0,0,0,0.08)');
  face.setAttribute('stroke-width','2');
  svg.appendChild(face);

  // tick marks (12 major)
  for(let i=0;i<12;i++){
    const a = (Math.PI*2) * (i/12) - Math.PI/2;
    const x1 = 100 + Math.cos(a)*78;
    const y1 = 100 + Math.sin(a)*78;
    const x2 = 100 + Math.cos(a)*86;
    const y2 = 100 + Math.sin(a)*86;
    const line = document.createElementNS(svgNS,'line');
    line.setAttribute('x1',x1); line.setAttribute('y1',y1);
    line.setAttribute('x2',x2); line.setAttribute('y2',y2);
    line.setAttribute('stroke','rgba(0,0,0,0.18)');
    line.setAttribute('stroke-width','3');
    svg.appendChild(line);
  }

  if(hasNumbers){
    const nums = numbers || [
      {text:'12', x:100, y:34},
      {text:'3', x:168, y:106},
      {text:'6', x:100, y:178},
      {text:'9', x:32, y:106},
    ];
    for(const n of nums){
      const t = document.createElementNS(svgNS,'text');
      t.setAttribute('x', String(n.x));
      t.setAttribute('y', String(n.y));
      t.setAttribute('text-anchor','middle');
      t.setAttribute('dominant-baseline','middle');
      t.setAttribute('font-size','16');
      t.setAttribute('font-family','ui-monospace, monospace');
      t.setAttribute('fill','rgba(0,0,0,0.55)');
      t.textContent = n.text;
      svg.appendChild(t);
    }
  }

  const hub = document.createElementNS(svgNS,'circle');
  hub.setAttribute('cx','100'); hub.setAttribute('cy','100'); hub.setAttribute('r','4');
  hub.setAttribute('fill','rgba(0,0,0,0.55)');

  // hands
  const hour = document.createElementNS(svgNS,'line');
  hour.setAttribute('x1','100'); hour.setAttribute('y1','100');
  hour.setAttribute('x2','100'); hour.setAttribute('y2','58');
  hour.setAttribute('stroke','rgba(0,0,0,0.70)');
  hour.setAttribute('stroke-width','6');
  hour.setAttribute('stroke-linecap','round');
  hour.setAttribute('id','h');

  const min = document.createElementNS(svgNS,'line');
  min.setAttribute('x1','100'); min.setAttribute('y1','100');
  min.setAttribute('x2','100'); min.setAttribute('y2','44');
  min.setAttribute('stroke','rgba(0,0,0,0.55)');
  min.setAttribute('stroke-width','4');
  min.setAttribute('stroke-linecap','round');
  min.setAttribute('id','m');

  const sec = document.createElementNS(svgNS,'line');
  sec.setAttribute('x1','100'); sec.setAttribute('y1','106');
  sec.setAttribute('x2','100'); sec.setAttribute('y2','32');
  sec.setAttribute('stroke','rgba(27,107,111,0.95)');
  sec.setAttribute('stroke-width','2');
  sec.setAttribute('stroke-linecap','round');
  sec.setAttribute('id','s');

  svg.appendChild(hour);
  svg.appendChild(min);
  svg.appendChild(sec);
  svg.appendChild(hub);

  return svg;
}

function setHandAngle(lineEl, deg){
  lineEl.setAttribute('transform', `rotate(${deg} 100 100)`);
}

function mountClocks(){
  el('clockEast').innerHTML = '';
  el('clockWest').innerHTML = '';
  el('clockSuperday').innerHTML = '';

  el('clockEast').appendChild(makeClockSVG(true));
  el('clockWest').appendChild(makeClockSVG(true));

  // SuperDay clock numerals at 1/4, 1/2, 3/4, full based on N hours (nearest integer)
  const now = DateTime.now();
  const labelISO = currentSuperDayLabelISO(now);
  const facts = superDayFactsForDate(labelISO, state.tzEast, state.tzWest);
  const totalMin = ceilMinutesTo30(facts.durMs / 60000);
  const totalH = totalMin / 60;

  const q1 = Math.round(totalH * 0.25);
  const q2 = Math.round(totalH * 0.50);
  const q3 = Math.round(totalH * 0.75);
  const q4 = Math.round(totalH * 1.00);

  const nums = [
    {text:String(q4), x:100, y:34},
    {text:String(q1), x:168, y:106},
    {text:String(q2), x:100, y:178},
    {text:String(q3), x:32, y:106},
  ];

  el('clockSuperday').appendChild(makeClockSVG(true, nums));
}

function tickClocks(){
  // East/West clocks show real time in those TZs.
  const now = DateTime.now();

  const east = now.setZone(state.tzEast);
  const west = now.setZone(state.tzWest);

  updateStandardClock(el('clockEast'), east);
  updateStandardClock(el('clockWest'), west);

  el('ampmEast').textContent = east.toFormat('a');
  el('ampmWest').textContent = west.toFormat('a');

  // SuperDay clock shows current position within current SuperDay (based on displayTZ label date)
  const labelISO = currentSuperDayLabelISO(now);
  const facts = superDayFactsForDate(labelISO, state.tzEast, state.tzWest);

  const totalMin = ceilMinutesTo30(facts.durMs / 60000);
  const totalMs = totalMin * 60000;

  const elapsedMs = clamp(now.toMillis() - facts.startDT.toMillis(), 0, totalMs);
  el('sdTotal').textContent = `${pad2(Math.floor(totalMin/60))}:${pad2(totalMin%60)}`;
  el('sdElapsed').textContent = msToHHMM(elapsedMs);

  updateSuperDayClock(el('clockSuperday'), elapsedMs, totalMs);
}

function updateStandardClock(container, dt){
  const svg = container.querySelector('svg');
  if(!svg) return;

  const h = dt.hour % 12;
  const m = dt.minute;
  const s = dt.second;

  const hourDeg = (h + m/60 + s/3600) * 30;     // 360/12
  const minDeg = (m + s/60) * 6;                // 360/60
  const secDeg = s * 6;

  setHandAngle(svg.querySelector('#h'), hourDeg);
  setHandAngle(svg.querySelector('#m'), minDeg);
  setHandAngle(svg.querySelector('#s'), secDeg);
}

function updateSuperDayClock(container, elapsedMs, totalMs){
  const svg = container.querySelector('svg');
  if(!svg) return;

  const frac = totalMs > 0 ? (elapsedMs / totalMs) : 0;
  const deg = frac * 360;

  // For SuperDay clock, we use hour hand as the “position hand”, and keep min/sec as subtle.
  setHandAngle(svg.querySelector('#h'), deg);
  setHandAngle(svg.querySelector('#m'), deg);
  setHandAngle(svg.querySelector('#s'), deg);
}

// -----------------------------
// Controls
// -----------------------------
function formatJumpValue(){
  const mode = el('jumpMode').value;
  if(mode === 'gregorian'){
    const dt = DateTime.fromISO(state.focusDateISO, {zone: state.displayTZ});
    return `${pad2(dt.day)}/${pad2(dt.month)}/${pad4(dt.year)}`;
  }
  const seo = canonicalSeoianDate(state.focusDateISO);
  if(!seo.year) return '';
  return seo.label;
}

function applyJumpInput(){
  const mode = el('jumpMode').value;
  const raw = (el('jumpInput').value || '').trim();
  if(raw.length !== 10) return;

  const [dd, mm, yyyy] = raw.split('/').map(x=>Number(x));
  if(!dd || !mm || !yyyy) return;

  if(mode === 'gregorian'){
    const dt = DateTime.fromObject({year: yyyy, month: mm, day: dd}, {zone: state.displayTZ});
    if(!dt.isValid) return;
    const iso = dt.toISODate();
    if(iso < BARREL_DAY_ISO) return;
    state.focusDateISO = iso;
    snapshotDay(iso);
    return;
  }

  // seoian
  const iso = gregorianISOForSeoian(yyyy, mm, dd);
  if(!iso) return;
  state.focusDateISO = iso;
  snapshotDay(iso);
}

function autoSlashJump(){
  let v = el('jumpInput').value.replaceAll(/[^\d]/g,'').slice(0,8);
  if(v.length >= 5) v = v.slice(0,2)+'/'+v.slice(2,4)+'/'+v.slice(4);
  else if(v.length >= 3) v = v.slice(0,2)+'/'+v.slice(2);
  el('jumpInput').value = v;
}

function bindControls(){
  el('viewSelect').addEventListener('change', ()=>{
    state.view = el('viewSelect').value;
    // reset jump to match current focus and avoid mismatch
    el('jumpInput').value = formatJumpValue();
    render();
  });

  el('btnToday').addEventListener('click', ()=>{
    const todayISO = DateTime.now().setZone(state.displayTZ).toISODate();
    state.focusDateISO = todayISO;
    el('jumpInput').value = formatJumpValue();
    snapshotDay(todayISO);
  });

  el('btnPrev').addEventListener('click', ()=>{
    if(state.view === 'month'){
      const seo = canonicalSeoianDate(state.focusDateISO);
      if(seo.range){
        const prevStart = DateTime.fromISO(seo.range.start, {zone: state.displayTZ}).minus({days:1}).toISODate();
        const prevSeo = canonicalSeoianDate(prevStart);
        if(prevSeo.range){
          state.focusDateISO = prevSeo.range.start;
          el('jumpInput').value = formatJumpValue();
          snapshotDay(state.focusDateISO);
        }
      }
      return;
    }

    if(state.view === 'week'){
      state.focusDateISO = DateTime.fromISO(state.focusDateISO, {zone: state.displayTZ}).minus({days:7}).toISODate();
      el('jumpInput').value = formatJumpValue();
      snapshotDay(state.focusDateISO);
      return;
    }

    // list
    state.focusDateISO = DateTime.fromISO(state.focusDateISO, {zone: state.displayTZ}).minus({days:28}).toISODate();
    el('jumpInput').value = formatJumpValue();
    snapshotDay(state.focusDateISO);
  });

  el('btnNext').addEventListener('click', ()=>{
    if(state.view === 'month'){
      const seo = canonicalSeoianDate(state.focusDateISO);
      if(seo.range){
        const nextStart = DateTime.fromISO(seo.range.end, {zone: state.displayTZ}).plus({days:1}).toISODate();
        const nextSeo = canonicalSeoianDate(nextStart);
        if(nextSeo.range){
          state.focusDateISO = nextSeo.range.start;
          el('jumpInput').value = formatJumpValue();
          snapshotDay(state.focusDateISO);
        }
      }
      return;
    }

    if(state.view === 'week'){
      state.focusDateISO = DateTime.fromISO(state.focusDateISO, {zone: state.displayTZ}).plus({days:7}).toISODate();
      el('jumpInput').value = formatJumpValue();
      snapshotDay(state.focusDateISO);
      return;
    }

    state.focusDateISO = DateTime.fromISO(state.focusDateISO, {zone: state.displayTZ}).plus({days:28}).toISODate();
    el('jumpInput').value = formatJumpValue();
    snapshotDay(state.focusDateISO);
  });

  el('jumpMode').addEventListener('change', ()=>{
    el('jumpInput').value = formatJumpValue();
  });

  el('jumpInput').addEventListener('input', autoSlashJump);
  el('jumpInput').addEventListener('keydown', (e)=>{
    if(e.key === 'Enter') applyJumpInput();
  });
  el('jumpInput').addEventListener('blur', applyJumpInput);

  el('toggleGregorian').addEventListener('change', ()=>{
    renderInspector();
    render();
  });

  el('filterSuperMonths').addEventListener('change', ()=>{
    state.filters.superMonths = el('filterSuperMonths').checked;
    snapshotDay(state.highlightDateISO || state.focusDateISO);
  });
  el('filterSpecialDays').addEventListener('change', ()=>{
    state.filters.specialDays = el('filterSpecialDays').checked;
    snapshotDay(state.highlightDateISO || state.focusDateISO);
  });
  el('filterStandardDays').addEventListener('change', ()=>{
    state.filters.standardDays = el('filterStandardDays').checked;
    snapshotDay(state.highlightDateISO || state.focusDateISO);
  });

  el('tzEast').addEventListener('change', ()=>{
    state.tzEast = el('tzEast').value;
    ensureEastWestOrder();
    mountClocks();
    tickClocks();
  });
  el('tzWest').addEventListener('change', ()=>{
    state.tzWest = el('tzWest').value;
    ensureEastWestOrder();
    mountClocks();
    tickClocks();
  });

  el('displayTZ').addEventListener('change', ()=>{
    state.displayTZ = el('displayTZ').value;
    // Re-snapshot current highlighted day in the new display TZ context
    const todayISO = DateTime.now().setZone(state.displayTZ).toISODate();
    // keep focus date but re-render in new TZ
    state.focusDateISO = state.focusDateISO || todayISO;
    el('jumpInput').value = formatJumpValue();
    snapshotDay(state.highlightDateISO || state.focusDateISO);
  });

  el('moreModalClose').addEventListener('click', closeMoreModal);
  el('moreModal').addEventListener('click', (e)=>{
    if(e.target === el('moreModal')) closeMoreModal();
  });
}

// -----------------------------
// Data loading
// -----------------------------
async function loadJSON(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}
async function loadText(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.text();
}

async function loadData(){
  state.data.config = await loadJSON(PATHS.supermonthsConfig);
  state.data.ranges = await loadJSON(PATHS.supermonthsRanges);

  // Index ranges
  state.data.rangesBySeoYear = new Map();
  state.data.rangeByYearMonth = new Map();
  state.data.monthNoByName = new Map();
  state.data.nameByMonthNo = new Map();

  for(const c of state.data.config){
    state.data.monthNoByName.set(String(c.monthName), Number(c.monthNo));
    state.data.nameByMonthNo.set(Number(c.monthNo), String(c.monthName));
  }

  for(const r of state.data.ranges){
    if(!state.data.rangesBySeoYear.has(r.seoianYear)){
      state.data.rangesBySeoYear.set(r.seoianYear, []);
    }
    state.data.rangesBySeoYear.get(r.seoianYear).push(r);
    state.data.rangeByYearMonth.set(`${r.seoianYear}-${r.monthNo}`, r);
  }

  for(const [y,arr] of state.data.rangesBySeoYear.entries()){
    arr.sort((a,b)=> a.monthNo - b.monthNo);
  }

  // CSV events
  const csv = await loadText(PATHS.specialDaysCsv);
  const rows = parseCSV(csv);
  const defs = rows
    .map(normalizeDef)
    .filter(d => d.id && d.title);

  // Build SY index + GY defs
  state.data.syByKey = new Map();
  state.data.gyDefs = [];

  for(const d of defs){
    const at = String(d.anchorType || '').toUpperCase();

    if(at === 'SY'){
      if(!d.syMonth || !d.syDay) continue;
      const key = `${d.syMonth}-${d.syDay}`;
      if(!state.data.syByKey.has(key)) state.data.syByKey.set(key, []);
      state.data.syByKey.get(key).push(d);
    }else if(at.startsWith('GY_')){
      state.data.gyDefs.push(d);
    }
  }

  // Sort each SY key by rank/sequence
  for(const [k,arr] of state.data.syByKey.entries()){
    arr.sort((a,b)=>
      (a.rank ?? 9) - (b.rank ?? 9) ||
      (a.sequence ?? 9999) - (b.sequence ?? 9999) ||
      a.title.localeCompare(b.title)
    );
  }

  // Sort GY defs by sequence
  state.data.gyDefs.sort((a,b)=>
    (a.rank ?? 9) - (b.rank ?? 9) ||
    (a.sequence ?? 9999) - (b.sequence ?? 9999) ||
    a.title.localeCompare(b.title)
  );
}

// -----------------------------
// Init
// -----------------------------
async function init(){
  // Populate TZ selectors (Display/East/West)
  populateTZSelect(el('displayTZ'), state.displayTZ);
  populateTZSelect(el('tzEast'), state.tzEast);
  populateTZSelect(el('tzWest'), state.tzWest);

  bindControls();
  await loadData();

  ensureEastWestOrder();
  mountClocks();

  // Initial: Today snapshot
  const todayISO = DateTime.now().setZone(state.displayTZ).toISODate();
  state.focusDateISO = todayISO;
  el('jumpInput').value = formatJumpValue();
  snapshotDay(todayISO);

  render();
  tickClocks();
  setInterval(tickClocks, 1000);
}

window.addEventListener('DOMContentLoaded', ()=>{
  init().catch(err=>{
    console.error(err);
    el('calendarBody').innerHTML = `<div class="muted">Startup error: ${escapeHTML(err.message || String(err))}</div>`;
  });
});
