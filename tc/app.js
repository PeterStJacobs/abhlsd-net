import { STARTER_DATA } from './data.js';

const STORAGE_KEY = 'abhlsd.tc.data.v1';

const state = {
  focusDate: todayISO(),
  viewMode: 'day',
  filterUser: 'all',
  filterExercise: 'all',
  data: loadData()
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

function init(){
  cacheElements();
  seedFormDates();
  bindControls();
  populateUserSelects();
  populateExerciseSelect();
  populateExerciseFilter();
  updateExerciseMeta();
  renderAll();
}

function cacheElements(){
  [
    'exerciseForm','exerciseDate','exerciseUser','exerciseSelect','customExerciseWrap','customExerciseName','exerciseMeta','sets','reps','weight','weightUnit','duration','distance','resistance','side','effort','jointPain','exerciseNotes','resetExerciseForm',
    'metricForm','metricDate','metricUser','bodyWeight','waist','metricNotes',
    'noteForm','noteDate','noteUser','noteTitle','noteText',
    'focusDate','filterUser','viewMode','filterExercise','btnToday','btnPrevDay','btnNextDay',
    'historyTitle','historySubtitle','daySummary','historyList','rangeFacts','catalogueList','storageFacts','exportData','importDataInput','resetSeedData'
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function seedFormDates(){
  els.exerciseDate.value = state.focusDate;
  els.metricDate.value = state.focusDate;
  els.noteDate.value = state.focusDate;
  els.focusDate.value = state.focusDate;
}

function bindControls(){
  els.exerciseSelect.addEventListener('change', updateExerciseMeta);

  els.exerciseForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleExerciseSubmit();
  });

  els.resetExerciseForm.addEventListener('click', () => {
    els.exerciseForm.reset();
    els.exerciseDate.value = state.focusDate;
    els.exerciseUser.value = state.data.users[0]?.id || '';
    els.weightUnit.value = 'kg';
    updateExerciseMeta();
  });

  els.metricForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleMetricSubmit();
  });

  els.noteForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleNoteSubmit();
  });

  els.focusDate.addEventListener('change', () => {
    state.focusDate = els.focusDate.value || todayISO();
    syncAllDatesToFocus();
    renderAll();
  });

  els.filterUser.addEventListener('change', () => {
    state.filterUser = els.filterUser.value;
    renderAll();
  });

  els.viewMode.addEventListener('change', () => {
    state.viewMode = els.viewMode.value;
    renderAll();
  });

  els.filterExercise.addEventListener('change', () => {
    state.filterExercise = els.filterExercise.value;
    renderAll();
  });

  els.btnToday.addEventListener('click', () => {
    state.focusDate = todayISO();
    els.focusDate.value = state.focusDate;
    syncAllDatesToFocus();
    renderAll();
  });

  els.btnPrevDay.addEventListener('click', () => shiftFocusDate(-1));
  els.btnNextDay.addEventListener('click', () => shiftFocusDate(1));

  els.exportData.addEventListener('click', exportData);
  els.importDataInput.addEventListener('change', importData);
  els.resetSeedData.addEventListener('click', restoreStarterData);
}

function populateUserSelects(){
  const userOptions = state.data.users.map((user) => `<option value="${escapeAttr(user.id)}">${escapeHtml(user.name)}</option>`).join('');
  const filterOptions = [`<option value="all">All users</option>`, ...state.data.users.map((user) => `<option value="${escapeAttr(user.id)}">${escapeHtml(user.name)}</option>`)].join('');

  els.exerciseUser.innerHTML = userOptions;
  els.metricUser.innerHTML = userOptions;
  els.noteUser.innerHTML = userOptions;
  els.filterUser.innerHTML = filterOptions;

  const defaultUserId = state.data.users[0]?.id || '';
  els.exerciseUser.value = defaultUserId;
  els.metricUser.value = defaultUserId;
  els.noteUser.value = defaultUserId;
  els.filterUser.value = state.filterUser;
}

function populateExerciseSelect(){
  const options = [
    '<option value="">Select exercise</option>',
    ...state.data.exerciseCatalog.map((exercise) => `<option value="${escapeAttr(exercise.id)}">${escapeHtml(exercise.name)}</option>`),
    '<option value="__custom__">Custom exercise…</option>'
  ];
  els.exerciseSelect.innerHTML = options.join('');
}

