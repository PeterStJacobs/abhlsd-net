const { DateTime } = luxon;

const TZKEY_MAP = {
  ET_Toronto: 'America/Toronto',
  AZ_Phoenix: 'America/Phoenix',
  QLD_Brisbane: 'Australia/Brisbane',
  ASTRONOMICAL_UTC: 'UTC',
};

const DEFAULTS = {
  tamaraTZ: 'America/Phoenix',
  martinTZ: 'Australia/Brisbane',
};

const DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

// Luxon startOf('week') follows locale (often Monday). AFdS UI is SUN→SAT.
function startOfWeekSunday(dt){
  // Luxon weekday: 1=Mon ... 7=Sun
  return dt.startOf('day').minus({days: dt.weekday % 7});
}
function endOfWeekSaturday(dt){
  return startOfWeekSunday(dt).plus({days: 6}).endOf('day');
}

const state = {
  view: 'month',
  displayTZ: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  focusDateISO: DateTime.now().toISODate(),
  filters: { superMonths: true, specialDays: true, standardDays: true, oneOff: true },
  tamaraTZ: DEFAULTS.tamaraTZ,
  martinTZ: DEFAULTS.martinTZ,
  snapshot: null,
  highlightDateISO: null,
  data: {
    config: null,
    ranges: null,
    rangesBySeoYear: null,
    monthNoByName: null,
    nameByMonthNo: null,
    syByKey: null,
    gyDefs: null,
    oneOffDefs: null,
    silentSounds: null,
    overflowSounds: null,
    overflowSlotOrder: null,
    setDaySongs: null,
  }
};

