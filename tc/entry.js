import {
  loadState,
  saveState,
  loadTimer,
  saveTimer,
  clearTimer,
  createId,
  todayISO,
  getExercise,
  getUserLabel,
  buildTodaySnapshot,
  formatSecondsCompact,
  formatSecondsLong,
  secondsToMinuteDecimal,
  minutesToSeconds,
  nowIsoString
} from './core.js';

let state = loadState();
let activeTimer = loadTimer();
let timerInterval = null;

const els = {
  personStrip: document.getElementById('personStrip'),
  sessionDate: document.getElementById('sessionDate'),
  quickGrid: document.getElementById('quickGrid'),
  exerciseForm: document.getElementById('exerciseForm'),
  exerciseSelect: document.getElementById('exerciseSelect'),
  customExerciseWrap: document.getElementById('customExerciseWrap'),
  customExerciseName: document.getElementById('customExerciseName'),
  exerciseMeta: document.getElementById('exerciseMeta'),
  timerClock: document.getElementById('timerClock'),
  timerCaption: document.getElementById('timerCaption'),
  timerToggle: document.getElementById('timerToggle'),
  timerClear: document.getElementById('timerClear'),
  durationMin: document.getElementById('durationMin'),
  sets: document.getElementById('sets'),
  reps: document.getElementById('reps'),
  weight: document.getElementById('weight'),
  weightUnit: document.getElementById('weightUnit'),
  distanceKm: document.getElementById('distanceKm'),
  resistance: document.getElementById('resistance'),
  side: document.getElementById('side'),
  effort: document.getElementById('effort'),
  jointPain: document.getElementById('jointPain'),
  exerciseNotes: document.getElementById('exerciseNotes'),
  resetExerciseForm: document.getElementById('resetExerciseForm'),
  metricForm: document.getElementById('metricForm'),
  bodyWeightKg: document.getElementById('bodyWeightKg'),
  sleepHours: document.getElementById('sleepHours'),
  systolic: document.getElementById('systolic'),
  diastolic: document.getElementById('diastolic'),
  pulseBpm: document.getElementById('pulseBpm'),
  energy: document.getElementById('energy'),
  soreness: document.getElementById('soreness'),
  metricNotes: document.getElementById('metricNotes'),
  noteForm: document.getElementById('noteForm'),
  noteTitle: document.getElementById('noteTitle'),
  noteBody: document.getElementById('noteBody'),
  todayStats: document.getElementById('todayStats'),
  todayExerciseList: document.getElementById('todayExerciseList'),
  todayContextList: document.getElementById('todayContextList')
};

function init(){
  els.sessionDate.value = todayISO();
  renderPeople();
  renderExerciseOptions();
  renderQuickGrid();
  attachEvents();
  syncExerciseMeta();
  syncTimerUI();
  renderToday();
  startTimerTickIfNeeded();
}

function attachEvents(){
  els.sessionDate.addEventListener('change', renderToday);
  els.exerciseSelect.addEventListener('change', () => {
    syncExerciseMeta();
    syncTimerUI();
  });
  els.timerToggle.addEventListener('click', toggleTimer);
  els.timerClear.addEventListener('click', clearTimerFromForm);
  els.exerciseForm.addEventListener('submit', saveExerciseEntry);
  els.resetExerciseForm.addEventListener('click', resetExerciseForm);
  els.metricForm.addEventListener('submit', saveMetricEntry);
  els.noteForm.addEventListener('submit', saveNoteEntry);
}

function renderPeople(){
  els.personStrip.innerHTML = state.users.map((user) => {
    const active = user.id === state.config.currentUserId;
    return `<button type="button" class="person-chip ${active ? 'active' : ''}" data-user-id="${user.id}">${user.label}</button>`;
  }).join('');

  els.personStrip.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.config.currentUserId = button.dataset.userId;
      saveState(state);
      renderPeople();
      syncTimerUI();
      renderToday();
    });
  });
}

function renderExerciseOptions(){
  const options = [
    '<option value="">Choose exercise</option>',
    ...state.exerciseCatalog.map((exercise) => `<option value="${exercise.id}">${exercise.name}</option>`),
    '<option value="custom">Custom entry</option>'
  ];
  els.exerciseSelect.innerHTML = options.join('');
}