function populateExerciseFilter(){
  const options = ['<option value="all">All exercises</option>'];
  for(const exercise of state.data.exerciseCatalog){
    options.push(`<option value="${escapeAttr(exercise.id)}">${escapeHtml(exercise.name)}</option>`);
  }
  options.push('<option value="__custom__">Custom exercises</option>');
  els.filterExercise.innerHTML = options.join('');
  els.filterExercise.value = state.filterExercise;
}

function updateExerciseMeta(){
  const value = els.exerciseSelect.value;
  const isCustom = value === '__custom__';
  els.customExerciseWrap.classList.toggle('hidden', !isCustom);

  if(!value){
    els.exerciseMeta.textContent = 'Choose an exercise to show category, muscles, and notes.';
    return;
  }

  if(isCustom){
    els.exerciseMeta.textContent = 'Custom exercise entry. You can still capture sets, reps, duration, notes, and anything else that matters.';
    return;
  }

  const exercise = state.data.exerciseCatalog.find((item) => item.id === value);
  if(!exercise){
    els.exerciseMeta.textContent = 'Exercise details unavailable.';
    return;
  }

  const dumbbellText = exercise.canUseDumbbells ? 'Can use dumbbells' : 'No dumbbells expected';
  els.exerciseMeta.textContent = `${exercise.category} • ${exercise.muscles} • ${dumbbellText} • ${exercise.notes}`;
}

function handleExerciseSubmit(){
  const exerciseId = els.exerciseSelect.value;
  const isCustom = exerciseId === '__custom__';
  const customName = els.customExerciseName.value.trim();
  const catalogueExercise = state.data.exerciseCatalog.find((item) => item.id === exerciseId);

  if(!exerciseId){
    window.alert('Please choose an exercise.');
    return;
  }

  if(isCustom && !customName){
    window.alert('Please enter the custom exercise name.');
    return;
  }

  const entry = {
    id: makeId('ex'),
    date: els.exerciseDate.value || state.focusDate,
    userId: els.exerciseUser.value,
    exerciseId: isCustom ? '__custom__' : exerciseId,
    exerciseName: isCustom ? customName : (catalogueExercise?.name || 'Exercise'),
    category: catalogueExercise?.category || 'custom',
    sets: parseNumberOrNull(els.sets.value),
    reps: parseNumberOrNull(els.reps.value),
    weight: parseNumberOrNull(els.weight.value),
    weightUnit: els.weightUnit.value || 'kg',
    durationMin: parseNumberOrNull(els.duration.value),
    distanceKm: parseNumberOrNull(els.distance.value),
    resistance: els.resistance.value.trim(),
    side: els.side.value,
    effort: els.effort.value,
    jointPain: els.jointPain.value,
    notes: els.exerciseNotes.value.trim()
  };

  state.data.exerciseEntries.unshift(entry);
  persistData();
  els.exerciseForm.reset();
  els.exerciseDate.value = entry.date;
  els.exerciseUser.value = entry.userId;
  els.weightUnit.value = 'kg';
  state.focusDate = entry.date;
  els.focusDate.value = entry.date;
  syncAllDatesToFocus();
  updateExerciseMeta();
  renderAll();
}

function handleMetricSubmit(){
  const weightKg = parseNumberOrNull(els.bodyWeight.value);
  const waistCm = parseNumberOrNull(els.waist.value);

  if(weightKg == null && waistCm == null && !els.metricNotes.value.trim()){
    window.alert('Enter at least one body metric or a note.');
    return;
  }

  const entry = {
    id: makeId('metric'),
    date: els.metricDate.value || state.focusDate,
    userId: els.metricUser.value,
    weightKg,
    waistCm,
    notes: els.metricNotes.value.trim()
  };

  state.data.metricEntries.unshift(entry);
  persistData();
  els.metricForm.reset();
  els.metricDate.value = entry.date;
  els.metricUser.value = entry.userId;
  state.focusDate = entry.date;
  els.focusDate.value = entry.date;
  syncAllDatesToFocus();
  renderAll();
}

