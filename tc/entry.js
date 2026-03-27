import {
  loadState,
  saveState,
  updateUserProfile,
  loadTimer,
  saveTimer,
  clearTimer,
  createId,
  todayISO,
  nowTimeHHMM,
  getExercise,
  getExerciseProfile,
  getUser,
  getUserLabel,
  buildTodaySnapshot,
  formatSecondsCompact,
  formatSecondsLong,
  secondsToMinuteDecimal,
  minutesToSeconds,
  formatTimeShort,
  convertWeight,
  formatWeight,
  calculateBMI,
  bmiBand
} from './core.js';

let state = loadState();
let activeTimer = loadTimer();
let timerInterval = null;

const els = {
  personStrip: document.getElementById('personStrip'),
  sessionDate: document.getElementById('sessionDate'),
  quickGrid: document.getElementById('quickGrid'),
  recentGrid: document.getElementById('recentGrid'),
  exerciseForm: document.getElementById('exerciseForm'),
  exerciseSelect: document.getElementById('exerciseSelect'),
  exerciseTime: document.getElementById('exerciseTime'),
  exerciseNowBtn: document.getElementById('exerciseNowBtn'),
  customExerciseWrap: document.getElementById('customExerciseWrap'),
  customExerciseName: document.getElementById('customExerciseName'),
  customCategoryWrap: document.getElementById('customCategoryWrap'),
  customCategory: document.getElementById('customCategory'),
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
  distanceFieldWrap: document.getElementById('distanceFieldWrap'),
  distanceFieldHint: document.getElementById('distanceFieldHint'),
  resistance: document.getElementById('resistance'),
  side: document.getElementById('side'),
  effort: document.getElementById('effort'),
  jointPain: document.getElementById('jointPain'),
  avgHr: document.getElementById('avgHr'),
  maxHr: document.getElementById('maxHr'),
  workoutCalories: document.getElementById('workoutCalories'),
  avgSpeedKmh: document.getElementById('avgSpeedKmh'),
  walkAvgHr: document.getElementById('walkAvgHr'),
  walkMaxHr: document.getElementById('walkMaxHr'),
  walkCalories: document.getElementById('walkCalories'),
  exerciseSteps: document.getElementById('exerciseSteps'),
  avgCadence: document.getElementById('avgCadence'),
  avgPace500: document.getElementById('avgPace500'),
  avgStrokeRate: document.getElementById('avgStrokeRate'),
  rowAvgHr: document.getElementById('rowAvgHr'),
  rowMaxHr: document.getElementById('rowMaxHr'),
  avgPower: document.getElementById('avgPower'),
  bikeFields: document.getElementById('bikeFields'),
  walkingFields: document.getElementById('walkingFields'),
  rowingFields: document.getElementById('rowingFields'),
  exerciseNotes: document.getElementById('exerciseNotes'),
  resetExerciseForm: document.getElementById('resetExerciseForm'),
  profileForm: document.getElementById('profileForm'),
  profileHeightCm: document.getElementById('profileHeightCm'),
  profileWeightUnit: document.getElementById('profileWeightUnit'),
  profileStepTarget: document.getElementById('profileStepTarget'),
  profileSummary: document.getElementById('profileSummary'),
  metricForm: document.getElementById('metricForm'),
  metricTime: document.getElementById('metricTime'),
  metricNowBtn: document.getElementById('metricNowBtn'),
  bodyWeightValue: document.getElementById('bodyWeightValue'),
  bodyWeightUnit: document.getElementById('bodyWeightUnit'),
  flipWeightUnit: document.getElementById('flipWeightUnit'),
  metricWeightHint: document.getElementById('metricWeightHint'),
  metricBmiHint: document.getElementById('metricBmiHint'),
  sleepHours: document.getElementById('sleepHours'),
  metricSteps: document.getElementById('metricSteps'),
  systolic: document.getElementById('systolic'),
  diastolic: document.getElementById('diastolic'),
  pulseBpm: document.getElementById('pulseBpm'),
  energy: document.getElementById('energy'),
  soreness: document.getElementById('soreness'),
  metricNotes: document.getElementById('metricNotes'),
  noteForm: document.getElementById('noteForm'),
  noteTime: document.getElementById('noteTime'),
  noteNowBtn: document.getElementById('noteNowBtn'),
  noteTitle: document.getElementById('noteTitle'),
  noteBody: document.getElementById('noteBody'),
  todayStats: document.getElementById('todayStats'),
  todayExerciseList: document.getElementById('todayExerciseList'),
  todayContextList: document.getElementById('todayContextList')
};