function renderQuickGrid(){
  const quickExercises = state.exerciseCatalog.filter((exercise) => exercise.favourite);
  els.quickGrid.innerHTML = quickExercises.map((exercise) => `<button type="button" class="quick-btn" data-exercise-id="${exercise.id}">${exercise.name}</button>`).join('');
  els.quickGrid.querySelectorAll('[data-exercise-id]').forEach((button) => {
    button.addEventListener('click', () => {
      els.exerciseSelect.value = button.dataset.exerciseId;
      syncExerciseMeta();
      syncTimerUI();
      window.scrollTo({ top: els.exerciseForm.offsetTop - 90, behavior: 'smooth' });
    });
  });
}

function syncExerciseMeta(){
  const selected = els.exerciseSelect.value;
  const isCustom = selected === 'custom';
  els.customExerciseWrap.classList.toggle('hidden', !isCustom);
  if(isCustom){
    els.exerciseMeta.textContent = 'Custom exercise entry. Name it however you naturally would.';
    return;
  }
  const exercise = getExercise(state, selected);
  if(!exercise){
    els.exerciseMeta.textContent = 'Choose an exercise to see category and notes.';
    return;
  }
  els.exerciseMeta.innerHTML = `
    <div class="entry-line">
      <span class="category-pill">${exercise.category}</span>
      <span class="inline-pill">${exercise.supportsDuration ? 'Timer-friendly' : 'Sets / reps first'}</span>
    </div>
    <div class="entry-note">${exercise.muscles}. ${exercise.notes}</div>
  `;
}

function getSelectedExerciseName(){
  if(els.exerciseSelect.value === 'custom'){
    return els.customExerciseName.value.trim();
  }
  const exercise = getExercise(state, els.exerciseSelect.value);
  return exercise?.name || '';
}

function toggleTimer(){
  if(activeTimer){
    stopTimer();
  }else{
    startTimer();
  }
}

function startTimer(){
  const exerciseId = els.exerciseSelect.value;
  const exerciseName = getSelectedExerciseName();

  if(!exerciseId || (!exerciseName && exerciseId !== 'custom')){
    alert('Choose an exercise first so the timer knows what it is following.');
    return;
  }

  if(exerciseId === 'custom' && !exerciseName){
    alert('Give the custom exercise a name before starting the timer.');
    return;
  }

  activeTimer = {
    startedAt: nowIsoString(),
    userId: state.config.currentUserId,
    date: els.sessionDate.value || todayISO(),
    exerciseId,
    exerciseName
  };
  saveTimer(activeTimer);
  syncTimerUI();
  startTimerTickIfNeeded();
}

function stopTimer(){
  if(!activeTimer) return;
  const elapsedSec = Math.max(1, Math.round((Date.now() - new Date(activeTimer.startedAt).getTime()) / 1000));
  els.durationMin.value = secondsToMinuteDecimal(elapsedSec);

  els.exerciseSelect.value = activeTimer.exerciseId;
  if(activeTimer.exerciseId === 'custom'){
    els.customExerciseName.value = activeTimer.exerciseName;
  }
  clearTimer();
  activeTimer = null;
  syncExerciseMeta();
  syncTimerUI();
}

function clearTimerFromForm(){
  els.durationMin.value = '';
  if(activeTimer){
    clearTimer();
    activeTimer = null;
  }
  syncTimerUI();
}

function startTimerTickIfNeeded(){
  if(timerInterval) clearInterval(timerInterval);
  if(!activeTimer){
    timerInterval = null;
    return;
  }
  timerInterval = setInterval(syncTimerUI, 500);
}