function handleNoteSubmit(){
  const title = els.noteTitle.value.trim();
  const note = els.noteText.value.trim();
  if(!title && !note){
    window.alert('Add a title, a note, or both.');
    return;
  }

  const entry = {
    id: makeId('note'),
    date: els.noteDate.value || state.focusDate,
    userId: els.noteUser.value,
    title: title || 'Daily note',
    note
  };

  state.data.noteEntries.unshift(entry);
  persistData();
  els.noteForm.reset();
  els.noteDate.value = entry.date;
  els.noteUser.value = entry.userId;
  state.focusDate = entry.date;
  els.focusDate.value = entry.date;
  syncAllDatesToFocus();
  renderAll();
}

function shiftFocusDate(deltaDays){
  const shifted = addDaysISO(state.focusDate, deltaDays);
  state.focusDate = shifted;
  els.focusDate.value = shifted;
  syncAllDatesToFocus();
  renderAll();
}

function syncAllDatesToFocus(){
  els.exerciseDate.value = state.focusDate;
  els.metricDate.value = state.focusDate;
  els.noteDate.value = state.focusDate;
}

function renderAll(){
  populateExerciseFilter();
  renderHistoryHeader();
  renderDaySummary();
  renderHistory();
  renderRangeFacts();
  renderCatalogue();
  renderStorageFacts();
}

function renderHistoryHeader(){
  const label = humanDate(state.focusDate);
  const subtitleByView = {
    day: 'Selected day only.',
    week: 'Visible range is the last 7 days ending on the focus date.',
    month: 'Visible range is the last 30 days ending on the focus date.',
    all: 'Visible range is all stored history.'
  };
  els.historyTitle.textContent = `Exercise history • ${label}`;
  els.historySubtitle.textContent = subtitleByView[state.viewMode] || '';
}

function renderDaySummary(){
  const summary = buildDaySummary(state.focusDate, state.filterUser);
  const cards = [
    { label: 'Exercise entries', value: summary.exerciseCount, note: `${summary.uniqueExercises} unique exercises` },
    { label: 'Estimated reps', value: summary.totalReps, note: 'Only where reps are entered' },
    { label: 'Cardio minutes', value: formatMaybe(summary.cardioMinutes), note: 'From duration entries' },
    { label: 'Body weight', value: summary.latestWeight != null ? `${summary.latestWeight.toFixed(1)} kg` : '—', note: summary.weightNote }
  ];

  els.daySummary.innerHTML = cards.map((card) => `
    <div class="summary-card">
      <div class="summary-label">${escapeHtml(card.label)}</div>
      <div class="summary-value">${escapeHtml(String(card.value))}</div>
      <div class="summary-note">${escapeHtml(card.note)}</div>
    </div>
  `).join('');
}

function renderHistory(){
  const groups = buildVisibleGroups();

  if(groups.length === 0){
    els.historyList.innerHTML = '<div class="empty-state">No entries match the current filters yet.</div>';
    return;
  }

  els.historyList.innerHTML = groups.map((group) => renderDayBlock(group)).join('');
}

function renderRangeFacts(){
  const visible = getVisibleData();
  const exerciseDays = new Set(visible.exerciseEntries.map((entry) => entry.date)).size;
  const cardioMinutes = sum(visible.exerciseEntries.map((entry) => entry.durationMin || 0));
  const totalReps = sum(visible.exerciseEntries.map((entry) => calcEntryReps(entry)));
  const weightSeries = visible.metricEntries.filter((entry) => entry.weightKg != null).sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight = weightSeries.at(-1)?.weightKg ?? null;
  const firstWeight = weightSeries[0]?.weightKg ?? null;
  const weightChange = latestWeight != null && firstWeight != null ? latestWeight - firstWeight : null;

  const facts = [
    {
      label: 'Workout days',
      value: String(exerciseDays),
      note: 'Days with at least one exercise entry in the visible range.'
    },
    {
      label: 'Exercise entries',
      value: String(visible.exerciseEntries.length),
      note: 'Raw exercise records.'
    },
    {
      label: 'Estimated reps',
      value: String(totalReps),
      note: 'Only counts entries with reps recorded.'
    },
    {
      label: 'Cardio minutes',
      value: cardioMinutes ? String(round1(cardioMinutes)) : '0',
      note: 'From entries where duration is used.'
    },
    {
      label: 'Latest weight',
      value: latestWeight != null ? `${latestWeight.toFixed(1)} kg` : '—',
      note: weightChange == null ? 'No weight trend yet.' : `Change across visible range: ${weightChange >= 0 ? '+' : ''}${weightChange.toFixed(1)} kg`
    },
    {
      label: 'Notes recorded',
      value: String(visible.noteEntries.length),
      note: 'General daily notes in the visible range.'
    }
  ];

  els.rangeFacts.innerHTML = facts.map(renderFact).join('');
}