function init(){
  els.sessionDate.value = todayISO();
  setFreshTimes();
  renderPeople();
  renderProfileForm();
  renderExerciseOptions();
  renderQuickGrid();
  renderRecentGrid();
  attachEvents();
  syncExerciseMeta();
  syncExerciseDetailFields();
  syncTimerUI();
  syncMetricWeightHints();
  renderToday();
  startTimerTickIfNeeded();
}

function attachEvents(){
  els.sessionDate.addEventListener('change', renderToday);
  els.exerciseSelect.addEventListener('change', () => {
    syncExerciseMeta();
    syncExerciseDetailFields();
    syncTimerUI();
  });
  els.customCategory.addEventListener('change', () => {
    syncExerciseDetailFields();
  });
  els.customExerciseName.addEventListener('input', syncTimerUI);
  els.timerToggle.addEventListener('click', toggleTimer);
  els.timerClear.addEventListener('click', clearTimerFromForm);
  els.exerciseNowBtn.addEventListener('click', () => { els.exerciseTime.value = nowTimeHHMM(); });
  els.metricNowBtn.addEventListener('click', () => { els.metricTime.value = nowTimeHHMM(); });
  els.noteNowBtn.addEventListener('click', () => { els.noteTime.value = nowTimeHHMM(); });
  els.exerciseForm.addEventListener('submit', saveExerciseEntry);
  els.resetExerciseForm.addEventListener('click', resetExerciseForm);
  els.profileForm.addEventListener('submit', saveProfile);
  els.metricForm.addEventListener('submit', saveMetricEntry);
  els.noteForm.addEventListener('submit', saveNoteEntry);
  els.bodyWeightValue.addEventListener('input', syncMetricWeightHints);
  els.bodyWeightUnit.addEventListener('change', syncMetricWeightHints);
  els.flipWeightUnit.addEventListener('click', flipMetricWeightUnit);
}

function setFreshTimes(){
  const now = nowTimeHHMM();
  els.exerciseTime.value = now;
  els.metricTime.value = now;
  els.noteTime.value = now;
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
      renderProfileForm();
      syncTimerUI();
      syncMetricWeightHints();
      renderToday();
    });
  });
}

function renderProfileForm(){
  const user = getUser(state, state.config.currentUserId);
  els.profileHeightCm.value = user?.heightCm ?? '';
  els.profileWeightUnit.value = user?.preferredWeightUnit || 'kg';
  els.profileStepTarget.value = user?.dailyStepTarget ?? '';
  renderProfileSummary();
}

function renderProfileSummary(){
  const user = getUser(state, state.config.currentUserId);
  els.profileSummary.innerHTML = `
    <div class="today-item compact-item">
      <div class="entry-line"><span class="entry-name">${user?.label || 'User'} profile</span></div>
      <div class="entry-detail">Height: ${user?.heightCm != null ? `${user.heightCm} cm` : 'not set'} • Weight unit: ${user?.preferredWeightUnit || 'kg'} • Step target: ${user?.dailyStepTarget ?? 'not set'}</div>
    </div>
  `;
}

function saveProfile(event){
  event.preventDefault();
  const patch = {
    heightCm: numberOrNull(els.profileHeightCm.value),
    preferredWeightUnit: els.profileWeightUnit.value || 'kg',
    dailyStepTarget: numberOrNull(els.profileStepTarget.value)
  };
  state = updateUserProfile(state, state.config.currentUserId, patch);
  renderProfileSummary();
  syncMetricWeightHints();
  renderToday();
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
  bindQuickButtons(els.quickGrid);
}

function renderRecentGrid(){
  const recentIds = [];
  for(const entry of [...state.exerciseEntries].sort((a, b) => (b.date + (b.recordTime || '')).localeCompare(a.date + (a.recordTime || '')))){
    if(entry.userId !== state.config.currentUserId) continue;
    if(!entry.exerciseId || recentIds.includes(entry.exerciseId)) continue;
    recentIds.push(entry.exerciseId);
    if(recentIds.length >= 6) break;
  }
  const recent = recentIds.map((id) => state.exerciseCatalog.find((exercise) => exercise.id === id)).filter(Boolean);
  els.recentGrid.innerHTML = recent.length
    ? recent.map((exercise) => `<button type="button" class="quick-btn" data-exercise-id="${exercise.id}">${exercise.name}</button>`).join('')
    : '<div class="entry-note">No recent exercise history for this person yet.</div>';
  bindQuickButtons(els.recentGrid);
}