function syncTimerUI(){
  const selectedExerciseName = getSelectedExerciseName();
  const selectedExerciseId = els.exerciseSelect.value;

  if(activeTimer){
    const elapsedSec = Math.max(0, Math.round((Date.now() - new Date(activeTimer.startedAt).getTime()) / 1000));
    els.timerClock.textContent = formatSecondsCompact(elapsedSec);
    els.timerCaption.textContent = `${activeTimer.exerciseName} for ${getUserLabel(state, activeTimer.userId)} on ${activeTimer.date}. Stop when done and the duration will populate.`;
    els.timerToggle.textContent = 'Stop';
    els.timerToggle.classList.add('is-running');
  }else{
    els.timerClock.textContent = els.durationMin.value ? `${els.durationMin.value} min` : '00:00';
    const displayName = selectedExerciseName || 'the selected exercise';
    els.timerCaption.textContent = `Start the timer for ${displayName}. It will measure the work and fill the duration field.`;
    els.timerToggle.textContent = 'Start';
    els.timerToggle.classList.remove('is-running');
  }

  if(selectedExerciseId){
    const exercise = getExercise(state, selectedExerciseId);
    if(exercise && !exercise.supportsDuration){
      els.timerCaption.textContent += ' Timing is optional here, but available if useful.';
    }
  }
}