// ---------- Utilities ----------
function parseCSV(text){
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for(let i=0;i<text.length;i++){
    const ch = text[i];
    const next = text[i+1];

    if(inQuotes){
      if(ch === '"' && next === '"'){ cur += '"'; i++; continue; }
      if(ch === '"'){ inQuotes = false; continue; }
      cur += ch;
      continue;
    }

    if(ch === '"'){ inQuotes = true; continue; }
    if(ch === ','){ row.push(cur); cur=''; continue; }

    if(ch === '\r'){
      if(next === '\n') i++;
      row.push(cur); cur='';
      if(row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      continue;
    }

    if(ch === '\n'){
      row.push(cur); cur='';
      if(row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  if(row.length > 1 || row[0] !== '') rows.push(row);
  if(rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim());
  if(headers.length && headers[0].startsWith('\ufeff')){
    headers[0] = headers[0].replace(/^\ufeff/, '');
  }

  const out = [];
  for(let r=1;r<rows.length;r++){
    if(rows[r].every(v => String(v).trim() === '')) continue;
    const obj = {};
    for(let c=0;c<headers.length;c++){
      obj[headers[c]] = (rows[r][c] ?? '').trim();
    }
    out.push(obj);
  }

  return out;
}

async function fetchTextFirstAvailable(paths){
  for(const path of paths){
    try{
      const res = await fetch(path, { cache: 'no-store' });
      if(res.ok) return await res.text();
    }catch(e){}
  }
  return '';
}

function pickField(row, candidates){
  for(const key of candidates){
    const v = row?.[key];
    if(v !== undefined && v !== null && String(v).trim() !== ''){
      return String(v).trim();
    }
  }
  return '';
}

function toBool(v){
  if(typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return (s === 'true' || s === '1' || s === 'yes' || s === 'y');
}

function toBoolDefault(v, def){
  const s = String(v ?? '').trim();
  if(s === '') return def;
  return toBool(s);
}

function categoryKey(c){ return (c ?? '').toString().trim().toLowerCase(); }
function isSpecialCategory(c){ return categoryKey(c).startsWith('special'); }
function isStandardCategory(c){ return categoryKey(c).startsWith('standard'); }

function toInt(v, def=null){
  const n = parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) ? n : def;
}

function parseMonthDayFlexible(s){
  const dt = parseDateTimeFlexible(s, 'UTC');
  if(!dt || !dt.isValid) return { month:null, day:null };
  return { month: dt.month, day: dt.day };
}

function parseDateTimeFlexible(s, zone){
  const str = String(s ?? '').trim();
  if(!str) return null;

  let dt = null;

  if(str.includes('T')){
    dt = DateTime.fromISO(str, {zone});
    if(dt.isValid) return dt;
  }

  dt = DateTime.fromFormat(str, 'yyyy-MM-dd HH:mm:ss', {zone});
  if(dt.isValid) return dt;

  dt = DateTime.fromFormat(str, 'yyyy-MM-dd HH:mm', {zone});
  if(dt.isValid) return dt;

  dt = DateTime.fromISO(str, {zone});
  if(dt.isValid) return dt;

  return null;
}

function fmtTimeHHMM(dt){ return dt.toFormat('HH:mm'); }
function pad2(n){ return String(n).padStart(2,'0'); }

function fmtGreg(dateISO){
  const [y,m,d] = dateISO.split('-').map(Number);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

function seoianYearForGregorian(dateISO){
  const [y,m,d] = dateISO.split('-').map(Number);
  if(m > 1 || (m === 1 && d >= 19)) return y - 1993;
  return y - 1994;
}

function seoianLabelWithOverlaps(dateISO){
  const sy = seoianYearForGregorian(dateISO);
  const act = activeSuperMonths(dateISO);
  if(!act || act.length === 0) return '—';

  const dUTC = DateTime.fromISO(dateISO, {zone:'UTC'}).startOf('day');
  const labels = act.map(r => {
    const startUTC = DateTime.fromISO(r.start, {zone:'UTC'}).startOf('day');
    const day = dUTC.diff(startUTC, 'days').days + 1;
    const dayInt = Math.floor(day + 1e-9);
    return {
      start: r.start,
      label: `${pad2(dayInt)}/${pad2(r.monthNo)}/${String(sy).padStart(4,'0')}`
    };
  });

  labels.sort((a,b)=> a.start.localeCompare(b.start));
  const canonical = labels[labels.length - 1];
  const overlaps = labels.slice(0, -1).map(x => x.label);

  return overlaps.length ? `${canonical.label} | ${overlaps.join(' | ')}` : canonical.label;
}

function dateISOFromDMY(dmy){
  const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!m) return null;

  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);

  const dt = DateTime.fromObject({year:y, month:mo, day:d}, {zone:'UTC'});
  if(!dt.isValid) return null;
  return dt.toISODate();
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function roundHalfUp(x){ return Math.floor(x + 0.5); }

function eastWestZones(dateISO, tzA, tzB){
  if(tzA === tzB) return { east: tzA, west: tzA, same:true };

  const a = DateTime.fromISO(dateISO, {zone:tzA}).startOf('day');
  const b = DateTime.fromISO(dateISO, {zone:tzB}).startOf('day');

  if(a.offset === b.offset) return { east: tzA, west: tzA, same:true };
  return (a.offset > b.offset)
    ? { east: tzA, west: tzB, same:false }
    : { east: tzB, west: tzA, same:false };
}

function superDayBounds(dateISO, tzA, tzB){
  const { east, west, same } = eastWestZones(dateISO, tzA, tzB);
  const start = DateTime.fromISO(dateISO, {zone:east}).startOf('day');
  const end = DateTime.fromISO(dateISO, {zone:west}).endOf('day');
  const durMs = end.toUTC().toMillis() - start.toUTC().toMillis();
  return { dateISO, east, west, same, start, end, durMs };
}

function durationToHHMMCeil30(ms){
  const minutes = Math.ceil((ms / 60000) / 30) * 30;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function superDayFactsForDate(dateISO, easternTZ, westernTZ){
  const b = superDayBounds(dateISO, easternTZ, westernTZ);
  return {
    east: b.east,
    west: b.west,
    start: b.start.toFormat('ccc dd LLL yyyy HH:mm'),
    end: b.end.toFormat('ccc dd LLL yyyy HH:mm'),
    length: durationToHHMMCeil30(b.durMs),
  };
}

function durationToHHMM(ms){
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${pad2(m)}`;
}

function ceilToHalfHourHours(hours){
  return Math.ceil(hours * 2) / 2;
}

function durationToHHMMCeilHalfHour(ms){
  const totalMin = ms / 60000;
  const roundedMin = Math.ceil(totalMin / 30) * 30;
  const h = Math.floor(roundedMin / 60);
  const m = roundedMin % 60;
  return `${h}:${pad2(m)}`;
}

function monthTitle(dateISO, displayTZ){
  const dt = DateTime.fromISO(dateISO, {zone:displayTZ});
  return dt.toFormat('LLLL yyyy');
}

// ---------- Data: SuperMonth ranges ----------
function buildRangesIndex(ranges){
  const byYear = new Map();
  const monthNoByName = new Map();
  const nameByMonthNo = new Map();

  for(const r of ranges){
    monthNoByName.set(r.monthName, r.monthNo);
    nameByMonthNo.set(r.monthNo, r.monthName);

    if(!byYear.has(r.seoianYear)) byYear.set(r.seoianYear, []);
    byYear.get(r.seoianYear).push(r);
  }

  for(const [, arr] of byYear.entries()){
    arr.sort((a,b)=> a.start.localeCompare(b.start));
  }

  return { byYear, monthNoByName, nameByMonthNo };
}

function activeSuperMonths(dateISO){
  if(!state.data.rangesBySeoYear) return [];
  const sy = seoianYearForGregorian(dateISO);
  const arr = state.data.rangesBySeoYear.get(sy) || [];
  return arr.filter(r => r.start <= dateISO && dateISO <= r.end);
}

function getRangeForMonth(seoYear, monthNo){
  const arr = state.data.rangesBySeoYear.get(seoYear) || [];
  return arr.find(x => x.monthNo === monthNo) || null;
}

function canonicalSeoianDate(dateISO){
  const sy = seoianYearForGregorian(dateISO);
  const act = activeSuperMonths(dateISO);

  if(act.length === 0){
    return { label: '—', year: sy, monthNo: null, day: null, canonical: null, active: [] };
  }

  const canonical = act.reduce((best, cur) => (cur.start > best.start ? cur : best), act[0]);
  const day = DateTime.fromISO(dateISO, {zone:'UTC'})
    .diff(DateTime.fromISO(canonical.start, {zone:'UTC'}), 'days').days + 1;
  const dayInt = Math.floor(day + 1e-9);
  const label = `${pad2(dayInt)}/${pad2(canonical.monthNo)}/${String(sy).padStart(4,'0')}`;

  return { label, year: sy, monthNo: canonical.monthNo, day: dayInt, canonical, active: act };
}

function gregorianFromSeoian(dd, mm, yyyy){
  const arr = state.data.rangesBySeoYear.get(yyyy) || [];
  const r = arr.find(x => x.monthNo === mm);
  if(!r) return null;

  const start = DateTime.fromISO(r.start, {zone:'UTC'});
  const target = start.plus({days: dd - 1});
  if(target.toISODate() > r.end) return null;

  return target.toISODate();
}

// ---------- One-Off classification ----------
function isMultiDayOneOff(def){
  if(def.allDay) return true;
  if((def.durationMinutes || 0) >= 1440) return true;

  const startLocal = DateTime.fromMillis(def.startUtcMs, {zone:'utc'}).setZone(state.displayTZ);
  const endLocal = DateTime.fromMillis(def.endUtcMs, {zone:'utc'}).setZone(state.displayTZ);
  const lastDay = endLocal.minus({milliseconds:1}).toISODate();

  return startLocal.toISODate() !== lastDay;
}

function oneOffSpanISO(def){
  const startLocal = DateTime.fromMillis(def.startUtcMs, {zone:'utc'}).setZone(state.displayTZ);
  const endLocal = DateTime.fromMillis(def.endUtcMs, {zone:'utc'}).setZone(state.displayTZ);

  return {
    startISO: startLocal.toISODate(),
    endISO: endLocal.minus({milliseconds:1}).toISODate()
  };
}

// ---------- Silent Sounds / Overflow ----------
function normalizeDaySongEntry(entry, source){
  return {
    title: String(entry?.title || '').trim() || 'Silent Sounds Track',
    artists: String(entry?.artist || '').trim(),
    url: String(entry?.url || '').trim(),
    note: String(entry?.note || '').trim(),
    source
  };
}

function buildSetDaySongsIndex(raw){
  const exactByDate = new Map();
  const recurringByMonthDay = new Map();

  const exactDates = Array.isArray(raw?.exactDates) ? raw.exactDates : [];
  const gregorianRecurring = Array.isArray(raw?.gregorianRecurring) ? raw.gregorianRecurring : [];

  for(const entry of exactDates){
    const dateISO = String(entry?.date || entry?.exactDate || '').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) continue;
    exactByDate.set(dateISO, normalizeDaySongEntry(entry, 'exact-date'));
  }

  for(const entry of gregorianRecurring){
    const monthDay = String(entry?.monthDay || '').trim();
    if(!/^\d{2}-\d{2}$/.test(monthDay)) continue;
    recurringByMonthDay.set(monthDay, normalizeDaySongEntry(entry, 'gregorian-recurring'));
  }

  return { exactByDate, recurringByMonthDay };
}

function hash32_FNV1a(str){
  let h = 0x811c9dc5;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
  }
  return h >>> 0;
}

function silentSoundForDate(dateISO){
  const setDaySongs = state.data.setDaySongs;

  if(setDaySongs){
    const exactMatch = setDaySongs.exactByDate.get(dateISO);
    if(exactMatch) return exactMatch;

    const monthDay = dateISO.slice(5); // "MM-DD"
    const recurringMatch = setDaySongs.recurringByMonthDay.get(monthDay);
    if(recurringMatch) return recurringMatch;
  }

  const songs = state.data.silentSounds;
  if(!songs || songs.length === 0) return null;

  const key = `SilentSounds|${dateISO}`;
  const idx = hash32_FNV1a(key) % songs.length;
  return songs[idx];
}

function activeSeoianMonthDayPairs(dateISO){
  const act = activeSuperMonths(dateISO);
  if(!act || act.length === 0) return [];

  const dUTC = DateTime.fromISO(dateISO, {zone:'UTC'}).startOf('day');
  const pairs = [];

  for(const r of act){
    const startUTC = DateTime.fromISO(r.start, {zone:'UTC'}).startOf('day');
    const day = dUTC.diff(startUTC, 'days').days + 1;
    const dayInt = Math.floor(day + 1e-9);

    if(dayInt >= 1){
      pairs.push({
        monthNo: r.monthNo,
        day: dayInt,
        monthName: r.monthName,
        start: r.start
      });
    }
  }

  pairs.sort((a,b)=> a.start.localeCompare(b.start) || (a.monthNo - b.monthNo) || (a.day - b.day));
  return pairs;
}

function seoianDateLabelFromPair(dateISO, pair){
  const sy = seoianYearForGregorian(dateISO);
  return `${pad2(pair.day)}/${pad2(pair.monthNo)}/${String(sy).padStart(4,'0')}`;
}

function seoianSongSlotsForDate(dateISO){
  const pairs = activeSeoianMonthDayPairs(dateISO);
  if(!pairs.length){
    return { primary: null, overlaps: [] };
  }

  const primary = pairs[pairs.length - 1];
  const overlaps = pairs.slice(0, -1);

  return {
    primary: {
      ...primary,
      seoianLabel: seoianDateLabelFromPair(dateISO, primary)
    },
    overlaps: overlaps.map(p => ({
      ...p,
      seoianLabel: seoianDateLabelFromPair(dateISO, p)
    }))
  };
}

function buildOverflowSlotOrder(){
  const out = [];
  const ranges = state.data.ranges || [];
  if(!ranges.length) return out;

  let minStart = null;
  let maxEnd = null;

  for(const r of ranges){
    if(!minStart || r.start < minStart) minStart = r.start;
    if(!maxEnd || r.end > maxEnd) maxEnd = r.end;
  }

  if(!minStart || !maxEnd) return out;

  let cursor = DateTime.fromISO(minStart, {zone:'UTC'}).startOf('day');
  const end = DateTime.fromISO(maxEnd, {zone:'UTC'}).startOf('day');

  while(cursor <= end){
    const dateISO = cursor.toISODate();
    const slots = seoianSongSlotsForDate(dateISO);
    const overlaps = slots.overlaps || [];

    for(const slot of overlaps){
      out.push({
        dateISO,
        seoianLabel: slot.seoianLabel,
        monthNo: slot.monthNo,
        day: slot.day
      });
    }

    cursor = cursor.plus({days:1});
  }

  return out;
}

function overflowSongsForDate(dateISO){
  const songs = state.data.overflowSounds || [];
  const slotOrder = state.data.overflowSlotOrder || [];

  if(!songs.length || !slotOrder.length) return [];

  const matches = slotOrder.filter(slot => slot.dateISO === dateISO);
  if(!matches.length) return [];

  return matches.map((slot, idx) => {
    const absoluteIndex = slotOrder.findIndex(
      s =>
        s.dateISO === slot.dateISO &&
        s.seoianLabel === slot.seoianLabel &&
        s.monthNo === slot.monthNo &&
        s.day === slot.day
    );

    const song = songs[absoluteIndex % songs.length];
    return {
      ...song,
      seoianLabel: slot.seoianLabel,
      monthNo: slot.monthNo,
      day: slot.day,
      sequenceInDay: idx
    };
  });
}

// ---------- Rendering ----------
const el = (id)=>document.getElementById(id);

function setUpTZList(){
  let zones = [];

  try{
    zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];
  }catch(e){
    zones = [];
  }

  if(!zones || zones.length === 0){
    zones = [
      DEFAULTS.tamaraTZ,
      DEFAULTS.martinTZ,
      'America/Toronto',
      'UTC',
      'Europe/London',
      'Asia/Tokyo'
    ];
  }

  const pinned = ['America/Phoenix', 'America/Toronto', 'Australia/Brisbane'];

  function fillSelectPinned(sel, currentVal, fallbackVal){
    if(!sel) return;
    sel.innerHTML = '';

    const zonesSet = new Set(zones);

    for(const z of pinned){
      if(!zonesSet.has(z)) continue;
      const opt = document.createElement('option');
      opt.value = z;
      opt.textContent = z;
      sel.appendChild(opt);
    }

    const sep = document.createElement('option');
    sep.value = '';
    sep.textContent = '-------------------';
    sep.disabled = true;
    sel.appendChild(sep);

    for(const z of zones){
      if(pinned.includes(z)) continue;
      const opt = document.createElement('option');
      opt.value = z;
      opt.textContent = z;
      sel.appendChild(opt);
    }

    sel.value = currentVal || '';
    if(!sel.value){
      const fb = (fallbackVal && zonesSet.has(fallbackVal))
        ? fallbackVal
        : (pinned.find(z=>zonesSet.has(z)) || zones[0] || 'UTC');
      sel.value = fb;
    }
  }

  fillSelectPinned(el('tzTamara'), state.tamaraTZ, DEFAULTS.tamaraTZ);
  fillSelectPinned(el('tzMartin'), state.martinTZ, DEFAULTS.martinTZ);
  fillSelectPinned(el('displayTZ'), state.displayTZ, state.displayTZ);

  ensureEastWestOrder();
}

function render(){
  closeMorePopover();

  const seo = canonicalSeoianDate(state.focusDateISO);
  if(seo.canonical){
    el('calTitle').textContent = `${seo.canonical.monthName}, ${String(seo.year).padStart(4,'0')}`;
  }else{
    el('calTitle').textContent = monthTitle(state.focusDateISO, state.displayTZ);
  }

  renderCenter();
  renderInspector();
  renderMobileSheetMirrors();
}

function renderCenter(){
  const surf = el('calSurface');
  surf.innerHTML = '';

  if(state.view === 'month') surf.appendChild(renderMonthView());
  if(state.view === 'week') surf.appendChild(renderWeekView());
  if(state.view === 'list') surf.appendChild(renderListView());
}

function renderMonthView(){
  const wrap = document.createElement('div');
  wrap.className = 'month';

  const dow = document.createElement('div');
  dow.className = 'dow';
  for(const d of DOW){
    const cell = document.createElement('div');
    cell.textContent = d;
    dow.appendChild(cell);
  }
  wrap.appendChild(dow);

  const dt = DateTime.fromISO(state.focusDateISO, {zone: state.displayTZ});
  const monthSeo = canonicalSeoianDate(state.focusDateISO);

  const rangeStartISO = monthSeo.canonical ? monthSeo.canonical.start : dt.startOf('month').toISODate();
  const rangeEndISO   = monthSeo.canonical ? monthSeo.canonical.end   : dt.endOf('month').toISODate();

  const start = startOfWeekSunday(DateTime.fromISO(rangeStartISO, {zone: state.displayTZ}));
  const end   = endOfWeekSaturday(DateTime.fromISO(rangeEndISO, {zone: state.displayTZ}));

  const oneOffByDay = groupOneOffsByDay(start.toISODate(), end.toISODate(), 'calendar');

  let cursor = start;

  while(cursor <= end){
    const weekStart = cursor;

    const weekEl = document.createElement('div');
    weekEl.className = 'week';

    const weekStartISO = weekStart.setZone(state.displayTZ).toISODate();
    const weekEndISO   = weekStart.plus({days:6}).setZone(state.displayTZ).toISODate();

    const allEvents = collectEventsForRange(weekStartISO, weekEndISO);

    const tierSuper  = allEvents.filter(e => e.kind === 'supermonth');
    const tierOneOff = allEvents.filter(e => e.kind === 'oneoff');
    const tierOther  = allEvents.filter(e => e.kind !== 'supermonth' && e.kind !== 'oneoff');

    const hiddenByDay = new Map();
    const addHidden = (m)=>{
      for(const [k,v] of m.entries()){
        hiddenByDay.set(k, (hiddenByDay.get(k) || 0) + v);
      }
    };

    function renderTier(events, maxLanes){
      if(!events.length) return null;

      const tier = document.createElement('div');
      tier.className = 'month-bars';

      const { placed, hiddenByDay: hid } = placeEventsInWeek(events, weekStartISO, weekEndISO, maxLanes);
      addHidden(hid);

      for(const p of placed){
        const bar = document.createElement('div');
        bar.className =
          (p.kind === 'special') ? 'bar special'
          : (p.kind === 'standard') ? 'bar standard'
          : (p.kind === 'oneoff') ? 'bar oneoff'
          : ('bar' + (p.lane === 1 ? ' secondary' : ''));

        bar.style.gridColumn = `${p.colStart} / ${p.colEnd+1}`;
        bar.style.gridRow = `${p.lane+1}`;
        bar.textContent = p.label;
        bar.title = p.label;
        tier.appendChild(bar);
      }

      return tier;
    }

    const t1 = renderTier(tierSuper, 3);
    const t2 = renderTier(tierOneOff, 2);
    const t3 = renderTier(tierOther, 3);

    if(t1) weekEl.appendChild(t1);
    if(t2) weekEl.appendChild(t2);
    if(t3) weekEl.appendChild(t3);

    const daysEl = document.createElement('div');
    daysEl.className = 'week-days';

    for(let i=0;i<7;i++){
      const dayDT = weekStart.plus({days:i}).setZone(state.displayTZ);
      const dateISO = dayDT.toISODate();

      const day = document.createElement('div');
      day.className = 'day';
      day.dataset.date = dateISO;

      const todayISO = DateTime.now().setZone(state.displayTZ).toISODate();
      if(dateISO === todayISO) day.classList.add('today');
      if(state.highlightDateISO && dateISO === state.highlightDateISO) day.classList.add('highlight');

      if(monthSeo.canonical){
        const inRange = (dateISO >= rangeStartISO && dateISO <= rangeEndISO);
        if(!inRange) day.classList.add('outside');
      }

      const sd = document.createElement('div');
      sd.className = 'sd';
      sd.textContent = seoianLabelWithOverlaps(dateISO);
      if(sd.textContent === '—') sd.textContent = '';
      day.appendChild(sd);

      const timed = (oneOffByDay.get(dateISO) || []).filter(ev => !isMultiDayOneOff(ev));
      const MAX_TIMED_VISIBLE = 2;

      if(timed.length){
        const items = document.createElement('div');
        items.className = 'day-items';

        timed.slice(0, MAX_TIMED_VISIBLE).forEach(ev => {
          const row = document.createElement('div');
          row.className = 'day-item';

          const t = document.createElement('span');
          t.className = 't';
          t.textContent = fmtTimeHHMM(ev.startLocal);
          row.appendChild(t);

          const txt = document.createElement('span');
          txt.textContent = ev.title;
          row.appendChild(txt);

          items.appendChild(row);
        });

        day.appendChild(items);
      }

      const hiddenBars = hiddenByDay.get(dateISO) || 0;
      const hiddenTimed = Math.max(0, timed.length - MAX_TIMED_VISIBLE);
      const hiddenCount = hiddenBars + hiddenTimed;

      if(hiddenCount > 0){
        const more = document.createElement('div');
        more.className = 'more';
        more.textContent = `+${hiddenCount} more`;
        more.addEventListener('click', (ev)=>{
          ev.stopPropagation();
          openMorePopover(dateISO, more);
        });
        day.appendChild(more);
      }

      day.addEventListener('mouseenter', ()=>{
        if(window.matchMedia('(max-width: 1040px)').matches) return;
        snapshotDay(dateISO);
      });
      day.addEventListener('click', ()=> snapshotDay(dateISO));

      daysEl.appendChild(day);
    }

    weekEl.appendChild(daysEl);
    wrap.appendChild(weekEl);

    cursor = cursor.plus({weeks:1});
  }

  return wrap;
}

function renderWeekView(){
  const wrap = document.createElement('div');
  wrap.className = 'week';

  const dt = startOfWeekSunday(DateTime.fromISO(state.focusDateISO, {zone: state.displayTZ}));

  const header = document.createElement('div');
  header.className = 'week-dow';

  const spacer = document.createElement('div');
  spacer.className = 'week-dow-spacer';
  header.appendChild(spacer);

  const showGreg = el('toggleGregorian').checked;

  for(let i=0;i<7;i++){
    const d = dt.plus({days:i});
    const dateISO = d.toISODate();

    const cell = document.createElement('div');
    cell.className = 'week-dow-cell';

    const main = document.createElement('div');
    main.className = 'week-dow-main';
    const label = seoianLabelWithOverlaps(dateISO);
    main.textContent = (label && label !== '—') ? `${DOW[i]} ${label}` : `${DOW[i]}`;
    cell.appendChild(main);

    if(showGreg){
      const sub = document.createElement('div');
      sub.className = 'week-dow-sub';
      sub.textContent = d.toFormat('d/L/yyyy');
      cell.appendChild(sub);
    }

    cell.addEventListener('mouseenter', ()=>{
      if(window.matchMedia('(max-width: 1040px)').matches) return;
      snapshotDay(dateISO);
    });
    cell.addEventListener('click', ()=> snapshotDay(dateISO));

    header.appendChild(cell);
  }

  wrap.appendChild(header);

  const weekStartISO = dt.toISODate();
  const weekEndISO = dt.plus({days:6}).toISODate();

  const barsEl = document.createElement('div');
  barsEl.className = 'week-bars';

  const events = collectEventsForRange(weekStartISO, weekEndISO);
  const { placed } = placeEventsInWeek(events, weekStartISO, weekEndISO, 5);

  for(const p of placed){
    const bar = document.createElement('div');
    bar.className =
      (p.kind === 'special') ? 'bar special' :
      (p.kind === 'standard') ? 'bar standard' :
      (p.kind === 'oneoff') ? 'bar oneoff' :
      ('bar' + (p.lane === 1 ? ' secondary' : ''));

    bar.style.gridColumn = `${p.colStart+1} / ${p.colEnd+2}`;
    bar.style.gridRow = `${p.lane+1}`;
    bar.textContent = p.label;
    barsEl.appendChild(bar);
  }

  wrap.appendChild(barsEl);

  const bounds = superDayBounds(state.focusDateISO, state.tamaraTZ, state.martinTZ);
  const durMs = bounds.end.toUTC().toMillis() - bounds.start.toUTC().toMillis();
  const nHoursRounded = ceilToHalfHourHours(durMs / 3600000);
  const extraCount = Math.max(0, Math.ceil(nHoursRounded) - 24);

  const grid = document.createElement('div');
  grid.className = 'week-grid';

  const cellMap = new Map();

  for(let h=0; h<24; h++){
    const lbl = document.createElement('div');
    lbl.className = 'time-label';

    const primary = document.createElement('span');
    primary.className = 'main';
    primary.textContent = `${String(h).padStart(2,'0')}:00`;
    lbl.appendChild(primary);

    const ov = document.createElement('span');
    ov.className = 'ov';
    ov.textContent = (h < extraCount) ? `${String(24+h).padStart(2,'0')}:00` : '';
    lbl.appendChild(ov);

    grid.appendChild(lbl);

    for(let d=0; d<7; d++){
      const cell = document.createElement('div');
      cell.className = 'week-cell';
      const dateISO = dt.plus({days:d}).toISODate();
      cell.dataset.date = dateISO;
      cell.dataset.hour = String(h);
      cellMap.set(`${dateISO}|${String(h).padStart(2,'0')}`, cell);
      grid.appendChild(cell);
    }
  }

  renderOneOffBlocksInWeek(cellMap, weekStartISO, weekEndISO);

  wrap.appendChild(grid);
  return wrap;
}

function renderOneOffBlocksInWeek(cellMap, weekStartISO, weekEndISO){
  if(!enabledForOneOff()) return;

  const byDay = groupOneOffsByDay(weekStartISO, weekEndISO, 'calendar');

  const ROW_H = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--week-row-h')) || 56;
  const MIN_H = 18;

  for(const [dateISO, events] of byDay.entries()){
    for(const ev of events){
      let start = ev.startLocal;
      let remainingMin = ev.durationMinutes || 30;

      while(remainingMin > 0){
        const hourKey = `${dateISO}|${String(start.hour).padStart(2,'0')}`;
        const cell = cellMap.get(hourKey);
        const minInHour = start.minute;
        const cap = 60 - minInHour;
        const take = Math.min(remainingMin, cap);

        if(cell){
          const block = document.createElement('div');
          block.className = 'oneoff-block';

          const top = (minInHour / 60) * ROW_H;
          const height = Math.max(MIN_H, (take / 60) * ROW_H);

          block.style.top = `${top}px`;
          block.style.height = `${height}px`;
          block.textContent = ev.title;
          cell.appendChild(block);
        }

        remainingMin -= take;
        start = start.plus({minutes: take});
      }
    }
  }
}

function renderListView(){
  const wrap = document.createElement('div');
  wrap.style.padding='12px';
  wrap.style.display='flex';
  wrap.style.flexDirection='column';
  wrap.style.gap='10px';

  const focus = DateTime.fromISO(state.focusDateISO, {zone:state.displayTZ});
  const start = focus.startOf('day').minus({days:3});
  const end = focus.startOf('day').plus({days:26});

  const oneOffByDay = groupOneOffsByDay(start.toISODate(), end.toISODate(), 'list');

  for(let i=0;i<=end.diff(start,'days').days;i++){
    const d = start.plus({days:i});
    const dateISO = d.toISODate();
    const seo = canonicalSeoianDate(dateISO);

    const active = state.filters.superMonths ? activeSuperMonths(dateISO) : [];
    const dayDefs = recurringDayDefsForDate(dateISO, 'showOnCalendar');
    const oneOffs = oneOffByDay.get(dateISO) || [];

    const card = document.createElement('div');
    card.style.border='1px solid var(--line)';
    card.style.borderRadius='14px';
    card.style.background='#fff';
    card.style.padding='10px 12px';

    const head = document.createElement('div');
    head.style.display='flex';
    head.style.justifyContent='space-between';
    head.style.alignItems='baseline';

    const h1 = document.createElement('div');
    h1.style.fontFamily='var(--mono)';
    h1.style.fontWeight='700';
    h1.textContent = seo.label;
    head.appendChild(h1);

    const h2 = document.createElement('div');
    h2.style.color='var(--muted)';
    h2.style.fontSize='12px';
    h2.textContent = fmtGreg(dateISO);
    if(!el('toggleGregorian').checked) h2.style.display='none';
    head.appendChild(h2);

    card.appendChild(head);

    const items = document.createElement('div');
    items.style.marginTop='8px';
    items.style.display='flex';
    items.style.flexDirection='column';
    items.style.gap='6px';

    let any = false;

    for(const a of active.sort((x,y)=>x.monthNo-y.monthNo)){
      any = true;
      const row = document.createElement('div');
      row.textContent = a.monthName;
      row.style.fontSize='13px';
      items.appendChild(row);
    }

    for(const def of dayDefs){
      any = true;
      const row = document.createElement('div');
      row.textContent = def.title;
      row.style.fontSize='13px';
      row.style.fontWeight='600';
      items.appendChild(row);
    }

    if(state.filters.oneOff){
      for(const ev of oneOffs){
        any = true;
        const row = document.createElement('div');
        const label = isMultiDayOneOff(ev) ? ev.title : `${fmtTimeHHMM(ev.startLocal)} ${ev.title}`;
        row.textContent = label;
        row.style.fontSize='13px';
        items.appendChild(row);
      }
    }

    if(!any){
      const row = document.createElement('div');
      row.className='muted small';
      row.textContent='(no periods)';
      items.appendChild(row);
    }

    card.appendChild(items);

    card.addEventListener('mouseenter', ()=>{
      if(window.matchMedia('(max-width: 1040px)').matches) return;
      snapshotDay(dateISO);
    });
    card.addEventListener('click', ()=> snapshotDay(dateISO));

    wrap.appendChild(card);
  }

  return wrap;
}

// ---------- Events for spanning bars ----------
function enabledForCategory(cat){
  const c = categoryKey(cat);
  if(isSpecialCategory(c)) return state.filters.specialDays;
  if(isStandardCategory(c)) return state.filters.standardDays;
  return true;
}

function enabledForOneOff(){ return !!state.filters.oneOff; }

function syEventDefsForDate(dateISO){
  if(!state.data.syByKey) return [];

  const syYear = seoianYearForGregorian(dateISO);
  const pairs = activeSeoianMonthDayPairs(dateISO);
  if(pairs.length === 0) return [];

  const byId = new Map();

  for(const p of pairs){
    const key = `${p.monthNo}-${p.day}`;
    const arr = state.data.syByKey.get(key) || [];

    for(const def of arr){
      if(!enabledForCategory(def.category)) continue;
      if(syYear < (def.syStartYear || 1)) continue;

      const existing = byId.get(def.id);
      if(!existing){
        byId.set(def.id, def);
      }else{
        const er = existing.rank ?? 9;
        const dr = def.rank ?? 9;
        const es = existing.sequence ?? 9999;
        const ds = def.sequence ?? 9999;
        if(dr < er || (dr === er && ds < es)){
          byId.set(def.id, def);
        }
      }
    }
  }

  const out = Array.from(byId.values());

  out.sort((a,b)=>
    (a.rank ?? 9) - (b.rank ?? 9) ||
    (a.sequence ?? 9999) - (b.sequence ?? 9999) ||
    a.title.localeCompare(b.title)
  );

  return out;
}

function weekdayToLuxon(w){
  if(w === null || w === undefined) return null;
  const n = Number(w);
  if(!Number.isFinite(n)) return null;
  if(n === 0) return 7;
  return n;
}

function easterSundayMonthDay(year){
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
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return {month, day};
}

function occurrenceISOForGregorianRule(def, year){
  if(year < (def.gregStartYear || 0)) return null;

  const zone = state.displayTZ;
  const t = def.anchorType;

  if(t === 'GY_FIXED'){
    if(!def.gyMonth || !def.gyDay) return null;
    return DateTime.fromObject({year, month:def.gyMonth, day:def.gyDay}, {zone}).toISODate();
  }

  if(t === 'GY_NTH_DOW'){
    if(!def.gyMonth || !def.nth || def.weekday === null || def.weekday === undefined) return null;

    const target = weekdayToLuxon(def.weekday);
    const first = DateTime.fromObject({year, month:def.gyMonth, day:1}, {zone});
    const firstW = first.weekday;
    const delta = (target - firstW + 7) % 7;
    const day = 1 + delta + (def.nth - 1) * 7;

    const dt = DateTime.fromObject({year, month:def.gyMonth, day}, {zone});
    if(dt.month !== def.gyMonth) return null;

    return dt.toISODate();
  }

  if(t === 'GY_LAST_DOW'){
    if(!def.gyMonth || def.weekday === null || def.weekday === undefined) return null;

    const target = weekdayToLuxon(def.weekday);
    let dt = DateTime.fromObject({year, month:def.gyMonth, day:1}, {zone}).endOf('month').startOf('day');
    while(dt.weekday !== target) dt = dt.minus({days:1});
    return dt.toISODate();
  }

  if(t === 'GY_LAST_DOW_BEFORE_DATE'){
    if(!def.gyMonth || !def.gyDay || def.weekday === null || def.weekday === undefined) return null;

    const target = weekdayToLuxon(def.weekday);
    let dt = DateTime.fromObject({year, month:def.gyMonth, day:def.gyDay}, {zone}).minus({days:1}).startOf('day');
    while(dt.weekday !== target) dt = dt.minus({days:1});
    return dt.toISODate();
  }

  if(t === 'GY_EASTER'){
    const {month, day} = easterSundayMonthDay(year);
    let dt = DateTime.fromObject({year, month, day}, {zone}).startOf('day');

    const off = Number(def.offsetDays || 0);
    if(Number.isFinite(off) && off !== 0) dt = dt.plus({days: off});

    return dt.toISODate();
  }

  return null;
}

function occurrenceRangeForGregorianRule(def, year){
  const startISO = occurrenceISOForGregorianRule(def, year);
  if(!startISO) return null;

  let endISO = startISO;

  if(def.endMonth && def.endDay){
    const start = DateTime.fromISO(startISO, {zone:'UTC'}).startOf('day');
    let end = DateTime.fromObject(
      {year, month:def.endMonth, day:def.endDay},
      {zone:'UTC'}
    ).startOf('day');

    if(end < start){
      end = end.plus({years:1});
    }

    endISO = end.toISODate();
  }

  return { startISO, endISO };
}

function activeGregorianOccurrenceForDate(def, dateISO){
  const dt = DateTime.fromISO(dateISO, {zone: state.displayTZ});
  const year = dt.year;

  const yearsToCheck = (def.endMonth && def.endDay) ? [year - 1, year] : [year];

  for(const y of yearsToCheck){
    const occ = occurrenceRangeForGregorianRule(def, y);
    if(!occ) continue;
    if(occ.startISO <= dateISO && dateISO <= occ.endISO){
      return occ;
    }
  }

  return null;
}

function gregorianDefsForDate(dateISO){
  if(!state.data.gyDefs) return [];

  const dt = DateTime.fromISO(dateISO, {zone: state.displayTZ});
  const year = dt.year;
  const out = [];

  for(const def of state.data.gyDefs){
    if(!enabledForCategory(def.category)) continue;

    const yearsToCheck = (def.endMonth && def.endDay) ? [year - 1, year] : [year];

    for(const y of yearsToCheck){
      const occ = occurrenceRangeForGregorianRule(def, y);
      if(!occ) continue;

      if(occ.startISO <= dateISO && dateISO <= occ.endISO){
        out.push(def);
        break;
      }
    }
  }

  return out;
}

// End-exclusive day grouping.
// Context rules:
// - 'calendar' => SHORT one-offs only (and showOnCalendar)
// - 'list'     => ALL one-offs (showOnCalendar)
// - 'inspector'=> ALL one-offs (showInInspector)
function groupOneOffsByDay(rangeStartISO, rangeEndISO, context='calendar'){
  const out = new Map();
  if(!state.data.oneOffDefs || !enabledForOneOff()) return out;

  const rangeStart = DateTime.fromISO(rangeStartISO, {zone: state.displayTZ}).startOf('day');
  const rangeEndExclusive = DateTime.fromISO(rangeEndISO, {zone: state.displayTZ}).plus({days:1}).startOf('day');

  const rangeStartMs = rangeStart.toMillis();
  const rangeEndMsExclusive = rangeEndExclusive.toMillis();

  for(const def of state.data.oneOffDefs){
    const allow = (context === 'inspector') ? def.showInInspector : def.showOnCalendar;
    if(!allow) continue;

    if(context === 'calendar' && isMultiDayOneOff(def)) continue;

    const startLocal = DateTime.fromMillis(def.startUtcMs, {zone:'utc'}).setZone(state.displayTZ);
    const endLocal = DateTime.fromMillis(def.endUtcMs, {zone:'utc'}).setZone(state.displayTZ);

    if(startLocal.toMillis() >= rangeEndMsExclusive) continue;
    if(endLocal.toMillis() <= rangeStartMs) continue;

    let dayCursor = startLocal.startOf('day');
    const lastDay = endLocal.minus({milliseconds: 1}).startOf('day');

    while(dayCursor <= lastDay){
      const dayISO = dayCursor.toISODate();

      if(dayISO >= rangeStartISO && dayISO <= rangeEndISO){
        const dayStart = dayCursor;
        const dayEndExclusive = dayCursor.plus({days:1});

        if(startLocal < dayEndExclusive && endLocal > dayStart){
          if(!out.has(dayISO)) out.set(dayISO, []);
          out.get(dayISO).push({ ...def, startLocal, endLocal });
        }
      }

      dayCursor = dayCursor.plus({days:1});
    }
  }

  for(const [, arr] of out.entries()){
    arr.sort((a,b)=>
      a.startLocal.toMillis() - b.startLocal.toMillis() ||
      (a.rank - b.rank) ||
      (a.sequence - b.sequence) ||
      a.title.localeCompare(b.title)
    );
  }

  return out;
}

function oneOffsForDate(dateISO, context='calendar'){
  const m = groupOneOffsByDay(dateISO, dateISO, context);
  return m.get(dateISO) || [];
}

function collectAllDayEventOccurrencesForRange(rangeStartISO, rangeEndISO){
  const events = [];

  if(state.filters.superMonths){
    const syStart = seoianYearForGregorian(rangeStartISO);
    const syEnd = seoianYearForGregorian(rangeEndISO);
    const years = new Set([syStart, syEnd]);

    for(const y of years){
      const arr = state.data.rangesBySeoYear.get(y) || [];
      for(const r of arr){
        if(r.end < rangeStartISO || r.start > rangeEndISO) continue;
        events.push({
          id: `${r.seoianYear}-${r.monthNo}`,
          label: r.monthName,
          start: r.start,
          end: r.end,
          monthNo: r.monthNo,
          kind: 'supermonth',
          rank: 0,
          sequence: r.monthNo
        });
      }
    }
  }

  const start = DateTime.fromISO(rangeStartISO, {zone: state.displayTZ}).startOf('day');
  const end = DateTime.fromISO(rangeEndISO, {zone: state.displayTZ}).startOf('day');
  const days = Math.round(end.diff(start, 'days').days);

  for(let i=0;i<=days;i++){
    const dateISO = start.plus({days:i}).toISODate();
    const seo = canonicalSeoianDate(dateISO);

    for(const def of syEventDefsForDate(dateISO)){
      if(!def.showOnCalendar) continue;
      events.push({
        id: `${def.id}_${String(seo.year).padStart(4,'0')}`,
        label: def.title,
        start: dateISO,
        end: dateISO,
        kind: isStandardCategory(def.category) ? 'standard' : isSpecialCategory(def.category) ? 'special' : 'other',
        rank: def.rank ?? 9,
        sequence: def.sequence ?? 9999
      });
    }
  }

  const startY = start.year;
  const endY = end.year;

  for(let y = startY - 1; y <= endY; y++){
    for(const def of (state.data.gyDefs || [])){
      if(!def.showOnCalendar) continue;
      if(!enabledForCategory(def.category)) continue;

      const occ = occurrenceRangeForGregorianRule(def, y);
      if(!occ) continue;

      if(occ.endISO < rangeStartISO || occ.startISO > rangeEndISO) continue;

      events.push({
        id: `${def.id}_${String(y).padStart(4,'0')}`,
        label: def.title,
        start: occ.startISO,
        end: occ.endISO,
        kind: isStandardCategory(def.category) ? 'standard' : isSpecialCategory(def.category) ? 'special' : 'other',
        rank: def.rank ?? 9,
        sequence: def.sequence ?? 9999
      });
    }
  }

  if(state.filters.oneOff && state.data.oneOffDefs){
    for(const def of state.data.oneOffDefs){
      if(!def.showOnCalendar) continue;
      if(!isMultiDayOneOff(def)) continue;

      const span = oneOffSpanISO(def);
      if(span.endISO < rangeStartISO || span.startISO > rangeEndISO) continue;

      events.push({
        id: `${def.id}_${span.startISO}`,
        label: def.title,
        start: span.startISO,
        end: span.endISO,
        kind: 'oneoff',
        rank: def.rank ?? 3,
        sequence: def.sequence ?? 9999
      });
    }
  }

  events.sort((a,b)=>
    (a.rank ?? 9) - (b.rank ?? 9) ||
    (a.sequence ?? 9999) - (b.sequence ?? 9999) ||
    a.start.localeCompare(b.start) ||
    a.label.localeCompare(b.label)
  );

  return events;
}

function collectEventsForRange(rangeStartISO, rangeEndISO){
  return collectAllDayEventOccurrencesForRange(rangeStartISO, rangeEndISO);
}

function placeEventsInWeek(events, weekStartISO, weekEndISO, maxLanes){
  const placed = [];
  const hiddenByDay = new Map();
  const lanes = Array.from({length: maxLanes}, ()=> Array(7).fill(false));

  function dayIndex(dateISO){
    const dt = DateTime.fromISO(dateISO, {zone:state.displayTZ});
    const ws = DateTime.fromISO(weekStartISO, {zone:state.displayTZ});
    return Math.round(dt.diff(ws, 'days').days);
  }

  for(const ev of events){
    const segStart = ev.start < weekStartISO ? weekStartISO : ev.start;
    const segEnd = ev.end > weekEndISO ? weekEndISO : ev.end;
    const cStart = clamp(dayIndex(segStart), 0, 6);
    const cEnd = clamp(dayIndex(segEnd), 0, 6);

    let lane = -1;
    for(let l=0;l<maxLanes;l++){
      let ok = true;
      for(let c=cStart;c<=cEnd;c++){
        if(lanes[l][c]) { ok = false; break; }
      }
      if(ok){ lane = l; break; }
    }

    if(lane >= 0){
      for(let c=cStart;c<=cEnd;c++) lanes[lane][c] = true;
      placed.push({ ...ev, lane, colStart:cStart+1, colEnd:cEnd+1 });
    }else{
      for(let c=cStart;c<=cEnd;c++){
        const dISO = DateTime.fromISO(weekStartISO, {zone:state.displayTZ}).plus({days:c}).toISODate();
        hiddenByDay.set(dISO, (hiddenByDay.get(dISO) || 0) + 1);
      }
    }
  }

  return { placed, hiddenByDay };
}

// ---------- Snapshot: Day Inspector ----------
function snapshotDay(dateISO){
  const seo = canonicalSeoianDate(dateISO);
  const songSlots = seoianSongSlotsForDate(dateISO);

  const periods = state.filters.superMonths
    ? activeSuperMonths(dateISO).sort((a,b)=>a.monthNo-b.monthNo).map(p=>p.monthName)
    : [];

  const dayDefs = recurringDayDefsForDate(dateISO, 'showInInspector');

  const oneOffs = (state.filters.oneOff && state.data.oneOffDefs)
    ? oneOffsForDate(dateISO, 'inspector')
    : [];

  const silentSong = silentSoundForDate(dateISO);
  const overflowSongs = overflowSongsForDate(dateISO);

  state.snapshot = {
    dateISO,
    seoianLabel: seo.label,
    gregorianLabel: fmtGreg(dateISO),
    dayDefs,
    oneOffs,
    silentSong,
    overflowSongs,
    songSlots,
    periods,
    facts: superDayFactsForDate(dateISO, state.tamaraTZ, state.martinTZ),
    tzAtSnapshot: { tamaraTZ: state.tamaraTZ, martinTZ: state.martinTZ }
  };

  state.highlightDateISO = dateISO;
  render();
}

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

  el('inspectorSeoian').textContent = seoianLabelWithOverlaps(snap.dateISO);
  el('inspectorGregorian').textContent = snap.gregorianLabel;

  const p = el('inspectorPeriods');
  p.innerHTML = '';

  const dayDefs = snap.dayDefs || [];
  const oneOffs = snap.oneOffs || [];

  let any = false;

  if(snap.periods && snap.periods.length){
    any = true;
    for(const item of snap.periods){
      const div = document.createElement('div');
      div.className = 'pill';
      div.textContent = item;
      p.appendChild(div);
    }
  }

  if(dayDefs.length){
    any = true;
    for(const d of dayDefs){
      const div = document.createElement('div');
      div.className = 'eventitem';

      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = d.title;
      div.appendChild(t);

      const inspectorNote = inspectorNoteForDayDef(d, snap.dateISO);
      if(inspectorNote){
        const n = document.createElement('div');
        n.className = 'note';
        n.textContent = inspectorNote;
        div.appendChild(n);
      }

      p.appendChild(div);
    }
  }

  if(oneOffs.length){
    any = true;
    for(const ev of oneOffs){
      const div = document.createElement('div');
      div.className = 'eventitem';

      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = isMultiDayOneOff(ev) ? ev.title : `${fmtTimeHHMM(ev.startLocal)} ${ev.title}`;
      div.appendChild(t);

      const originTZ = ev.originTZ || 'UTC';
      const originDT = DateTime.fromMillis(ev.startUtcMs, {zone:'utc'}).setZone(originTZ);
      const o = document.createElement('div');
      o.className = 'note';
      o.textContent = `Origin: ${originDT.toFormat('dd/LL/yyyy HH:mm')} ${originTZ}`;
      div.appendChild(o);

      if(ev.notes){
        const n = document.createElement('div');
        n.className = 'note';
        n.textContent = ev.notes;
        div.appendChild(n);
      }

      p.appendChild(div);
    }
  }

  if(snap.silentSong){
    any = true;

    const div = document.createElement('div');
    div.className = 'eventitem songofday';

    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = snap.songSlots?.primary?.seoianLabel
      ? `Silent Sounds: ${snap.songSlots.primary.seoianLabel}`
      : 'Silent Sounds (Song of the Day)';
    div.appendChild(t);

    const label = snap.silentSong.artists
      ? `${snap.silentSong.title} — ${snap.silentSong.artists}`
      : snap.silentSong.title;

    if(snap.silentSong.url){
      const a = document.createElement('a');
      a.href = snap.silentSong.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'songlink';
      a.textContent = label;
      div.appendChild(a);
    }else{
      const s = document.createElement('div');
      s.className = 'songlink';
      s.textContent = label;
      div.appendChild(s);
    }

    if(snap.silentSong.note){
      const n = document.createElement('div');
      n.className = 'note';
      n.textContent = snap.silentSong.note;
      div.appendChild(n);
    }

    p.appendChild(div);
  }

  if(snap.overflowSongs && snap.overflowSongs.length){
    any = true;

    for(const song of snap.overflowSongs){
      const div = document.createElement('div');
      div.className = 'eventitem songofday';

      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = song.seoianLabel
        ? `Overflow: ${song.seoianLabel}`
        : 'Overflow';
      div.appendChild(t);

      const label = song.artists
        ? `${song.title} — ${song.artists}`
        : song.title;

      if(song.url){
        const a = document.createElement('a');
        a.href = song.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'songlink';
        a.textContent = label;
        div.appendChild(a);
      }else{
        const s = document.createElement('div');
        s.className = 'songlink';
        s.textContent = label;
        div.appendChild(s);
      }

      if(song.note){
        const n = document.createElement('div');
        n.className = 'note';
        n.textContent = song.note;
        div.appendChild(n);
      }

      p.appendChild(div);
    }
  }

  if((snap.songSlots?.overlaps?.length || 0) > 0 && (!snap.overflowSongs || !snap.overflowSongs.length)){
    any = true;

    const div = document.createElement('div');
    div.className = 'eventitem songofday';

    const t = document.createElement('div');
    t.className = 'title';
    t.textContent = `Overflow: ${snap.songSlots.overlaps.map(x => x.seoianLabel).join(' | ')}`;
    div.appendChild(t);

    const n = document.createElement('div');
    n.className = 'note';
    n.textContent = 'Overlap date detected, but no Overflow track was assigned. This usually means AFdS_Overflow.csv was not loaded from the site.';
    div.appendChild(n);

    p.appendChild(div);
  }

  if(!any) p.innerHTML = '<div class="muted">(no periods)</div>';

  const f = el('inspectorFacts');
  f.innerHTML = '';

  const rows = [
    ['Eastern TZ', snap.facts.east],
    ['Western TZ', snap.facts.west],
    ['Start', snap.facts.start],
    ['End', snap.facts.end],
    ['Length', snap.facts.length],
    ['Snapshot TZs', `${snap.tzAtSnapshot.tamaraTZ} / ${snap.tzAtSnapshot.martinTZ}`]
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

function renderMobileSheetMirrors(){
  const ins = el('sheetInspector');
  const clk = el('sheetClocks');
  if(!ins || !clk) return;

  ins.innerHTML = '';
  clk.innerHTML = '';

  const left = el('leftPanel');
  const right = el('rightPanel');
  if(!left || !right) return;

  const cloneInspector = left.querySelector('.panel-inner').cloneNode(true);
  ins.appendChild(cloneInspector);

  const cloneClocks = right.querySelector('.panel-inner').cloneNode(true);
  clk.appendChild(cloneClocks);
}

// Helpers for +more
function activePeriodsForISO(dateISO){
  const out = [];
  if(state.filters.superMonths){
    const active = activeSuperMonths(dateISO).sort((a,b)=>a.monthNo-b.monthNo);
    for(const a of active){
      out.push({ name: a.monthName, kind: 'supermonth' });
    }
  }
  return out;
}

function recurringDayDefsForDate(dateISO, visibilityField='showOnCalendar'){
  const defs = [
    ...syEventDefsForDate(dateISO),
    ...gregorianDefsForDate(dateISO),
  ].filter(d => {
    if(!d) return false;
    if(visibilityField === 'showInInspector') return !!d.showInInspector;
    return !!d.showOnCalendar;
  });

  const seen = new Set();
  const out = [];

  for(const d of defs){
    const key = d.id || `${d.anchorType}|${d.title}`;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }

  out.sort((a,b)=>
    (a.rank ?? 9) - (b.rank ?? 9) ||
    (a.sequence ?? 9999) - (b.sequence ?? 9999) ||
    a.title.localeCompare(b.title)
  );

  return out;
}

function allDayDefsForDate(dateISO){
  return recurringDayDefsForDate(dateISO, 'showOnCalendar');
}

function daysInclusive(startISO, endISO){
  const start = DateTime.fromISO(startISO, {zone:'UTC'}).startOf('day');
  const end = DateTime.fromISO(endISO, {zone:'UTC'}).startOf('day');
  return Math.floor(end.diff(start, 'days').days) + 1;
}

function normalizeKey(s){
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function isTMTime(def){
  const idKey = normalizeKey(def.id);
  const titleKey = normalizeKey(def.title);

  return (
    idKey.endsWith('TMTIME') ||
    titleKey === 'TMTIME'
  );
}

function inspectorNoteForDayDef(def, dateISO){
  if(!isTMTime(def)) return def.notes || '';

  const occ = activeGregorianOccurrenceForDate(def, dateISO);
  if(!occ) return def.notes || '';

  const start = DateTime.fromISO(occ.startISO, {zone:'UTC'}).startOf('day');
  const current = DateTime.fromISO(dateISO, {zone:'UTC'}).startOf('day');
  const dayNo = Math.floor(current.diff(start, 'days').days) + 1;
  const totalDays = daysInclusive(occ.startISO, occ.endISO);

  return `The Original Period Together - Day ${dayNo} of ${totalDays}`;
}

// ---------- +more popover ----------
function closeMorePopover(){
  const pop = el('morePopover');
  if(!pop) return;
  pop.hidden = true;

  const body = el('morePopoverBody');
  if(body) body.innerHTML = '';
}

function openMorePopover(dateISO, anchorEl){
  const pop = el('morePopover');
  const body = el('morePopoverBody');
  if(!pop || !body) return;

  body.innerHTML = '';

  const periods = activePeriodsForISO(dateISO);
  const defs = allDayDefsForDate(dateISO);
  const items = [];

  periods.forEach(p => items.push({ label: p.name, kind: 'period' }));

  const specials = defs.filter(d => isSpecialCategory(d.category));
  const standards = defs.filter(d => isStandardCategory(d.category));
  const others = defs.filter(d => !isSpecialCategory(d.category) && !isStandardCategory(d.category));

  specials.forEach(d => items.push({ label: d.title, kind: 'special' }));
  standards.forEach(d => items.push({ label: d.title, kind: 'standard' }));
  others.forEach(d => items.push({ label: d.title, kind: 'other' }));

  const oneOffs = oneOffsForDate(dateISO, 'calendar').filter(ev => !isMultiDayOneOff(ev));
  oneOffs.forEach(ev => {
    items.push({ label: `${fmtTimeHHMM(ev.startLocal)} ${ev.title}`, kind: 'oneoff' });
  });

  if(!items.length){
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.style.fontSize = '12px';
    empty.textContent = 'No additional items.';
    body.appendChild(empty);
  }else{
    items.forEach(it => {
      const div = document.createElement('div');
      div.className = 'pop-item';
      div.textContent = it.label;
      body.appendChild(div);
    });
  }

  const r = anchorEl?.getBoundingClientRect?.();
  const margin = 10;
  const width = 320;
  const height = 260;

  let left = margin;
  let top = margin;

  if(r){
    left = Math.min(window.innerWidth - width - margin, Math.max(margin, r.left));
    top = Math.min(window.innerHeight - height - margin, Math.max(margin, r.bottom + 6));
  }

  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.hidden = false;

  const closeBtn = el('moreClose');
  if(closeBtn){
    closeBtn.onclick = () => closeMorePopover();
  }

  setTimeout(() => {
    const onDoc = (ev) => {
      if(pop.hidden) return;
      if(pop.contains(ev.target)) return;
      closeMorePopover();
      document.removeEventListener('click', onDoc, true);
    };
    document.addEventListener('click', onDoc, true);
  }, 0);
}

window.addEventListener('click', (e)=>{
  const pop = el('morePopover');
  if(!pop || pop.hidden) return;
  if(!pop.contains(e.target) && !(e.target.classList && e.target.classList.contains('more'))){
    pop.hidden = true;
  }
});

// ---------- Clocks ----------
function makeClockSVG(kind='normal'){
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 200 200');
  svg.setAttribute('width','92%');
  svg.setAttribute('height','92%');

  const face = document.createElementNS(ns,'circle');
  face.setAttribute('cx','100');
  face.setAttribute('cy','100');
  face.setAttribute('r','92');
  face.setAttribute('fill','#fff');
  face.setAttribute('stroke','#e6e7ea');
  face.setAttribute('stroke-width','2');
  svg.appendChild(face);

  for(let i=0;i<60;i++){
    const tick = document.createElementNS(ns,'line');
    const a = (Math.PI * 2 * i) / 60;
    const r1 = (i % 5 === 0) ? 78 : 84;
    const r2 = 90;
    const x1 = 100 + Math.sin(a) * r1;
    const y1 = 100 - Math.cos(a) * r1;
    const x2 = 100 + Math.sin(a) * r2;
    const y2 = 100 - Math.cos(a) * r2;
    tick.setAttribute('x1', x1);
    tick.setAttribute('y1', y1);
    tick.setAttribute('x2', x2);
    tick.setAttribute('y2', y2);
    tick.setAttribute('stroke', (i % 5 === 0) ? '#cfd3da' : '#e6e7ea');
    tick.setAttribute('stroke-width', (i % 5 === 0) ? 2 : 1);
    svg.appendChild(tick);
  }

  function addText(id, txt, x, y){
    const t = document.createElementNS(ns,'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor','middle');
    t.setAttribute('dominant-baseline','middle');
    t.setAttribute('font-family','ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace');
    t.setAttribute('font-size','14');
    t.setAttribute('fill','#5c6470');
    t.id = id;
    t.textContent = txt;
    svg.appendChild(t);
  }

  if(kind === 'normal'){
    addText('n12','12',100,34);
    addText('n3','3',166,102);
    addText('n6','6',100,170);
    addText('n9','9',34,102);
  }else if(kind === 'superday'){
    addText('n12','0',100,34);
    addText('n3','',166,102);
    addText('n6','',100,170);
    addText('n9','',34,102);
  }

  const hour = document.createElementNS(ns,'line');
  hour.setAttribute('x1','100');
  hour.setAttribute('y1','100');
  hour.setAttribute('x2','100');
  hour.setAttribute('y2','54');
  hour.setAttribute('stroke','#111318');
  hour.setAttribute('stroke-width','5');
  hour.setAttribute('stroke-linecap','round');
  hour.id = 'h';
  svg.appendChild(hour);

  const minute = document.createElementNS(ns,'line');
  minute.setAttribute('x1','100');
  minute.setAttribute('y1','100');
  minute.setAttribute('x2','100');
  minute.setAttribute('y2','34');
  minute.setAttribute('stroke','#111318');
  minute.setAttribute('stroke-width','3');
  minute.setAttribute('stroke-linecap','round');
  minute.id = 'm';
  svg.appendChild(minute);

  const second = document.createElementNS(ns,'line');
  second.setAttribute('x1','100');
  second.setAttribute('y1','108');
  second.setAttribute('x2','100');
  second.setAttribute('y2','24');
  second.setAttribute('stroke','#1b6b6f');
  second.setAttribute('stroke-width','2');
  second.setAttribute('stroke-linecap','round');
  second.id = 's';
  svg.appendChild(second);

  const dot = document.createElementNS(ns,'circle');
  dot.setAttribute('cx','100');
  dot.setAttribute('cy','100');
  dot.setAttribute('r','5');
  dot.setAttribute('fill','#1b6b6f');
  svg.appendChild(dot);

  return svg;
}

function rotate(elm, deg){
  elm.setAttribute('transform', `rotate(${deg} 100 100)`);
}

function mountClocks(){
  const hostT = el('clockTamara');
  hostT.innerHTML = '';
  hostT.appendChild(makeClockSVG('normal'));

  const hostM = el('clockMartin');
  hostM.innerHTML = '';
  hostM.appendChild(makeClockSVG('normal'));

  const hostS = el('clockSuperday');
  hostS.innerHTML = '';
  hostS.appendChild(makeClockSVG('superday'));
}

function tickClocks(){
  ensureEastWestOrder();
  const now = DateTime.now();

  const tNow = now.setZone(state.tamaraTZ);
  const mNow = now.setZone(state.martinTZ);

  updateAnalog('clockTamara', tNow);
  updateAnalog('clockMartin', mNow);

  const ae = el('ampmEast');
  const aw = el('ampmWest');
  if(ae) ae.textContent = tNow.toFormat('a');
  if(aw) aw.textContent = mNow.toFormat('a');

  const todayISO = now.setZone(state.displayTZ).toISODate();
  const bounds = superDayBounds(todayISO, state.tamaraTZ, state.martinTZ);
  const startUTC = bounds.start.toUTC();
  const endUTC = bounds.end.toUTC();
  const durMs = endUTC.toMillis() - startUTC.toMillis();
  const elapsedMs = clamp(now.toUTC().toMillis() - startUTC.toMillis(), 0, durMs);

  el('sdTotal').textContent = durationToHHMMCeilHalfHour(durMs);
  el('sdElapsed').textContent = durationToHHMM(elapsedMs);

  const nHours = Math.max(0.5, ceilToHalfHourHours(durMs / 3600000));
  const q1 = roundHalfUp(nHours / 4);
  const q2 = roundHalfUp(nHours / 2);
  const q3 = roundHalfUp(3 * nHours / 4);

  const svgS = el('clockSuperday').querySelector('svg');
  if(svgS){
    const t12 = svgS.querySelector('#n12');
    const t3 = svgS.querySelector('#n3');
    const t6 = svgS.querySelector('#n6');
    const t9 = svgS.querySelector('#n9');
    if(t12) t12.textContent = '0';
    if(t3) t3.textContent = String(q1);
    if(t6) t6.textContent = String(q2);
    if(t9) t9.textContent = String(q3);
  }

  const frac = (durMs === 0) ? 0 : (elapsedMs / durMs);
  const hourAngle = frac * 360;

  const totalSec = Math.floor(elapsedMs / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;

  const minAngle = (min + sec / 60) * 6;
  const secAngle = sec * 6;

  const svg = el('clockSuperday').querySelector('svg');
  if(svg){
    rotate(svg.querySelector('#h'), hourAngle);
    rotate(svg.querySelector('#m'), minAngle);
    rotate(svg.querySelector('#s'), secAngle);
  }
}

function updateAnalog(hostId, dt){
  const svg = el(hostId).querySelector('svg');
  if(!svg) return;

  const h = svg.querySelector('#h');
  const m = svg.querySelector('#m');
  const s = svg.querySelector('#s');

  const hour = dt.hour % 12;
  const minute = dt.minute;
  const second = dt.second;

  rotate(h, (hour + minute / 60) * 30);
  rotate(m, (minute + second / 60) * 6);
  rotate(s, second * 6);
}

function ensureEastWestOrder(){
  const now = DateTime.now();
  const a = now.setZone(state.tamaraTZ);
  const b = now.setZone(state.martinTZ);

  if(a.offset === b.offset) return;

  if(a.offset < b.offset){
    const tmp = state.tamaraTZ;
    state.tamaraTZ = state.martinTZ;
    state.martinTZ = tmp;

    const iA = el('tzTamara');
    const iB = el('tzMartin');
    if(iA && iB){
      const t = iA.value;
      iA.value = iB.value;
      iB.value = t;
    }
  }
}

// ---------- Controls ----------
function bindControls(){
  el('viewSelect').addEventListener('change', (e)=>{
    state.view = e.target.value;
    const mode = el('jumpMode').value;
    const seo = canonicalSeoianDate(state.focusDateISO);
    el('jumpInput').value = (mode === 'gregorian') ? fmtGreg(state.focusDateISO) : (seo.canonical ? seo.label : '');
    render();
  });

  el('btnToday').addEventListener('click', ()=>{
    state.focusDateISO = DateTime.now().setZone(state.displayTZ).toISODate();
    render();
  });

  el('btnPrev').addEventListener('click', ()=>{
    if(state.view === 'month'){
      const seo = canonicalSeoianDate(state.focusDateISO);
      if(seo.canonical){
        let y = seo.year;
        let m = seo.canonical.monthNo - 1;
        if(m < 1){ m = 13; y = y - 1; }
        const r = getRangeForMonth(y, m);
        if(r){ state.focusDateISO = r.start; render(); return; }
      }
    }

    const dt = DateTime.fromISO(state.focusDateISO, {zone:state.displayTZ});
    const next = (state.view === 'week') ? dt.minus({weeks:1}) : dt.minus({days:30});
    state.focusDateISO = next.toISODate();
    render();
  });

  el('btnNext').addEventListener('click', ()=>{
    if(state.view === 'month'){
      const seo = canonicalSeoianDate(state.focusDateISO);
      if(seo.canonical){
        let y = seo.year;
        let m = seo.canonical.monthNo + 1;
        if(m > 13){ m = 1; y = y + 1; }
        const r = getRangeForMonth(y, m);
        if(r){ state.focusDateISO = r.start; render(); return; }
      }
    }

    const dt = DateTime.fromISO(state.focusDateISO, {zone:state.displayTZ});
    const next = (state.view === 'week') ? dt.plus({weeks:1}) : dt.plus({days:30});
    state.focusDateISO = next.toISODate();
    render();
  });

  el('toggleGregorian').addEventListener('change', ()=> render());

  el('displayTZ').addEventListener('change', (e)=>{
    state.displayTZ = e.target.value;
    render();
  });

  el('btnFilters').addEventListener('click', ()=>{
    const dd = el('filtersDropdown');
    dd.hidden = !dd.hidden;
  });

  document.addEventListener('click', (e)=>{
    const dd = el('filtersDropdown');
    const btn = el('btnFilters');
    if(dd.hidden) return;
    if(dd.contains(e.target) || btn.contains(e.target)) return;
    dd.hidden = true;
  });

  el('filterSupermonths').addEventListener('change', (e)=>{ state.filters.superMonths = e.target.checked; render(); });
  el('filterSpecialDays').addEventListener('change', (e)=>{ state.filters.specialDays = e.target.checked; render(); });
  el('filterStandardDays').addEventListener('change', (e)=>{ state.filters.standardDays = e.target.checked; render(); });
  el('filterOneOff').addEventListener('change', (e)=>{ state.filters.oneOff = e.target.checked; render(); });

  el('filterSupermonths').checked = state.filters.superMonths;
  el('filterSpecialDays').checked = state.filters.specialDays;
  el('filterStandardDays').checked = state.filters.standardDays;
  el('filterOneOff').checked = state.filters.oneOff;

  el('jumpInput').addEventListener('input', (e)=>{
    const mode = el('jumpMode').value;
    if(mode !== 'seoian' && mode !== 'gregorian') return;

    const raw = e.target.value.replace(/[^0-9]/g,'').slice(0,8);
    let out = '';

    if(raw.length >= 2) out += raw.slice(0,2) + '/';
    else out += raw;

    if(raw.length >= 4) out += raw.slice(2,4) + '/';
    else if(raw.length > 2) out += raw.slice(2);

    if(raw.length > 4) out += raw.slice(4);

    e.target.value = out;
  });

  el('jumpMode').addEventListener('change', ()=>{
    el('jumpInput').value = '';
    el('jumpInput').placeholder = 'DD/MM/YYYY';
  });

  el('btnJump').addEventListener('click', ()=>{
    const mode = el('jumpMode').value;
    const val = el('jumpInput').value;

    if(mode === 'gregorian'){
      const iso = dateISOFromDMY(val);
      if(!iso) return alert('Invalid Gregorian date (DD/MM/YYYY).');
      state.focusDateISO = iso;
      render();
      return;
    }

    const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(!m) return alert('Invalid Seoian date (DD/MM/YYYY).');

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);

    const iso = gregorianFromSeoian(dd, mm, yyyy);
    if(!iso) return alert('Seoian date out of range for that SuperMonth.');

    state.focusDateISO = iso;
    render();
  });

  el('tzTamara').addEventListener('change', (e)=>{
    state.tamaraTZ = e.target.value || DEFAULTS.tamaraTZ;
    ensureEastWestOrder();
  });

  el('tzMartin').addEventListener('change', (e)=>{
    state.martinTZ = e.target.value || DEFAULTS.martinTZ;
    ensureEastWestOrder();
  });

  const sheet = el('bottomSheet');
  el('sheetHandle').addEventListener('click', ()=>{
    sheet.classList.toggle('expanded');
    el('sheetHandle').querySelector('.sheet-handle-icon').textContent = sheet.classList.contains('expanded') ? '▾' : '▴';
  });

  sheet.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      sheet.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      sheet.querySelectorAll('.sheet-pane').forEach(p=>p.classList.remove('active'));
      el(tab === 'inspector' ? 'sheetInspector' : 'sheetClocks').classList.add('active');
    });
  });
}

// ---------- Boot ----------
async function loadData(){
  const cfgRes = await fetch('./data/supermonths_config.json');
  const rangesRes = await fetch('./data/supermonths_ranges_fallback.json');
  const daysRes = await fetch('./data/AFdS_Special_Days.csv');
  const silentRes = await fetch('./data/AFdS_Silent_Sounds.csv');

  let setDaySongsRes = null;
  try{ setDaySongsRes = await fetch('./data/Set_Day_Songs.json'); }catch(e){ setDaySongsRes = null; }

  let oneOffRes = null;
  try{ oneOffRes = await fetch('./data/AFdS_OneOff_StarSystems.csv'); }catch(e){ oneOffRes = null; }

  let miavigRes = null;
  try{ miavigRes = await fetch('./data/AFdS_MiAViG.csv'); }catch(e){ miavigRes = null; }

  state.data.config = await cfgRes.json();
  state.data.ranges = await rangesRes.json();

  const idx = buildRangesIndex(state.data.ranges);
  state.data.rangesBySeoYear = idx.byYear;
  state.data.monthNoByName = idx.monthNoByName;
  state.data.nameByMonthNo = idx.nameByMonthNo;

  const raw = parseCSV(await daysRes.text());

  const silentText = await silentRes.text();
  const silentRaw = parseCSV(silentText);

  const silentSounds = [];
  for(const r of silentRaw){
    const url = pickField(r, ['Spotify URL', 'Spotify_URL', 'spotify_url', 'URL', 'Url', 'url']);
    const title = pickField(r, ['Song Title', 'Song_Title', 'title', 'Title']);
    const artists = pickField(r, ['Artists', 'Artist', 'artists', 'artist']);

    if(!url) continue;

    silentSounds.push({
      url,
      title: title || 'Spotify Track',
      artists: artists || ''
    });
  }

  state.data.silentSounds = silentSounds;

  const overflowText = await fetchTextFirstAvailable([
    './Data/AFdS_Overflow.csv',
    './data/AFdS_Overflow.csv'
  ]);
  const overflowRaw = parseCSV(overflowText);

  const overflowSounds = [];
  for(const r of overflowRaw){
    const url = pickField(r, ['Spotify URL', 'Spotify_URL', 'spotify_url', 'URL', 'Url', 'url']);
    const title = pickField(r, ['Song Title', 'Song_Title', 'title', 'Title']);
    const artists = pickField(r, ['Artists', 'Artist', 'artists', 'artist']);

    if(!url) continue;

    overflowSounds.push({
      url,
      title: title || 'Spotify Track',
      artists: artists || ''
    });
  }

  state.data.overflowSounds = overflowSounds;

  let setDaySongsRaw = null;
  if(setDaySongsRes && setDaySongsRes.ok){
    setDaySongsRaw = await setDaySongsRes.json();
  }

  state.data.setDaySongs = buildSetDaySongsIndex(setDaySongsRaw);

  let oneOffRaw = [];
  if(oneOffRes && oneOffRes.ok) oneOffRaw = oneOffRaw.concat(parseCSV(await oneOffRes.text()));
  if(miavigRes && miavigRes.ok) oneOffRaw = oneOffRaw.concat(parseCSV(await miavigRes.text()));

  const syByKey = new Map();
  const gyDefs = [];
  const oneOffDefs = [];

  for(const r of raw){
    const id = r.ID || r.id || '';
    const title = r.Title || r.title || '';
    if(!id || !title) continue;

    const anchorType = (r.Anchor_Type || r.anchor_type || 'SY').toUpperCase();
    const category = (r.Category || r.category || '').trim() || (anchorType === 'SY' ? 'Special' : 'Standard');

    const originGregorianStr = r.Origin_Gregorian_Date || r.origin_gregorian_date || '';
    const endGregorianStr = r.End_Gregorian_Date || r.end_gregorian_date || '';

    const originMD = parseMonthDayFlexible(originGregorianStr);
    const endMD = parseMonthDayFlexible(endGregorianStr);

    const def = {
      id,
      title,
      notes: r.Notes || r.notes || '',
      allDay: toBoolDefault(r.All_Day ?? r.all_day, true),
      anchorType,
      category,
      rank: toInt(r.Rank ?? r.rank, isSpecialCategory(category) ? 1 : isStandardCategory(category) ? 2 : 3),
      sequence: toInt(r.Sequence ?? r.sequence, 9999),

      showOnCalendar: toBoolDefault(r.ShowOnCalendar, true),
      showInInspector: toBoolDefault(r.ShowInInspector, true),
      showNotesOnCalendar: toBoolDefault(r.ShowNotesOnCalendar, false),

      syMonth: toInt(r.SY_Month ?? r.sy_month, null),
      syDay: toInt(r.SY_Day ?? r.sy_day, null),
      syStartYear: toInt(r.SY_Start_Year ?? r.sy_year_start, 1),

      gregStartYear: toInt(
        r.Gregorian_Start_Year ?? r.Gregorian_First_Year ?? r.Gergorian_First_Year ?? r.gregorian_start_year ?? r.gregorian_first_year,
        1994
      ),
      gyMonth: toInt(r.GY_Month ?? r.gy_month, originMD.month),
      gyDay: toInt(r.GY_Day ?? r.gy_day, originMD.day),
      nth: toInt(r.Nth ?? r.nth, null),
      weekday: toInt(r.Weekday ?? r.weekday, null),
      offsetDays: toInt(r.Offset_Days ?? r.offset_days, 0),

      endMonth: endMD.month,
      endDay: endMD.day,
    };

    if(anchorType === 'SY'){
      if(!def.syMonth || !def.syDay) continue;
      const key = `${def.syMonth}-${def.syDay}`;
      if(!syByKey.has(key)) syByKey.set(key, []);
      syByKey.get(key).push(def);
    }else{
      gyDefs.push(def);
    }
  }

  for(const r of oneOffRaw){
    const id = r.ID || r.id || r['\ufeffID'] || '';
    const title = r.Title || r.title || '';
    if(!id || !title) continue;

    const anchorType = (r.Anchor_Type || r.anchor_type || 'GY_ONEOFF').toUpperCase();
    if(anchorType !== 'GY_ONEOFF') continue;

    const originTZ = String(r.Origin_TZ || r.origin_tz || 'America/Toronto').trim() || 'America/Toronto';
    const originStr = r.Origin_Gregorian_Date || r.origin_gregorian_date || '';
    const dtOrigin = parseDateTimeFlexible(originStr, originTZ);
    if(!dtOrigin || !dtOrigin.isValid) continue;

    const endStr = r.End_Gregorian_Date || r.end_gregorian_date || '';
    const endTZ = String(r.End_TZ || r.end_tz || originTZ).trim() || originTZ;
    const dtEnd = endStr ? parseDateTimeFlexible(endStr, endTZ) : null;

    const durMin = toInt(r.Duration_Minutes ?? r.duration_minutes, 30) ?? 30;

    const startUtcMs = dtOrigin.toUTC().toMillis();
    let endUtcMs;

    if(dtEnd && dtEnd.isValid){
      endUtcMs = dtEnd.toUTC().toMillis();
      if(endUtcMs <= startUtcMs) continue;
    }else{
      endUtcMs = dtOrigin.plus({minutes: durMin}).toUTC().toMillis();
    }

    const category = (r.Category || r.category || 'OneOFF').trim() || 'OneOFF';

    oneOffDefs.push({
      id,
      title,
      notes: r.Notes || r.notes || '',
      anchorType,
      category,
      rank: toInt(r.Rank ?? r.rank, 3),
      sequence: toInt(r.Sequence ?? r.sequence, 9999),

      allDay: toBoolDefault(r.All_Day ?? r.all_day, false),

      showOnCalendar: toBoolDefault(r.ShowOnCalendar, true),
      showInInspector: toBoolDefault(r.ShowInInspector, true),
      showNotesOnCalendar: toBoolDefault(r.ShowNotesOnCalendar, false),

      startUtcMs,
      endUtcMs,
      durationMinutes: Math.round((endUtcMs - startUtcMs) / 60000),
      originTZ,
      endTZ
    });
  }

  for(const [, arr] of syByKey.entries()){
    arr.sort((a,b)=> (a.rank - b.rank) || (a.sequence - b.sequence) || a.title.localeCompare(b.title));
  }

  gyDefs.sort((a,b)=> (a.rank - b.rank) || (a.sequence - b.sequence) || a.title.localeCompare(b.title));

  state.data.syByKey = syByKey;
  state.data.gyDefs = gyDefs;
  state.data.oneOffDefs = oneOffDefs;
  state.data.overflowSlotOrder = buildOverflowSlotOrder();
}

(async function init(){
  setUpTZList();
  bindControls();
  await loadData();
  ensureEastWestOrder();
  mountClocks();
  snapshotDay(DateTime.now().setZone(state.displayTZ).toISODate());
  tickClocks();
  setInterval(tickClocks, 1000);
})();