function bindQuickButtons(container){
  container.querySelectorAll('[data-exercise-id]').forEach((button) => {
    button.addEventListener('click', () => {
      els.exerciseSelect.value = button.dataset.exerciseId;
      syncExerciseMeta();
      syncExerciseDetailFields();
      syncTimerUI();
      window.scrollTo({ top: els.exerciseForm.offsetTop - 90, behavior: 'smooth' });
    });
  });
}

function syncExerciseMeta(){
  const selected = els.exerciseSelect.value;
  const isCustom = selected === 'custom';
  els.customExerciseWrap.classList.toggle('hidden', !isCustom);
  els.customCategoryWrap.classList.toggle('hidden', !isCustom);
  if(isCustom){
    els.exerciseMeta.textContent = 'Custom exercise entry. Name it however you naturally would and choose the category that fits best.';
    return;
  }
  const exercise = getExercise(state, selected);
  if(!exercise){
    els.exerciseMeta.textContent = 'Choose an exercise to see category and notes.';
    return;
  }
  const profileText = exercise.detailProfile === 'standard' ? 'General fields only' : `${exercise.detailProfile} fields available`;
  els.exerciseMeta.innerHTML = `
    <div class="entry-line">
      <span class="category-pill">${exercise.category}</span>
      <span class="inline-pill">${exercise.supportsDuration ? 'Timer-friendly' : 'Sets / reps first'}</span>
      <span class="inline-pill">${profileText}</span>
    </div>
    <div class="entry-note">${exercise.muscles}. ${exercise.notes}</div>
  `;
}

function syncExerciseDetailFields(){
  const profile = els.exerciseSelect.value === 'custom' ? els.customCategory.value : getExerciseProfile(state, els.exerciseSelect.value);
  const showBike = profile === 'bike';
  const showWalking = profile === 'walking';
  const showRowing = profile === 'rowing';
  const showCardioDistanceCue = showBike || showWalking || showRowing;

  els.bikeFields.classList.toggle('hidden', !showBike);
  els.walkingFields.classList.toggle('hidden', !showWalking);
  els.rowingFields.classList.toggle('hidden', !showRowing);
  els.distanceFieldWrap.classList.toggle('cardio-highlight', showCardioDistanceCue);
  els.distanceFieldHint.classList.toggle('hidden', !showCardioDistanceCue);
}

function getSelectedExerciseName(){
  if(els.exerciseSelect.value === 'custom') return els.customExerciseName.value.trim();
  const exercise = getExercise(state, els.exerciseSelect.value);
  return exercise?.name || '';
}

function toggleTimer(){
  if(activeTimer) stopTimer();
  else startTimer();
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
    startedAt: new Date().toISOString(),
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
  if(activeTimer.exerciseId === 'custom') els.customExerciseName.value = activeTimer.exerciseName;
  if(!els.exerciseTime.value) els.exerciseTime.value = nowTimeHHMM();
  clearTimer();
  activeTimer = null;
  syncExerciseMeta();
  syncExerciseDetailFields();
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
}

function buildExercisePayload(){
  const exercise = getExercise(state, els.exerciseSelect.value);
  const profile = els.exerciseSelect.value === 'custom' ? els.customCategory.value : (exercise?.detailProfile || 'standard');

  let avgHr = numberOrNull(els.avgHr.value);
  let maxHr = numberOrNull(els.maxHr.value);
  let workoutCalories = numberOrNull(els.workoutCalories.value);

  if(profile === 'walking'){
    avgHr = numberOrNull(els.walkAvgHr.value);
    maxHr = numberOrNull(els.walkMaxHr.value);
    workoutCalories = numberOrNull(els.walkCalories.value);
  }

  if(profile === 'rowing'){
    avgHr = numberOrNull(els.rowAvgHr.value);
    maxHr = numberOrNull(els.rowMaxHr.value);
  }

  return {
    id: createId('ex'),
    date: els.sessionDate.value || todayISO(),
    recordTime: els.exerciseTime.value || '',
    userId: state.config.currentUserId,
    exerciseId: els.exerciseSelect.value === 'custom' ? 'custom' : els.exerciseSelect.value,
    exerciseName: getSelectedExerciseName() || 'Custom exercise',
    category: exercise?.category || els.customCategory.value,
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
    avgHr,
    maxHr,
    workoutCalories,
    avgSpeedKmh: profile === 'walking' ? numberOrNull(els.avgSpeedKmh.value) : null,
    steps: profile === 'walking' ? numberOrNull(els.exerciseSteps.value) : null,
    avgCadence: profile === 'walking' ? numberOrNull(els.avgCadence.value) : null,
    avgPace500: profile === 'rowing' ? els.avgPace500.value.trim() : '',
    avgStrokeRate: profile === 'rowing' ? numberOrNull(els.avgStrokeRate.value) : null,
    avgPower: profile === 'rowing' ? numberOrNull(els.avgPower.value) : null,
    notes: els.exerciseNotes.value.trim()
  };
}