function numberOrNull(value){
  if(value == null || value === '') return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

function saveExerciseEntry(event){
  event.preventDefault();
  const exerciseId = els.exerciseSelect.value;
  const exercise = getExercise(state, exerciseId);
  const exerciseName = getSelectedExerciseName();

  if(!exerciseId){
    alert('Choose an exercise first.');
    return;
  }
  if(exerciseId === 'custom' && !exerciseName){
    alert('Give the custom exercise a name.');
    return;
  }

  const entry = {
    id: createId('ex'),
    date: els.sessionDate.value || todayISO(),
    userId: state.config.currentUserId,
    exerciseId,
    exerciseName,
    category: exercise?.category || 'custom',
    sets: numberOrNull(els.sets.value),
    reps: numberOrNull(els.reps.value),
    weight: numberOrNull(els.weight.value),
    weightUnit: els.weightUnit.value || 'kg',
    durationSec: minutesToSeconds(els.durationMin.value),
    distanceKm: numberOrNull(els.distanceKm.value),
    resistance: els.resistance.value.trim(),
    side: els.side.value,
    effort: els.effort.value,
    jointPain: els.jointPain.value,
    notes: els.exerciseNotes.value.trim()
  };

  state.exerciseEntries.push(entry);
  saveState(state);
  resetExerciseForm();
  renderToday();
}

function resetExerciseForm(){
  els.exerciseForm.reset();
  els.exerciseSelect.value = '';
  els.weightUnit.value = 'kg';
  syncExerciseMeta();
  syncTimerUI();
}

function saveMetricEntry(event){
  event.preventDefault();
  const entry = {
    id: createId('metric'),
    date: els.sessionDate.value || todayISO(),
    userId: state.config.currentUserId,
    bodyWeightKg: numberOrNull(els.bodyWeightKg.value),
    systolic: numberOrNull(els.systolic.value),
    diastolic: numberOrNull(els.diastolic.value),
    pulseBpm: numberOrNull(els.pulseBpm.value),
    sleepHours: numberOrNull(els.sleepHours.value),
    energy: els.energy.value,
    soreness: els.soreness.value,
    notes: els.metricNotes.value.trim()
  };

  const meaningful = Object.values({
    bodyWeightKg: entry.bodyWeightKg,
    systolic: entry.systolic,
    diastolic: entry.diastolic,
    pulseBpm: entry.pulseBpm,
    sleepHours: entry.sleepHours,
    energy: entry.energy,
    soreness: entry.soreness,
    notes: entry.notes
  }).some((value) => value !== null && value !== '');

  if(!meaningful){
    alert('Add at least one useful metric before saving.');
    return;
  }

  state.metricEntries.push(entry);
  saveState(state);
  els.metricForm.reset();
  renderToday();
}

function saveNoteEntry(event){
  event.preventDefault();
  const title = els.noteTitle.value.trim();
  const body = els.noteBody.value.trim();

  if(!title && !body){
    alert('Write a title, a note, or both.');
    return;
  }

  state.noteEntries.push({
    id: createId('note'),
    date: els.sessionDate.value || todayISO(),
    userId: state.config.currentUserId,
    title: title || 'Session note',
    body
  });
  saveState(state);
  els.noteForm.reset();
  renderToday();
}

function renderToday(){
  const date = els.sessionDate.value || todayISO();
  const userId = state.config.currentUserId;
  const snapshot = buildTodaySnapshot(state, date, userId);

  const statCards = [
    { label: 'Entries', value: snapshot.exerciseCount, note: `${snapshot.uniqueExercises} unique exercises` },
    { label: 'Reps', value: snapshot.totalReps, note: 'Only where reps were entered' },
    { label: 'Timed work', value: snapshot.totalDurationSec ? formatSecondsLong(snapshot.totalDurationSec) : '—', note: 'From saved duration entries' },
    { label: 'Context items', value: snapshot.metricCount + snapshot.noteCount, note: 'Metrics plus notes' }
  ];

  els.todayStats.innerHTML = statCards.map((card) => `
    <div class="stat-card">
      <div class="stat-label">${card.label}</div>
      <div class="stat-value">${card.value}</div>
      <div class="stat-note">${card.note}</div>
    </div>
  `).join('');

  const todaysExercises = state.exerciseEntries
    .filter((entry) => entry.date === date && entry.userId === userId)
    .slice()
    .reverse();

  els.todayExerciseList.innerHTML = todaysExercises.length ? todaysExercises.map((entry) => renderExerciseItem(entry)).join('') : `
    <div class="empty-state">No exercise entries for this day yet.</div>
  `;

  const todaysMetrics = state.metricEntries
    .filter((entry) => entry.date === date && entry.userId === userId)
    .slice()
    .reverse();

  const todaysNotes = state.noteEntries
    .filter((entry) => entry.date === date && entry.userId === userId)
    .slice()
    .reverse();

  const contextParts = [];
  for(const metric of todaysMetrics){
    contextParts.push(renderMetricItem(metric));
  }
  for(const note of todaysNotes){
    contextParts.push(renderNoteItem(note));
  }

  els.todayContextList.innerHTML = contextParts.length ? contextParts.join('') : `
    <div class="empty-state">No body metrics or notes for this day yet.</div>
  `;
}

function renderExerciseItem(entry){
  const details = [];
  if(entry.sets != null) details.push(`${entry.sets} sets`);
  if(entry.reps != null) details.push(`${entry.reps} reps`);
  if(entry.weight != null) details.push(`${entry.weight} ${entry.weightUnit}`);
  if(entry.durationSec) details.push(formatSecondsLong(entry.durationSec));
  if(entry.distanceKm != null) details.push(`${entry.distanceKm} km`);
  if(entry.resistance) details.push(`Resistance: ${entry.resistance}`);
  if(entry.side) details.push(`Side: ${entry.side}`);
  return `
    <div class="today-item">
      <div class="entry-line">
        <span class="entry-name">${entry.exerciseName}</span>
        <span class="category-pill">${entry.category}</span>
      </div>
      <div class="entry-detail">${details.length ? details.join(' • ') : 'No numeric detail entered.'}</div>
      ${entry.notes ? `<div class="entry-note">${entry.notes}</div>` : ''}
    </div>
  `;
}

function renderMetricItem(entry){
  const parts = [];
  if(entry.bodyWeightKg != null) parts.push(`Weight ${entry.bodyWeightKg.toFixed(1)} kg`);
  if(entry.systolic != null || entry.diastolic != null) parts.push(`BP ${entry.systolic ?? '—'}/${entry.diastolic ?? '—'}`);
  if(entry.pulseBpm != null) parts.push(`Pulse ${entry.pulseBpm} bpm`);
  if(entry.sleepHours != null) parts.push(`Sleep ${entry.sleepHours} hrs`);
  if(entry.energy) parts.push(`Energy ${entry.energy}`);
  if(entry.soreness) parts.push(`Soreness ${entry.soreness}`);
  return `
    <div class="metric-item">
      <div class="entry-line"><span class="entry-name">Body metric</span></div>
      <div class="entry-detail">${parts.join(' • ')}</div>
      ${entry.notes ? `<div class="entry-note">${entry.notes}</div>` : ''}
    </div>
  `;
}

function renderNoteItem(entry){
  return `
    <div class="note-item">
      <div class="entry-line"><span class="entry-name">${entry.title || 'Session note'}</span></div>
      <div class="entry-note">${entry.body || ''}</div>
    </div>
  `;
}

window.addEventListener('beforeunload', () => {
  if(timerInterval) clearInterval(timerInterval);
});

init();