function renderCatalogue(){
  els.catalogueList.innerHTML = state.data.exerciseCatalog.map((exercise) => `
    <div class="catalogue-item">
      <div class="catalogue-name">${escapeHtml(exercise.name)}</div>
      <div class="catalogue-meta">${escapeHtml(capitalise(exercise.category))} • ${escapeHtml(exercise.muscles)}</div>
      <div class="catalogue-note">${escapeHtml(exercise.notes)}${exercise.canUseDumbbells ? ' • Can use dumbbells' : ''}</div>
    </div>
  `).join('');
}

function renderStorageFacts(){
  const payload = JSON.stringify(state.data);
  const sizeKb = (new Blob([payload]).size / 1024).toFixed(1);
  const facts = [
    {
      label: 'Current storage',
      value: 'Browser local storage',
      note: 'Good for a first draft. Not private multi-user storage yet.'
    },
    {
      label: 'Saved size',
      value: `${sizeKb} KB`,
      note: 'Export regularly until a private backend exists.'
    },
    {
      label: 'Starter users',
      value: String(state.data.users.length),
      note: 'The data model already leaves room for Martin and Tamara.'
    }
  ];

  els.storageFacts.innerHTML = facts.map(renderFact).join('');
}

function renderFact(fact){
  return `
    <div class="fact">
      <div class="fact-label">${escapeHtml(fact.label)}</div>
      <div class="fact-value">${escapeHtml(fact.value)}</div>
      <div class="fact-note">${escapeHtml(fact.note)}</div>
    </div>
  `;
}

function buildVisibleGroups(){
  const visible = getVisibleData();
  const grouped = new Map();

  for(const entry of visible.exerciseEntries){
    ensureGroup(grouped, entry.date).exerciseEntries.push(entry);
  }
  for(const entry of visible.metricEntries){
    ensureGroup(grouped, entry.date).metricEntries.push(entry);
  }
  for(const entry of visible.noteEntries){
    ensureGroup(grouped, entry.date).noteEntries.push(entry);
  }

  return [...grouped.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, bucket]) => ({ date, ...bucket }))
    .filter((bucket) => bucket.exerciseEntries.length || bucket.metricEntries.length || bucket.noteEntries.length);
}

function ensureGroup(map, date){
  if(!map.has(date)){
    map.set(date, { exerciseEntries: [], metricEntries: [], noteEntries: [] });
  }
  return map.get(date);
}

function renderDayBlock(group){
  const exerciseCards = group.exerciseEntries
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))
    .map(renderExerciseEntry)
    .join('');
  const metricCards = group.metricEntries
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(renderMetricEntry)
    .join('');
  const noteCards = group.noteEntries
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(renderNoteEntry)
    .join('');

  const countBits = [];
  if(group.exerciseEntries.length) countBits.push(`${group.exerciseEntries.length} exercise`);
  if(group.metricEntries.length) countBits.push(`${group.metricEntries.length} metric`);
  if(group.noteEntries.length) countBits.push(`${group.noteEntries.length} note`);

  return `
    <article class="day-block">
      <div class="day-block-head">
        <div>
          <div class="day-date">${escapeHtml(humanDate(group.date))}</div>
          <div class="day-subline">${escapeHtml(countBits.join(' • ') || 'No entries')}</div>
        </div>
        <div class="entry-chip">Focus date block</div>
      </div>
      <div class="day-block-body">
        ${exerciseCards ? `<div class="entry-list">${exerciseCards}</div>` : ''}
        ${metricCards ? `<div class="entry-list">${metricCards}</div>` : ''}
        ${noteCards ? `<div class="entry-list">${noteCards}</div>` : ''}
      </div>
    </article>
  `;
}