function saveExerciseEntry(event){
  event.preventDefault();
  if(!els.exerciseSelect.value){
    alert('Choose an exercise before saving.');
    return;
  }
  if(els.exerciseSelect.value === 'custom' && !els.customExerciseName.value.trim()){
    alert('Name the custom exercise before saving.');
    return;
  }

  const payload = buildExercisePayload();
  state.exerciseEntries.push(payload);
  saveState(state);
  renderRecentGrid();
  renderToday();
  resetExerciseForm();
}

function resetExerciseForm(){
  els.exerciseForm.reset();
  els.exerciseSelect.value = '';
  els.exerciseTime.value = nowTimeHHMM();
  els.weightUnit.value = 'kg';
  clearTimerFromForm();
  syncExerciseMeta();
  syncExerciseDetailFields();
}

function saveMetricEntry(event){
  event.preventDefault();
  const payload = {
    id: createId('metric'),
    date: els.sessionDate.value || todayISO(),
    recordTime: els.metricTime.value || '',
    userId: state.config.currentUserId,
    bodyWeight: numberOrNull(els.bodyWeightValue.value),
    bodyWeightUnit: els.bodyWeightUnit.value || 'kg',
    systolic: numberOrNull(els.systolic.value),
    diastolic: numberOrNull(els.diastolic.value),
    pulseBpm: numberOrNull(els.pulseBpm.value),
    sleepHours: numberOrNull(els.sleepHours.value),
    energy: els.energy.value,
    soreness: els.soreness.value,
    steps: numberOrNull(els.metricSteps.value),
    notes: els.metricNotes.value.trim()
  };
  state.metricEntries.push(payload);
  saveState(state);
  renderToday();
  els.metricForm.reset();
  els.metricTime.value = nowTimeHHMM();
  els.bodyWeightUnit.value = getUser(state, state.config.currentUserId)?.preferredWeightUnit || 'kg';
  syncMetricWeightHints();
}

function saveNoteEntry(event){
  event.preventDefault();
  const body = els.noteBody.value.trim();
  const title = els.noteTitle.value.trim();
  if(!body && !title){
    alert('Write at least a title or a note body before saving.');
    return;
  }

  state.noteEntries.push({
    id: createId('note'),
    date: els.sessionDate.value || todayISO(),
    recordTime: els.noteTime.value || '',
    userId: state.config.currentUserId,
    title,
    body
  });
  saveState(state);
  renderToday();
  els.noteForm.reset();
  els.noteTime.value = nowTimeHHMM();
}

function syncMetricWeightHints(){
  const value = numberOrNull(els.bodyWeightValue.value);
  const unit = els.bodyWeightUnit.value || 'kg';
  const otherUnit = unit === 'kg' ? 'lb' : 'kg';
  const converted = convertWeight(value, unit, otherUnit);
  els.metricWeightHint.textContent = value != null
    ? `Equivalent: ${formatWeight(converted, otherUnit)}`
    : 'Equivalent weight will appear here.';

  const user = getUser(state, state.config.currentUserId);
  const bmi = calculateBMI(value, unit, user?.heightCm);
  els.metricBmiHint.textContent = bmi != null
    ? `BMI preview: ${bmi.toFixed(1)} • ${bmiBand(bmi)}`
    : 'BMI preview will appear here when height is available.';
}

function flipMetricWeightUnit(){
  const currentUnit = els.bodyWeightUnit.value || 'kg';
  const nextUnit = currentUnit === 'kg' ? 'lb' : 'kg';
  const value = numberOrNull(els.bodyWeightValue.value);
  const converted = convertWeight(value, currentUnit, nextUnit);
  els.bodyWeightUnit.value = nextUnit;
  if(converted != null) els.bodyWeightValue.value = converted.toFixed(1);
  syncMetricWeightHints();
}

