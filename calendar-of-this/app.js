
const { DateTime, Interval } = luxon;

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
  focusDateISO: DateTime.now().toISODate(), // date label used for navigation
  filters: { superMonths: true },
  tamaraTZ: DEFAULTS.tamaraTZ,
  martinTZ: DEFAULTS.martinTZ,
  snapshot: null, // {dateISO, seoianLabel, gregorianLabel, periods[], facts{...}, tzAtSnapshot{...}}
  highlightDateISO: null,
  data: {
    config: null,
    ranges: null,
    rangesBySeoYear: null,
    monthNoByName: null,
    nameByMonthNo: null,
  }
};

// ---------- Utilities ----------
function pad2(n){ return String(n).padStart(2,'0'); }
function fmtGreg(dateISO){
  const [y,m,d]=dateISO.split('-').map(Number);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

function seoianYearForGregorian(dateISO){
  const [y,m,d]=dateISO.split('-').map(Number);
  if (m>1 || (m===1 && d>=19)) return y - 1993;
  return y - 1994;
}

function dateISOFromDMY(dmy){
  const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if(!m) return null;
  const d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
  const dt = DateTime.fromObject({year:y, month:mo, day:d}, {zone:'UTC'});
  if(!dt.isValid) return null;
  return dt.toISODate();
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function roundHalfUp(x){ return Math.floor(x + 0.5); }

function isSameOffsetZone(aZone, bZone, dateISO){
  const a = DateTime.fromISO(dateISO, {zone:aZone}).startOf('day');
  const b = DateTime.fromISO(dateISO, {zone:bZone}).startOf('day');
  return a.offset === b.offset;
}

function eastWestZones(dateISO, tzA, tzB){
  if (tzA === tzB) return { east: tzA, west: tzA, same:true };
  const a = DateTime.fromISO(dateISO, {zone:tzA}).startOf('day');
  const b = DateTime.fromISO(dateISO, {zone:tzB}).startOf('day');
  if (a.offset === b.offset) return { east: tzA, west: tzA, same:true }; // treat as same per spec
  return (a.offset > b.offset) ? { east: tzA, west: tzB, same:false } : { east: tzB, west: tzA, same:false };
}

function superDayBounds(dateISO, tzA, tzB){
  const { east, west, same } = eastWestZones(dateISO, tzA, tzB);
  const start = DateTime.fromISO(dateISO, {zone:east}).startOf('day');
  const end = DateTime.fromISO(dateISO, {zone:west}).endOf('day');
  const durMs = end.toUTC().toMillis() - start.toUTC().toMillis();
  return { dateISO, east, west, same, start, end, durMs };
}

function durationToHHMM(ms){
  const totalMin = Math.floor(ms/60000);
  const h = Math.floor(totalMin/60);
  const m = totalMin%60;
  return `${h}:${pad2(m)}`;
}

function ceilToHalfHourHours(hours){
  return Math.ceil(hours*2)/2;
}

function durationToHHMMCeilHalfHour(ms){
  const totalMin = ms/60000;
  const roundedMin = Math.ceil(totalMin/30)*30;
  const h = Math.floor(roundedMin/60);
  const m = roundedMin%60;
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
  // sort each year by start
  for(const [k, arr] of byYear.entries()){
    arr.sort((a,b)=>a.start.localeCompare(b.start));
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
    // Before calendar start or out of range
    return { label: '—', year: sy, monthNo: null, day: null, canonical: null, active: [] };
  }
  // canonical = most recently started month
  const canonical = act.reduce((best, cur) => (cur.start > best.start ? cur : best), act[0]);
  const day = DateTime.fromISO(dateISO, {zone:'UTC'}).diff(DateTime.fromISO(canonical.start, {zone:'UTC'}), 'days').days + 1;
  const dayInt = Math.floor(day + 1e-9);
  const label = `${pad2(dayInt)}/${pad2(canonical.monthNo)}/${String(sy).padStart(4,'0')}`;
  return { label, year: sy, monthNo: canonical.monthNo, day: dayInt, canonical, active: act };
}

function gregorianFromSeoian(dd, mm, yyyy){
  // Find the month start for this Seoian year and month number from ranges (fallback dataset)
  const arr = state.data.rangesBySeoYear.get(yyyy) || [];
  const r = arr.find(x => x.monthNo === mm);
  if(!r) return null;
  const start = DateTime.fromISO(r.start, {zone:'UTC'});
  const target = start.plus({days: dd-1});
  // Validate within month end
  if(target.toISODate() > r.end) return null;
  return target.toISODate();
}

// ---------- Rendering ----------
const el = (id)=>document.getElementById(id);

function setUpTZList(){
  let zones = [];
  try{
    zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [];
  }catch(e){ zones = []; }
  if(!zones || zones.length === 0){
    zones = [DEFAULTS.tamaraTZ, DEFAULTS.martinTZ, 'America/Toronto', 'UTC', 'Europe/London', 'Asia/Tokyo'];
  }

  const fillSelect = (sel, currentVal)=>{
    if(!sel) return;
    sel.innerHTML = '';
    const frag = document.createDocumentFragment();
    for(const z of zones){
      const opt = document.createElement('option');
      opt.value = z;
      opt.textContent = z;
      frag.appendChild(opt);
    }
    sel.appendChild(frag);
    sel.value = currentVal;
    if(!sel.value){
      sel.value = zones.includes(DEFAULTS.tamaraTZ) ? DEFAULTS.tamaraTZ : zones[0];
    }
  };

  fillSelect(el('tzTamara'), state.tamaraTZ);
  fillSelect(el('tzMartin'), state.martinTZ);

  // Display TZ selector
  const displaySel = el('displayTZ');
  displaySel.innerHTML = '';
  for(const z of zones){
    const opt = document.createElement('option');
    opt.value = z;
    opt.textContent = z;
    if(z === state.displayTZ) opt.selected = true;
    displaySel.appendChild(opt);
  }

  // enforce East/West order in UI after population
  ensureEastWestOrder();
}

function render(){
  const seo = canonicalSeoianDate(state.focusDateISO);
  if(seo.canonical){
    el('calTitle').textContent = `${seo.canonical.monthName}, ${String(seo.year).padStart(4,'0')}`;
  }else{
    el('calTitle').textContent = monthTitle(state.focusDateISO, state.displayTZ);
  }
  renderCenter();
  renderInspector(); // snapshot display only, no recompute
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
  const rangeEndISO = monthSeo.canonical ? monthSeo.canonical.end : dt.endOf('month').toISODate();
  const start = startOfWeekSunday(DateTime.fromISO(rangeStartISO, {zone: state.displayTZ}));
  const end = endOfWeekSaturday(DateTime.fromISO(rangeEndISO, {zone: state.displayTZ}));
  let cursor = start;

  while(cursor <= end){
    const weekStart = cursor;
    const days = [];
    for(let i=0;i<7;i++){
      days.push(cursor.plus({days:i}));
    }

    const weekEl = document.createElement('div');
    weekEl.className = 'week';

    // Bars
    const barsEl = document.createElement('div');
    barsEl.className = 'week-bars';

    const weekStartISO = weekStart.setZone(state.displayTZ).toISODate();
    const weekEndISO = weekStart.plus({days:6}).setZone(state.displayTZ).toISODate();

    const events = state.filters.superMonths ? collectEventsForRange(weekStartISO, weekEndISO) : [];
    const { placed, hiddenByDay } = placeEventsInWeek(events, weekStartISO, weekEndISO, 3);

    for(const p of placed){
      const bar = document.createElement('div');
      bar.className = 'bar' + (p.lane === 1 ? ' secondary' : '');
      bar.style.gridColumn = `${p.colStart} / ${p.colEnd+1}`;
      bar.style.gridRow = `${p.lane+1}`;
      bar.textContent = p.label;
      bar.title = p.label;
      barsEl.appendChild(bar);
    }

    weekEl.appendChild(barsEl);

    // Days
    const daysEl = document.createElement('div');
    daysEl.className = 'week-days';

    for(let i=0;i<7;i++){
      const dayDT = weekStart.plus({days:i}).setZone(state.displayTZ);
      const dateISO = dayDT.toISODate();

      const day = document.createElement('div');
      day.className = 'day';
      day.dataset.date = dateISO;

      // today marker in Display TZ
      const todayISO = DateTime.now().setZone(state.displayTZ).toISODate();
      if(dateISO === todayISO) day.classList.add('today');
      if(state.highlightDateISO && dateISO === state.highlightDateISO) day.classList.add('highlight');
      // De-emphasize days outside the current SuperMonth range (when Month view is SuperMonth-based)
      if(monthSeo.canonical){
        const inRange = (dateISO >= rangeStartISO && dateISO <= rangeEndISO);
        if(!inRange) day.classList.add('outside');
      }

      const seo = canonicalSeoianDate(dateISO);
      const sd = document.createElement('div');
      sd.className = 'sd';
      sd.textContent = seo.label === '—' ? '' : seo.label;
      day.appendChild(sd);

      const g = document.createElement('div');
      g.className = 'g';
      g.textContent = dayDT.day;
      // show small gregorian day number always in grid (matches examples)
      day.appendChild(g);

      const hiddenCount = hiddenByDay.get(dateISO) || 0;
      if(hiddenCount > 0){
        const more = document.createElement('div');
        more.className = 'more';
        more.textContent = `+${hiddenCount} more`;
        more.addEventListener('click', (ev)=>{
          ev.stopPropagation();
          openMorePopover(ev.clientX, ev.clientY, dateISO);
        });
        day.appendChild(more);
      }

      // hover/tap snapshot behavior
      day.addEventListener('mouseenter', ()=>{
        if(window.matchMedia('(max-width: 1040px)').matches) return;
        snapshotDay(dateISO);
      });
      day.addEventListener('click', ()=>{
        snapshotDay(dateISO);
      });

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

  // Header aligned to time grid
  const header = document.createElement('div');
  header.className = 'week-dow';
  const spacer = document.createElement('div');
  spacer.className = 'week-dow-spacer';
  header.appendChild(spacer);

  const showGreg = el('toggleGregorian').checked;
  for(let i=0;i<7;i++){
    const d = dt.plus({days:i});
    const dateISO = d.toISODate();
    const seo = canonicalSeoianDate(dateISO);

    const cell = document.createElement('div');
    cell.className = 'week-dow-cell';

    const main = document.createElement('div');
    main.className = 'week-dow-main';
    main.textContent = seo.canonical ? `${DOW[i]} ${seo.label}` : `${DOW[i]}`;
    cell.appendChild(main);

    if(showGreg){
      const sub = document.createElement('div');
      sub.className = 'week-dow-sub';
      sub.textContent = d.toFormat('d/L/yyyy');
      cell.appendChild(sub);
    }

    header.appendChild(cell);
  }
  wrap.appendChild(header);

  const weekStartISO = dt.toISODate();
  const weekEndISO = dt.plus({days:6}).toISODate();

  // All-day bars (SuperMonths)
  const barsEl = document.createElement('div');
  barsEl.className = 'week-bars';
  const events = state.filters.superMonths ? collectEventsForRange(weekStartISO, weekEndISO) : [];
  const { placed } = placeEventsInWeek(events, weekStartISO, weekEndISO, 5);
  for(const p of placed){
    const bar = document.createElement('div');
    bar.className = 'bar' + (p.lane === 1 ? ' secondary' : '');
    bar.style.gridColumn = `${p.colStart} / ${p.colEnd+1}`;
    bar.style.gridRow = `${p.lane+1}`;
    bar.textContent = p.label;
    barsEl.appendChild(bar);
  }
  wrap.appendChild(barsEl);

  // Time grid: 00:00 → 23:00 + SuperDay overflow hours beyond 24 if applicable
  const bounds = superDayBounds(state.focusDateISO, state.tamaraTZ, state.martinTZ);
  const durMs = bounds.end.toUTC().toMillis() - bounds.start.toUTC().toMillis();
  const nHoursRounded = ceilToHalfHourHours(durMs / 3600000);
  const totalHourRows = Math.max(24, Math.ceil(nHoursRounded));

  const grid = document.createElement('div');
  grid.className = 'week-grid';

  for(let h=0; h<totalHourRows; h++){
    const lbl = document.createElement('div');
    lbl.className = 'time-label' + (h>=24 ? ' overflow' : '');
    lbl.textContent = `${String(h).padStart(2,'0')}:00`;
    grid.appendChild(lbl);

    for(let d=0; d<7; d++){
      const cell = document.createElement('div');
      cell.className = 'week-cell';
      grid.appendChild(cell);
    }
  }

  wrap.appendChild(grid);
  return wrap;
}

function renderListView(){
  const wrap = document.createElement('div');
  wrap.style.padding='12px';
  wrap.style.display='flex';
  wrap.style.flexDirection='column';
  wrap.style.gap='10px';

  // list window: 30 days around focus date
  const focus = DateTime.fromISO(state.focusDateISO, {zone:state.displayTZ});
  const start = focus.startOf('day').minus({days:3});
  const end = focus.startOf('day').plus({days:26});

  for(let i=0;i<=end.diff(start,'days').days;i++){
    const d = start.plus({days:i});
    const dateISO = d.toISODate();
    const seo = canonicalSeoianDate(dateISO);
    const active = state.filters.superMonths ? activeSuperMonths(dateISO) : [];

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

    if(active.length===0){
      const row = document.createElement('div');
      row.className='muted small';
      row.textContent='(no periods)';
      items.appendChild(row);
    }else{
      for(const a of active.sort((x,y)=>x.monthNo-y.monthNo)){
        const row = document.createElement('div');
        row.textContent = a.monthName;
        row.style.fontSize='13px';
        items.appendChild(row);
      }
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
function collectEventsForRange(rangeStartISO, rangeEndISO){
  const syStart = seoianYearForGregorian(rangeStartISO);
  const syEnd = seoianYearForGregorian(rangeEndISO);
  const years = new Set([syStart, syEnd]);
  const events = [];
  for(const y of years){
    const arr = state.data.rangesBySeoYear.get(y) || [];
    for(const r of arr){
      // overlap test
      if(r.end < rangeStartISO || r.start > rangeEndISO) continue;
      events.push({
        id: `${r.seoianYear}-${r.monthNo}`,
        label: r.monthName,
        start: r.start,
        end: r.end,
        monthNo: r.monthNo
      });
    }
  }
  // stable sort by start then duration
  events.sort((a,b)=> a.start.localeCompare(b.start) || (b.end.localeCompare(a.end)));
  return events;
}

function placeEventsInWeek(events, weekStartISO, weekEndISO, maxLanes){
  const placed = [];
  const hiddenByDay = new Map();

  // Per lane: track occupied day columns in [0..6]
  const lanes = Array.from({length: maxLanes}, ()=> Array(7).fill(false));

  function dayIndex(dateISO){
    const dt = DateTime.fromISO(dateISO, {zone:state.displayTZ});
    const ws = DateTime.fromISO(weekStartISO, {zone:state.displayTZ});
    return Math.round(dt.diff(ws,'days').days);
  }

  for(const ev of events){
    const segStart = ev.start < weekStartISO ? weekStartISO : ev.start;
    const segEnd = ev.end > weekEndISO ? weekEndISO : ev.end;
    const cStart = clamp(dayIndex(segStart), 0, 6);
    const cEnd = clamp(dayIndex(segEnd), 0, 6);

    // Find lane
    let lane = -1;
    for(let l=0;l<maxLanes;l++){
      let ok=true;
      for(let c=cStart;c<=cEnd;c++){
        if(lanes[l][c]) { ok=false; break; }
      }
      if(ok){ lane=l; break; }
    }

    if(lane>=0){
      for(let c=cStart;c<=cEnd;c++) lanes[lane][c]=true;
      placed.push({ ...ev, lane, colStart:cStart+1, colEnd:cEnd+1 });
    }else{
      // mark hidden counts per day in segment
      for(let c=cStart;c<=cEnd;c++){
        const dISO = DateTime.fromISO(weekStartISO, {zone:state.displayTZ}).plus({days:c}).toISODate();
        hiddenByDay.set(dISO, (hiddenByDay.get(dISO)||0)+1);
      }
    }
  }

  return { placed, hiddenByDay };
}

// ---------- Snapshot: Day Inspector ----------
function snapshotDay(dateISO){
  const seo = canonicalSeoianDate(dateISO);
  const periods = activeSuperMonths(dateISO).sort((a,b)=>a.monthNo-b.monthNo).map(p=>p.monthName);
  const facts = superDayBounds(dateISO, state.tamaraTZ, state.martinTZ);

  state.snapshot = {
    dateISO,
    seoianLabel: seo.label,
    gregorianLabel: fmtGreg(dateISO),
    periods,
    facts: {
      east: facts.east,
      west: facts.west,
      start: facts.start.toFormat('ccc dd LLL yyyy HH:mm'),
      end: facts.end.toFormat('ccc dd LLL yyyy HH:mm'),
      length: durationToHHMM(facts.durMs),
    },
    tzAtSnapshot: { tamaraTZ: state.tamaraTZ, martinTZ: state.martinTZ }
  };
  state.highlightDateISO = dateISO;
  // update handle text for mobile
  el('sheetHandleText').textContent = seo.label === '—' ? '—' : seo.label;
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

  el('inspectorSeoian').textContent = snap.seoianLabel;
  el('inspectorGregorian').textContent = snap.gregorianLabel;

  // periods
  const p = el('inspectorPeriods');
  p.innerHTML = '';
  if(snap.periods.length === 0){
    p.innerHTML = '<div class="muted">(no periods)</div>';
  }else{
    for(const item of snap.periods){
      const div = document.createElement('div');
      div.className = 'pill';
      div.textContent = item;
      p.appendChild(div);
    }
  }

  // facts
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
    r.appendChild(a); r.appendChild(b);
    f.appendChild(r);
  }
}

function renderMobileSheetMirrors(){
  // Copy inspector content into sheet panes for mobile
  const ins = el('sheetInspector');
  const clk = el('sheetClocks');
  ins.innerHTML = '';
  clk.innerHTML = '';

  // Clone inspector panel content
  const cloneInspector = el('leftPanel').querySelector('.panel-inner').cloneNode(true);
  ins.appendChild(cloneInspector);

  // Clone clocks panel content
  const cloneClocks = el('rightPanel').querySelector('.panel-inner').cloneNode(true);
  clk.appendChild(cloneClocks);
}

// ---------- +more popover ----------
function openMorePopover(x,y,dateISO){
  const pop = el('morePopover');
  pop.innerHTML = '';
  pop.hidden = false;

  const seo = canonicalSeoianDate(dateISO);
  const title = document.createElement('div');
  title.className='pop-title';
  title.textContent = `${seo.label} (${fmtGreg(dateISO)})`;
  pop.appendChild(title);

  const close = document.createElement('div');
  close.className='pop-close';
  close.textContent='✕';
  close.addEventListener('click', ()=>{ pop.hidden=true; });
  pop.appendChild(close);

  const items = activeSuperMonths(dateISO).sort((a,b)=>a.monthNo-b.monthNo);
  for(const it of items){
    const div = document.createElement('div');
    div.className='pop-item';
    div.textContent = it.monthName;
    pop.appendChild(div);
  }

  const rect = pop.getBoundingClientRect();
  const left = clamp(x - rect.width/2, 12, window.innerWidth - rect.width - 12);
  const top = clamp(y + 12, 60, window.innerHeight - rect.height - 12);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

window.addEventListener('click', (e)=>{
  const pop = el('morePopover');
  if(pop.hidden) return;
  if(!pop.contains(e.target) && !(e.target.classList && e.target.classList.contains('more'))){
    pop.hidden = true;
  }
});

// ---------- Clocks (SVG) ----------
function makeClockSVG(kind='normal'){
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 200 200');
  svg.setAttribute('width','92%');
  svg.setAttribute('height','92%');

  const face=document.createElementNS(ns,'circle');
  face.setAttribute('cx','100'); face.setAttribute('cy','100'); face.setAttribute('r','92');
  face.setAttribute('fill','#fff');
  face.setAttribute('stroke','#e6e7ea');
  face.setAttribute('stroke-width','2');
  svg.appendChild(face);

  // ticks
  for(let i=0;i<60;i++){
    const tick=document.createElementNS(ns,'line');
    const a=(Math.PI*2*i)/60;
    const r1 = (i%5===0)?78:84;
    const r2 = 90;
    const x1=100+Math.sin(a)*r1;
    const y1=100-Math.cos(a)*r1;
    const x2=100+Math.sin(a)*r2;
    const y2=100-Math.cos(a)*r2;
    tick.setAttribute('x1',x1); tick.setAttribute('y1',y1);
    tick.setAttribute('x2',x2); tick.setAttribute('y2',y2);
    tick.setAttribute('stroke', (i%5===0)?'#cfd3da':'#e6e7ea');
    tick.setAttribute('stroke-width', (i%5===0)?2:1);
    svg.appendChild(tick);
  }

  // numeral helpers
  function addText(id, txt, x, y){
    const t=document.createElementNS(ns,'text');
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
    // placeholders updated at runtime based on N-hour SuperDay
    addText('n12','0',100,34);
    addText('n3','',166,102);
    addText('n6','',100,170);
    addText('n9','',34,102);
  }

  const hour=document.createElementNS(ns,'line');
  hour.setAttribute('x1','100'); hour.setAttribute('y1','100');
  hour.setAttribute('x2','100'); hour.setAttribute('y2','54');
  hour.setAttribute('stroke','#111318');
  hour.setAttribute('stroke-width','5');
  hour.setAttribute('stroke-linecap','round');
  hour.id='h';
  svg.appendChild(hour);

  const minute=document.createElementNS(ns,'line');
  minute.setAttribute('x1','100'); minute.setAttribute('y1','100');
  minute.setAttribute('x2','100'); minute.setAttribute('y2','34');
  minute.setAttribute('stroke','#111318');
  minute.setAttribute('stroke-width','3');
  minute.setAttribute('stroke-linecap','round');
  minute.id='m';
  svg.appendChild(minute);

  const second=document.createElementNS(ns,'line');
  second.setAttribute('x1','100'); second.setAttribute('y1','108');
  second.setAttribute('x2','100'); second.setAttribute('y2','24');
  second.setAttribute('stroke','#1b6b6f');
  second.setAttribute('stroke-width','2');
  second.setAttribute('stroke-linecap','round');
  second.id='s';
  svg.appendChild(second);

  const dot=document.createElementNS(ns,'circle');
  dot.setAttribute('cx','100'); dot.setAttribute('cy','100'); dot.setAttribute('r','5');
  dot.setAttribute('fill','#1b6b6f');
  svg.appendChild(dot);

  return svg;
}

function rotate(el, deg){
  el.setAttribute('transform', `rotate(${deg} 100 100)`);
}

function mountClocks(){
  const hostT = el('clockTamara');
  hostT.innerHTML='';
  hostT.appendChild(makeClockSVG('normal'));

  const hostM = el('clockMartin');
  hostM.innerHTML='';
  hostM.appendChild(makeClockSVG('normal'));

  const hostS = el('clockSuperday');
  hostS.innerHTML='';
  hostS.appendChild(makeClockSVG('superday'));
}

function tickClocks(){
  ensureEastWestOrder();
  const now = DateTime.now();

  // Top/bottom
  const tZone = state.tamaraTZ;
  const mZone = state.martinTZ;

  const tNow = now.setZone(tZone);
  const mNow = now.setZone(mZone);

  updateAnalog('clockTamara', tNow);
  updateAnalog('clockMartin', mNow);

  // AM/PM indicators
  const ae = el('ampmEast');
  const aw = el('ampmWest');
  if(ae) ae.textContent = tNow.toFormat('a');
  if(aw) aw.textContent = mNow.toFormat('a');

  // SuperDay: use date label of today in Display TZ
  const todayISO = now.setZone(state.displayTZ).toISODate();
  const bounds = superDayBounds(todayISO, state.tamaraTZ, state.martinTZ);
  const startUTC = bounds.start.toUTC();
  const endUTC = bounds.end.toUTC();
  const durMs = endUTC.toMillis() - startUTC.toMillis();
  const elapsedMs = clamp(now.toUTC().toMillis() - startUTC.toMillis(), 0, durMs);

  el('sdTotal').textContent = durationToHHMMCeilHalfHour(durMs);
  el('sdElapsed').textContent = durationToHHMM(elapsedMs);


  // Update SuperDay dial numerals as an N-hour clock face (cardinal points)
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

  // SuperDay hands (analog feel without lying to the maths):
  // - Hour hand: one full rotation per SuperDay
  // - Minute/second hands: conventional minute/second within the SuperDay hour
  const frac = (durMs===0)?0:(elapsedMs/durMs);
  const hourAngle = frac * 360;

  const totalSec = Math.floor(elapsedMs/1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec/60);
  const min = totalMin % 60;

  const minAngle = (min + sec/60) * 6;
  const secAngle = sec * 6;

  const svg = el('clockSuperday').querySelector('svg');
  if(svg){
    const h=svg.querySelector('#h');
    const m=svg.querySelector('#m');
    const s=svg.querySelector('#s');
    rotate(h, hourAngle);
    rotate(m, minAngle);
    rotate(s, secAngle);
  }
}

function updateAnalog(hostId, dt){
  const svg = el(hostId).querySelector('svg');
  if(!svg) return;
  const h=svg.querySelector('#h');
  const m=svg.querySelector('#m');
  const s=svg.querySelector('#s');

  const hour = dt.hour % 12;
  const minute = dt.minute;
  const second = dt.second;

  const hAngle = (hour + minute/60) * 30; // 360/12
  const mAngle = (minute + second/60) * 6; // 360/60
  const sAngle = second * 6;

  rotate(h, hAngle);
  rotate(m, mAngle);
  rotate(s, sAngle);
}

function ensureEastWestOrder(){
  // Ensure state.tamaraTZ is the more easterly (higher UTC offset) at the current instant.
  // This keeps the top clock as Eastern TZ and the bottom clock as Western TZ.
  const now = DateTime.now();
  const a = now.setZone(state.tamaraTZ);
  const b = now.setZone(state.martinTZ);
  if(a.offset === b.offset) return; // treat as same
  if(a.offset < b.offset){
    // swap
    const tmp = state.tamaraTZ;
    state.tamaraTZ = state.martinTZ;
    state.martinTZ = tmp;
    // reflect swap in inputs if they exist
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
    // Reset Jump input to reflect the currently shown date (prevents stale mismatch).
    const mode = el('jumpMode').value;
    const seo = canonicalSeoianDate(state.focusDateISO);
    el('jumpInput').value = (mode === 'gregorian') ? fmtGreg(state.focusDateISO) : (seo.canonical ? seo.label : '');
    render();
  });

  el('btnToday').addEventListener('click', ()=>{
    const todayISO = DateTime.now().setZone(state.displayTZ).toISODate();
    state.focusDateISO = todayISO;
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

  el('toggleGregorian').addEventListener('change', ()=>{
    render();
  });

  el('displayTZ').addEventListener('change', (e)=>{
    state.displayTZ = e.target.value;
    render();
  });

  el('btnFilters').addEventListener('click', (e)=>{
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

  el('filterSupermonths').addEventListener('change', (e)=>{
    state.filters.superMonths = e.target.checked;
    render();
  });

  // Jump input: auto slashes
  el('jumpInput').addEventListener('input', (e)=>{
    const mode = el('jumpMode').value;
    if(mode !== 'seoian' && mode !== 'gregorian') return;
    const raw = e.target.value.replace(/[^0-9]/g,'').slice(0,8);
    let out = '';
    if(raw.length>=2) out += raw.slice(0,2) + '/';
    else out += raw;
    if(raw.length>=4) out += raw.slice(2,4) + '/';
    else if(raw.length>2) out += raw.slice(2);
    if(raw.length>4) out += raw.slice(4);
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
    // Seoian
    const m = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(!m) return alert('Invalid Seoian date (DD/MM/YYYY).');
    const dd = Number(m[1]), mm = Number(m[2]), yyyy = Number(m[3]);
    const iso = gregorianFromSeoian(dd, mm, yyyy);
    if(!iso) return alert('Seoian date out of range for that SuperMonth.');
    state.focusDateISO = iso;
    render();
  });

  // Timezone inputs
  el('tzTamara').addEventListener('change', (e)=>{
    state.tamaraTZ = e.target.value || DEFAULTS.tamaraTZ;
    ensureEastWestOrder();
  });
  el('tzMartin').addEventListener('change', (e)=>{
    state.martinTZ = e.target.value || DEFAULTS.martinTZ;
    ensureEastWestOrder();
  });

  // Bottom sheet
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
      el(tab==='inspector' ? 'sheetInspector' : 'sheetClocks').classList.add('active');
    });
  });
}

// ---------- Boot ----------
async function loadData(){
  const cfgRes = await fetch('./data/supermonths_config.json');
  const rangesRes = await fetch('./data/supermonths_ranges_fallback.json');
  state.data.config = await cfgRes.json();
  state.data.ranges = await rangesRes.json();
  const idx = buildRangesIndex(state.data.ranges);
  state.data.rangesBySeoYear = idx.byYear;
  state.data.monthNoByName = idx.monthNoByName;
  state.data.nameByMonthNo = idx.nameByMonthNo;
}

(async function init(){
  setUpTZList();
  bindControls();
  await loadData();
  ensureEastWestOrder();
  mountClocks();
  // Default snapshot = Today
  snapshotDay(DateTime.now().setZone(state.displayTZ).toISODate());
  render();
  tickClocks();
  setInterval(tickClocks, 1000);
})();