function renderExerciseEntry(entry){
  const details = [];
  if(entry.sets != null && entry.reps != null){
    details.push(`${trimNumber(entry.sets)} × ${trimNumber(entry.reps)}`);
  } else if(entry.reps != null){
    details.push(`${trimNumber(entry.reps)} reps`);
  } else if(entry.sets != null){
    details.push(`${trimNumber(entry.sets)} sets`);
  }
  if(entry.weight != null){
    details.push(`@ ${trimNumber(entry.weight)} ${entry.weightUnit || 'kg'}`);
  }
  if(entry.durationMin != null){
    details.push(`${trimNumber(entry.durationMin)} min`);
  }
  if(entry.distanceKm != null){
    details.push(`${trimNumber(entry.distanceKm)} km`);
  }
  if(entry.resistance){
    details.push(`Resistance: ${entry.resistance}`);
  }
  if(entry.side){
    details.push(`Side: ${capitalise(entry.side)}`);
  }
  if(entry.effort){
    details.push(`Effort: ${capitalise(entry.effort)}`);
  }
  if(entry.jointPain){
    details.push(`Joint pain: ${capitalise(entry.jointPain)}`);
  }

  return `
    <div class="entry-card">
      <div class="entry-main">
        <div>
          <div class="entry-type">Exercise entry</div>
          <div class="entry-title">${escapeHtml(entry.exerciseName)}</div>
        </div>
        <div>
          <span class="user-pill">${escapeHtml(userName(entry.userId))}</span>
          <span class="cat-pill ${escapeAttr(entry.category || 'note')}">${escapeHtml(capitalise(entry.category || 'Exercise'))}</span>
        </div>
      </div>
      <div class="entry-detail">${escapeHtml(details.join(' • ') || 'No structured quantities recorded.')}</div>
      ${entry.notes ? `<div class="entry-note">${escapeHtml(entry.notes)}</div>` : ''}
    </div>
  `;
}

function renderMetricEntry(entry){
  const details = [];
  if(entry.weightKg != null) details.push(`Weight: ${trimNumber(entry.weightKg)} kg`);
  if(entry.waistCm != null) details.push(`Waist: ${trimNumber(entry.waistCm)} cm`);

  return `
    <div class="entry-card">
      <div class="entry-main">
        <div>
          <div class="entry-type">Body metric</div>
          <div class="entry-title">Personal metric entry</div>
        </div>
        <div>
          <span class="user-pill">${escapeHtml(userName(entry.userId))}</span>
          <span class="cat-pill metric">Metric</span>
        </div>
      </div>
      <div class="entry-detail">${escapeHtml(details.join(' • ') || 'No numeric metric entered.')}</div>
      ${entry.notes ? `<div class="entry-note">${escapeHtml(entry.notes)}</div>` : ''}
    </div>
  `;
}

function renderNoteEntry(entry){
  return `
    <div class="entry-card">
      <div class="entry-main">
        <div>
          <div class="entry-type">Daily note</div>
          <div class="entry-title">${escapeHtml(entry.title || 'Note')}</div>
        </div>
        <div>
          <span class="user-pill">${escapeHtml(userName(entry.userId))}</span>
          <span class="cat-pill note">Note</span>
        </div>
      </div>
      <div class="entry-note">${escapeHtml(entry.note || '')}</div>
    </div>
  `;
}

function getVisibleData(){
  const range = getVisibleRange();
  const matchesUser = (entry) => state.filterUser === 'all' || entry.userId === state.filterUser;
  const matchesExercise = (entry) => {
    if(state.filterExercise === 'all') return true;
    if(state.filterExercise === '__custom__') return entry.exerciseId === '__custom__';
    return entry.exerciseId === state.filterExercise;
  };
  const inRange = (date) => !range || (date >= range.start && date <= range.end);

  return {
    exerciseEntries: state.data.exerciseEntries.filter((entry) => matchesUser(entry) && matchesExercise(entry) && inRange(entry.date)),
    metricEntries: state.data.metricEntries.filter((entry) => matchesUser(entry) && inRange(entry.date)),
    noteEntries: state.data.noteEntries.filter((entry) => matchesUser(entry) && inRange(entry.date))
  };
}