function renderToday(){
  const snapshot = buildTodaySnapshot(state, els.sessionDate.value || todayISO(), state.config.currentUserId);
  const user = getUser(state, state.config.currentUserId);
  const latestWeight = snapshot.latestMetric?.bodyWeight != null ? `${formatWeight(snapshot.latestMetric.bodyWeight, snapshot.latestMetric.bodyWeightUnit)}` : '—';
  const bmi = snapshot.latestMetric && user?.heightCm ? calculateBMI(snapshot.latestMetric.bodyWeight, snapshot.latestMetric.bodyWeightUnit, user.heightCm) : null;

  const cards = [
    { label: 'Exercises', value: snapshot.exerciseCount, note: `${snapshot.uniqueExercises} unique` },
    { label: 'Timed work', value: snapshot.totalDurationSec ? formatSecondsLong(snapshot.totalDurationSec) : '—', note: `${snapshot.totalReps} reps logged` },
    { label: 'Weight', value: latestWeight, note: bmi != null ? `BMI ${bmi.toFixed(1)}` : 'BMI unavailable' },
    { label: 'Steps', value: snapshot.totalSteps || '—', note: user?.dailyStepTarget ? `Target ${user.dailyStepTarget}` : 'No target yet' }
  ];

  els.todayStats.innerHTML = cards.map((card) => `
    <div class="stat-card">
      <div class="stat-label">${card.label}</div>
      <div class="stat-value">${card.value}</div>
      <div class="stat-note">${card.note}</div>
    </div>
  `).join('');

  const todayExercises = state.exerciseEntries
    .filter((entry) => entry.userId === state.config.currentUserId && entry.date === (els.sessionDate.value || todayISO()))
    .sort((a, b) => (b.recordTime || '').localeCompare(a.recordTime || ''));

  els.todayExerciseList.innerHTML = todayExercises.length ? todayExercises.map((entry) => {
    const bits = [];
    if(entry.recordTime) bits.push(formatTimeShort(entry.recordTime));
    if(entry.sets != null) bits.push(`${entry.sets} sets`);
    if(entry.reps != null) bits.push(`${entry.reps} reps`);
    if(entry.weight != null) bits.push(`${entry.weight} ${entry.weightUnit}`);
    if(entry.durationSec) bits.push(formatSecondsLong(entry.durationSec));
    if(entry.distanceKm != null) bits.push(`${entry.distanceKm} km`);
    return `
      <div class="today-item compact-item">
        <div class="entry-line"><span class="entry-name">${entry.exerciseName}</span><span class="category-pill">${entry.category}</span></div>
        <div class="entry-detail">${bits.join(' • ') || 'No numeric detail recorded.'}</div>
        ${entry.notes ? `<div class="entry-note">${entry.notes}</div>` : ''}
      </div>
    `;
  }).join('') : '<div class="entry-note">No exercise entries for this day yet.</div>';

  const metricItems = state.metricEntries
    .filter((entry) => entry.userId === state.config.currentUserId && entry.date === (els.sessionDate.value || todayISO()))
    .sort((a, b) => (b.recordTime || '').localeCompare(a.recordTime || ''));
  const noteItems = state.noteEntries
    .filter((entry) => entry.userId === state.config.currentUserId && entry.date === (els.sessionDate.value || todayISO()))
    .sort((a, b) => (b.recordTime || '').localeCompare(a.recordTime || ''));

  const metricHtml = metricItems.map((entry) => {
    const parts = [];
    if(entry.recordTime) parts.push(formatTimeShort(entry.recordTime));
    if(entry.bodyWeight != null) parts.push(formatWeight(entry.bodyWeight, entry.bodyWeightUnit));
    if(entry.steps != null) parts.push(`${entry.steps} steps`);
    if(entry.systolic != null || entry.diastolic != null) parts.push(`BP ${entry.systolic ?? '—'}/${entry.diastolic ?? '—'}`);
    return `<div class="metric-item"><div class="entry-detail">${parts.join(' • ') || 'Metric entry'}</div>${entry.notes ? `<div class="entry-note">${entry.notes}</div>` : ''}</div>`;
  }).join('');

  const noteHtml = noteItems.map((entry) => `
    <div class="note-item">
      <div class="entry-line"><span class="entry-name">${entry.title || 'Note'}</span>${entry.recordTime ? `<span class="inline-pill">${formatTimeShort(entry.recordTime)}</span>` : ''}</div>
      <div class="entry-note">${entry.body || ''}</div>
    </div>
  `).join('');

  els.todayContextList.innerHTML = metricHtml + noteHtml || '<div class="entry-note">No metric or note entries for this day yet.</div>';
}

function numberOrNull(value){
  if(value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

init();