function getVisibleRange(){
  if(state.viewMode === 'all') return null;
  if(state.viewMode === 'day') return { start: state.focusDate, end: state.focusDate };
  if(state.viewMode === 'week') return { start: addDaysISO(state.focusDate, -6), end: state.focusDate };
  return { start: addDaysISO(state.focusDate, -29), end: state.focusDate };
}

function buildDaySummary(date, userId){
  const exerciseEntries = state.data.exerciseEntries.filter((entry) => entry.date === date && (userId === 'all' || entry.userId === userId));
  const metricEntries = state.data.metricEntries.filter((entry) => entry.date === date && (userId === 'all' || entry.userId === userId));
  const totalReps = sum(exerciseEntries.map((entry) => calcEntryReps(entry)));
  const cardioMinutes = sum(exerciseEntries.map((entry) => entry.durationMin || 0));
  const latestWeightEntry = metricEntries.filter((entry) => entry.weightKg != null).at(-1) || null;
  return {
    exerciseCount: exerciseEntries.length,
    uniqueExercises: new Set(exerciseEntries.map((entry) => entry.exerciseName)).size,
    totalReps,
    cardioMinutes: cardioMinutes || null,
    latestWeight: latestWeightEntry?.weightKg ?? null,
    weightNote: latestWeightEntry ? 'Recorded on this day.' : 'No weight recorded on this day.'
  };
}

function calcEntryReps(entry){
  if(entry.reps == null) return 0;
  return (entry.sets || 1) * entry.reps;
}

function exportData(){
  const payload = JSON.stringify(state.data, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `the-challenge-export-${todayISO()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function importData(event){
  const [file] = event.target.files || [];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(String(reader.result));
      if(!isValidDataShape(parsed)){
        throw new Error('Imported file does not match the expected The Challenge data shape.');
      }
      state.data = normaliseDataShape(parsed);
      persistData();
      populateUserSelects();
      populateExerciseSelect();
      populateExerciseFilter();
      updateExerciseMeta();
      renderAll();
      event.target.value = '';
    }catch(error){
      window.alert(error.message || 'Could not import data file.');
    }
  };
  reader.readAsText(file);
}

function restoreStarterData(){
  const confirmed = window.confirm('Restore the starter data? This will replace the current browser-stored data for The Challenge.');
  if(!confirmed) return;
  state.data = clone(STARTER_DATA);
  persistData();
  populateUserSelects();
  populateExerciseSelect();
  populateExerciseFilter();
  updateExerciseMeta();
  renderAll();
}

function persistData(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function loadData(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return clone(STARTER_DATA);
    const parsed = JSON.parse(raw);
    return isValidDataShape(parsed) ? normaliseDataShape(parsed) : clone(STARTER_DATA);
  }catch{
    return clone(STARTER_DATA);
  }
}

function isValidDataShape(value){
  return value && Array.isArray(value.users) && Array.isArray(value.exerciseCatalog) && Array.isArray(value.exerciseEntries) && Array.isArray(value.metricEntries) && Array.isArray(value.noteEntries);
}

function normaliseDataShape(data){
  return {
    users: Array.isArray(data.users) ? data.users : [],
    exerciseCatalog: Array.isArray(data.exerciseCatalog) ? data.exerciseCatalog : [],
    exerciseEntries: Array.isArray(data.exerciseEntries) ? data.exerciseEntries : [],
    metricEntries: Array.isArray(data.metricEntries) ? data.metricEntries : [],
    noteEntries: Array.isArray(data.noteEntries) ? data.noteEntries : []
  };
}

function userName(userId){
  return state.data.users.find((user) => user.id === userId)?.name || userId || 'Unknown';
}

function sum(values){
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function parseNumberOrNull(value){
  if(value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function todayISO(){
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(dateISO, deltaDays){
  const date = new Date(`${dateISO}T00:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function humanDate(dateISO){
  const date = new Date(`${dateISO}T00:00:00`);
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function capitalise(value){
  if(!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function trimNumber(value){
  const num = Number(value);
  if(Number.isInteger(num)) return String(num);
  return String(round1(num));
}

function round1(value){
  return Math.round(value * 10) / 10;
}

function formatMaybe(value){
  return value == null ? '—' : String(round1(value));
}

function clone(value){
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix){
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value){
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value){
  return escapeHtml(value);
}
