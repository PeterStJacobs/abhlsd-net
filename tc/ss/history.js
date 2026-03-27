import {
  loadState,
  saveState,
  buildDayGroups,
  getExercise,
  getExerciseProfile,
  getUser,
  getUserLabel,
  formatDateLong,
  formatSecondsLong,
  formatTimeShort,
  formatWeight,
  convertWeight,
  calculateBMI,
  titleCase,
  minutesToSeconds
} from './core.js';

let state = loadState();
let editMode = null;

const els = {
  filterUser: document.getElementById('filterUser'),
  filterCategory: document.getElementById('filterCategory'),
  filterExercise: document.getElementById('filterExercise'),
  filterStart: document.getElementById('filterStart'),
  filterEnd: document.getElementById('filterEnd'),
  searchText: document.getElementById('searchText'),
  historyStats: document.getElementById('historyStats'),
  historyTimeline: document.getElementById('historyTimeline'),
  editModal: document.getElementById('editModal'),
  editModalBackdrop: document.getElementById('editModalBackdrop'),
  editModalTitle: document.getElementById('editModalTitle'),
  editModalSubtitle: document.getElementById('editModalSubtitle'),
  closeEditModal: document.getElementById('closeEditModal'),
  editExerciseForm: document.getElementById('editExerciseForm'),
  editMetricForm: document.getElementById('editMetricForm'),
  editNoteForm: document.getElementById('editNoteForm'),
  editExerciseIdHidden: document.getElementById('editExerciseIdHidden'),
  editExerciseDate: document.getElementById('editExerciseDate'),
  editExerciseTime: document.getElementById('editExerciseTime'),
  editExerciseUser: document.getElementById('editExerciseUser'),
  editExerciseSelect: document.getElementById('editExerciseSelect'),
  editCustomNameWrap: document.getElementById('editCustomNameWrap'),
  editCustomExerciseName: document.getElementById('editCustomExerciseName'),
  editCustomCategoryWrap: document.getElementById('editCustomCategoryWrap'),
  editCustomCategory: document.getElementById('editCustomCategory'),
  editSets: document.getElementById('editSets'),
  editReps: document.getElementById('editReps'),
  editWeight: document.getElementById('editWeight'),
  editWeightUnit: document.getElementById('editWeightUnit'),
  editDurationMin: document.getElementById('editDurationMin'),
  editDistanceKm: document.getElementById('editDistanceKm'),
  editResistance: document.getElementById('editResistance'),
  editSide: document.getElementById('editSide'),
  editEffort: document.getElementById('editEffort'),
  editJointPain: document.getElementById('editJointPain'),
  editBikeFields: document.getElementById('editBikeFields'),
  editWalkingFields: document.getElementById('editWalkingFields'),
  editRowingFields: document.getElementById('editRowingFields'),
  editAvgHr: document.getElementById('editAvgHr'),
  editMaxHr: document.getElementById('editMaxHr'),
  editWorkoutCalories: document.getElementById('editWorkoutCalories'),
  editAvgSpeedKmh: document.getElementById('editAvgSpeedKmh'),
  editWalkAvgHr: document.getElementById('editWalkAvgHr'),
  editWalkMaxHr: document.getElementById('editWalkMaxHr'),
  editWalkCalories: document.getElementById('editWalkCalories'),
  editExerciseSteps: document.getElementById('editExerciseSteps'),
  editAvgCadence: document.getElementById('editAvgCadence'),
  editAvgPace500: document.getElementById('editAvgPace500'),
  editAvgStrokeRate: document.getElementById('editAvgStrokeRate'),
  editRowAvgHr: document.getElementById('editRowAvgHr'),
  editRowMaxHr: document.getElementById('editRowMaxHr'),
  editAvgPower: document.getElementById('editAvgPower'),
  editExerciseNotes: document.getElementById('editExerciseNotes'),
  editMetricIdHidden: document.getElementById('editMetricIdHidden'),
  editMetricDate: document.getElementById('editMetricDate'),
  editMetricTime: document.getElementById('editMetricTime'),
  editMetricUser: document.getElementById('editMetricUser'),
  editBodyWeight: document.getElementById('editBodyWeight'),
  editBodyWeightUnit: document.getElementById('editBodyWeightUnit'),
  editSleepHours: document.getElementById('editSleepHours'),
  editMetricSteps: document.getElementById('editMetricSteps'),
  editSystolic: document.getElementById('editSystolic'),
  editDiastolic: document.getElementById('editDiastolic'),
  editPulseBpm: document.getElementById('editPulseBpm'),
  editEnergy: document.getElementById('editEnergy'),
  editSoreness: document.getElementById('editSoreness'),
  editMetricNotes: document.getElementById('editMetricNotes'),
  editNoteIdHidden: document.getElementById('editNoteIdHidden'),
  editNoteDate: document.getElementById('editNoteDate'),
  editNoteTime: document.getElementById('editNoteTime'),
  editNoteUser: document.getElementById('editNoteUser'),
  editNoteTitle: document.getElementById('editNoteTitle'),
  editNoteBody: document.getElementById('editNoteBody')
};

function init(){
  populateFilters();
  attachEvents();
  render();
}

function populateFilters(){
  const userOptions = ['<option value="">All people</option>', ...state.users.map((user) => `<option value="${user.id}">${user.label}</option>`)].join('');
  els.filterUser.innerHTML = userOptions;
  els.editExerciseUser.innerHTML = userOptions.replace('All people', 'Select person');
  els.editMetricUser.innerHTML = userOptions.replace('All people', 'Select person');
  els.editNoteUser.innerHTML = userOptions.replace('All people', 'Select person');

  const categories = Array.from(new Set(state.exerciseCatalog.map((exercise) => exercise.category))).sort();
  els.filterCategory.innerHTML = ['<option value="">All categories</option>', ...categories.map((category) => `<option value="${category}">${titleCase(category)}</option>`)].join('');

  const exerciseOptions = ['<option value="">All exercises</option>', ...state.exerciseCatalog.map((exercise) => `<option value="${exercise.id}">${exercise.name}</option>`), '<option value="custom">Custom entry</option>'];
  els.filterExercise.innerHTML = exerciseOptions.join('');
  els.editExerciseSelect.innerHTML = ['<option value="">Choose exercise</option>', ...state.exerciseCatalog.map((exercise) => `<option value="${exercise.id}">${exercise.name}</option>`), '<option value="custom">Custom entry</option>'].join('');
}

function attachEvents(){
  [els.filterUser, els.filterCategory, els.filterExercise, els.filterStart, els.filterEnd, els.searchText].forEach((element) => {
    element.addEventListener('input', render);
    element.addEventListener('change', render);
  });
  els.historyTimeline.addEventListener('click', handleTimelineClick);
  els.closeEditModal.addEventListener('click', closeEditModal);
  els.editModalBackdrop.addEventListener('click', closeEditModal);
  els.editExerciseSelect.addEventListener('change', syncEditExerciseFields);
  els.editCustomCategory.addEventListener('change', syncEditExerciseFields);
  els.editExerciseForm.addEventListener('submit', saveEditedExercise);
  els.editMetricForm.addEventListener('submit', saveEditedMetric);
  els.editNoteForm.addEventListener('submit', saveEditedNote);
}

function getFilters(){
  return {
    userId: els.filterUser.value,
    category: els.filterCategory.value,
    exerciseId: els.filterExercise.value,
    startDate: els.filterStart.value,
    endDate: els.filterEnd.value,
    searchText: els.searchText.value.trim().toLowerCase()
  };
}

function render(){
  const filters = getFilters();
  const result = buildDayGroups(state, filters);
  const filteredDays = applyTextSearch(result.days, filters.searchText);
  renderStats(result.totals, filters.userId);
  renderTimeline(filteredDays);
}

function applyTextSearch(days, searchText){
  if(!searchText) return days;
  return days.filter((day) => {
    const haystack = [
      ...day.exercises.flatMap((entry) => [entry.exerciseName, entry.notes, entry.resistance, entry.category, entry.avgPace500]),
      ...day.metrics.flatMap((entry) => [entry.notes, entry.energy, entry.soreness, entry.bodyWeight, entry.steps]),
      ...day.notes.flatMap((entry) => [entry.title, entry.body])
    ].join(' ').toLowerCase();
    return haystack.includes(searchText);
  });
}

function renderStats(totals, userId){
  const selectedUser = userId ? getUser(state, userId) : null;
  const latestMetric = userId ? state.metricEntries.filter((entry) => entry.userId === userId).sort((a, b) => (b.date + (b.recordTime || '')).localeCompare(a.date + (a.recordTime || '')))[0] : null;
  const bmi = latestMetric && selectedUser?.heightCm ? calculateBMI(latestMetric.bodyWeight, latestMetric.bodyWeightUnit, selectedUser.heightCm) : null;

  const cards = [
    { label: 'Exercises', value: totals.exerciseCount, note: `${totals.uniqueExercises} unique exercises` },
    { label: 'Metrics', value: totals.metricCount, note: userId ? `For ${getUserLabel(state, userId)}` : 'Across all people' },
    { label: 'Notes', value: totals.noteCount, note: 'Session context entries' },
    { label: 'Timed work', value: totals.totalDurationSec ? formatSecondsLong(totals.totalDurationSec) : '—', note: `${totals.totalReps} reps • ${totals.totalCalories || 0} kcal • ${totals.totalSteps || 0} steps` },
    { label: 'BMI', value: bmi != null ? bmi.toFixed(1) : '—', note: userId ? 'Uses latest weight + stored height' : 'Select a person to calculate' }
  ];

  els.historyStats.innerHTML = cards.map((card) => `
    <div class="stat-card">
      <div class="stat-label">${card.label}</div>
      <div class="stat-value">${card.value}</div>
      <div class="stat-note">${card.note}</div>
    </div>
  `).join('');
}

function renderTimeline(days){
  if(!days.length){
    els.historyTimeline.innerHTML = `<div class="empty-state">No matching history yet. Try loosening the filters.</div>`;
    return;
  }

  els.historyTimeline.innerHTML = days.map((day) => `
    <article class="timeline-day">
      <div class="timeline-date">
        <div>
          <div class="timeline-date-main">${formatDateLong(day.date)}</div>
          <div class="entry-detail">${day.exercises.length} exercises • ${day.metrics.length} metrics • ${day.notes.length} notes</div>
        </div>
      </div>

      ${day.exercises.length ? `
        <section class="timeline-section">
          <div class="timeline-section-title">Exercise entries</div>
          ${day.exercises.map(renderExercise).join('')}
        </section>
      ` : ''}

      ${day.metrics.length ? `
        <section class="timeline-section">
          <div class="timeline-section-title">Body metrics</div>
          ${day.metrics.map(renderMetric).join('')}
        </section>
      ` : ''}

      ${day.notes.length ? `
        <section class="timeline-section">
          <div class="timeline-section-title">Notes</div>
          ${day.notes.map(renderNote).join('')}
        </section>
      ` : ''}
    </article>
  `).join('');
}

function renderExercise(entry){
  const details = [];
  if(entry.recordTime) details.push(formatTimeShort(entry.recordTime));
  if(entry.sets != null) details.push(`${entry.sets} sets`);
  if(entry.reps != null) details.push(`${entry.reps} reps`);
  if(entry.weight != null) details.push(`${entry.weight} ${entry.weightUnit}`);
  if(entry.durationSec) details.push(formatSecondsLong(entry.durationSec));
  if(entry.distanceKm != null) details.push(`${entry.distanceKm} km`);
  if(entry.resistance) details.push(`Resistance ${entry.resistance}`);
  if(entry.side) details.push(`Side ${entry.side}`);
  if(entry.effort) details.push(`Effort ${entry.effort}`);
  if(entry.jointPain) details.push(`Joint pain ${entry.jointPain}`);
  if(entry.avgHr != null) details.push(`Avg HR ${entry.avgHr}`);
  if(entry.maxHr != null) details.push(`Max HR ${entry.maxHr}`);
  if(entry.workoutCalories != null) details.push(`${entry.workoutCalories} kcal`);
  if(entry.avgSpeedKmh != null) details.push(`${entry.avgSpeedKmh} km/h`);
  if(entry.steps != null) details.push(`${entry.steps} steps`);
  if(entry.avgCadence != null) details.push(`${entry.avgCadence} spm`);
  if(entry.avgPace500) details.push(`${entry.avgPace500}/500m`);
  if(entry.avgStrokeRate != null) details.push(`${entry.avgStrokeRate} spm`);
  if(entry.avgPower != null) details.push(`${entry.avgPower} W`);

  return `
    <div class="timeline-item">
      <div class="entry-line entry-line-between">
        <div class="entry-line">
          <span class="entry-name">${entry.exerciseName}</span>
          <span class="user-pill">${getUserLabel(state, entry.userId)}</span>
          <span class="category-pill">${entry.category}</span>
        </div>
        <button class="btn-ghost small-btn" type="button" data-edit-type="exercise" data-entry-id="${entry.id}">Edit</button>
      </div>
      <div class="entry-detail">${details.length ? details.join(' • ') : 'No numeric detail entered.'}</div>
      ${entry.notes ? `<div class="timeline-note">${entry.notes}</div>` : ''}
    </div>
  `;
}

function renderMetric(entry){
  const user = getUser(state, entry.userId);
  const parts = [];
  if(entry.recordTime) parts.push(formatTimeShort(entry.recordTime));
  if(entry.bodyWeight != null){
    const primary = formatWeight(entry.bodyWeight, entry.bodyWeightUnit);
    const alt = entry.bodyWeightUnit === 'kg' ? formatWeight(convertWeight(entry.bodyWeight, 'kg', 'lb'), 'lb') : formatWeight(convertWeight(entry.bodyWeight, 'lb', 'kg'), 'kg');
    parts.push(`Weight ${primary} (${alt})`);
  }
  if(entry.systolic != null || entry.diastolic != null) parts.push(`BP ${entry.systolic ?? '—'}/${entry.diastolic ?? '—'}`);
  if(entry.pulseBpm != null) parts.push(`Pulse ${entry.pulseBpm} bpm`);
  if(entry.sleepHours != null) parts.push(`Sleep ${entry.sleepHours} hrs`);
  if(entry.steps != null) parts.push(`${entry.steps} steps`);
  if(entry.energy) parts.push(`Energy ${entry.energy}`);
  if(entry.soreness) parts.push(`Soreness ${entry.soreness}`);
  const bmi = user?.heightCm && entry.bodyWeight != null ? calculateBMI(entry.bodyWeight, entry.bodyWeightUnit, user.heightCm) : null;
  if(bmi != null) parts.push(`BMI ${bmi.toFixed(1)}`);

  return `
    <div class="timeline-item">
      <div class="entry-line entry-line-between">
        <div class="entry-line">
          <span class="entry-name">Body metric</span>
          <span class="user-pill">${getUserLabel(state, entry.userId)}</span>
        </div>
        <button class="btn-ghost small-btn" type="button" data-edit-type="metric" data-entry-id="${entry.id}">Edit</button>
      </div>
      <div class="entry-detail">${parts.join(' • ') || 'No metric detail entered.'}</div>
      ${entry.notes ? `<div class="timeline-note">${entry.notes}</div>` : ''}
    </div>
  `;
}

function renderNote(entry){
  return `
    <div class="timeline-item">
      <div class="entry-line entry-line-between">
        <div class="entry-line">
          <span class="entry-name">${entry.title || 'Session note'}</span>
          <span class="user-pill">${getUserLabel(state, entry.userId)}</span>
          ${entry.recordTime ? `<span class="inline-pill">${formatTimeShort(entry.recordTime)}</span>` : ''}
        </div>
        <button class="btn-ghost small-btn" type="button" data-edit-type="note" data-entry-id="${entry.id}">Edit</button>
      </div>
      <div class="timeline-note">${entry.body || ''}</div>
    </div>
  `;
}

function handleTimelineClick(event){
  const button = event.target.closest('[data-edit-type]');
  if(!button) return;
  const type = button.dataset.editType;
  const entryId = button.dataset.entryId;
  openEditModal(type, entryId);
}

function openEditModal(type, entryId){
  editMode = type;
  els.editExerciseForm.classList.add('hidden');
  els.editMetricForm.classList.add('hidden');
  els.editNoteForm.classList.add('hidden');

  if(type === 'exercise'){
    const entry = state.exerciseEntries.find((item) => item.id === entryId);
    if(!entry) return;
    populateExerciseEditor(entry);
    els.editExerciseForm.classList.remove('hidden');
    els.editModalTitle.textContent = 'Edit exercise entry';
    els.editModalSubtitle.textContent = 'Fix the date, time, or exercise details and save.';
  }

  if(type === 'metric'){
    const entry = state.metricEntries.find((item) => item.id === entryId);
    if(!entry) return;
    populateMetricEditor(entry);
    els.editMetricForm.classList.remove('hidden');
    els.editModalTitle.textContent = 'Edit body metric';
    els.editModalSubtitle.textContent = 'Correct the time, weight, steps, or health context.';
  }

  if(type === 'note'){
    const entry = state.noteEntries.find((item) => item.id === entryId);
    if(!entry) return;
    populateNoteEditor(entry);
    els.editNoteForm.classList.remove('hidden');
    els.editModalTitle.textContent = 'Edit note';
    els.editModalSubtitle.textContent = 'Fix the date or wording without leaving history.';
  }

  els.editModal.classList.remove('hidden');
  els.editModalBackdrop.classList.remove('hidden');
}

function closeEditModal(){
  els.editModal.classList.add('hidden');
  els.editModalBackdrop.classList.add('hidden');
  editMode = null;
}

function populateExerciseEditor(entry){
  els.editExerciseIdHidden.value = entry.id;
  els.editExerciseDate.value = entry.date;
  els.editExerciseTime.value = entry.recordTime || '';
  els.editExerciseUser.value = entry.userId;
  els.editExerciseSelect.value = entry.exerciseId || 'custom';
  els.editCustomExerciseName.value = entry.exerciseId === 'custom' ? entry.exerciseName : '';
  els.editCustomCategory.value = entry.category || 'strength';
  els.editSets.value = entry.sets ?? '';
  els.editReps.value = entry.reps ?? '';
  els.editWeight.value = entry.weight ?? '';
  els.editWeightUnit.value = entry.weightUnit || 'kg';
  els.editDurationMin.value = entry.durationSec != null ? (entry.durationSec / 60).toFixed(1) : '';
  els.editDistanceKm.value = entry.distanceKm ?? '';
  els.editResistance.value = entry.resistance || '';
  els.editSide.value = entry.side || '';
  els.editEffort.value = entry.effort || '';
  els.editJointPain.value = entry.jointPain || '';
  els.editAvgHr.value = entry.avgHr ?? '';
  els.editMaxHr.value = entry.maxHr ?? '';
  els.editWorkoutCalories.value = entry.workoutCalories ?? '';
  els.editAvgSpeedKmh.value = entry.avgSpeedKmh ?? '';
  els.editWalkAvgHr.value = entry.avgHr ?? '';
  els.editWalkMaxHr.value = entry.maxHr ?? '';
  els.editWalkCalories.value = entry.workoutCalories ?? '';
  els.editExerciseSteps.value = entry.steps ?? '';
  els.editAvgCadence.value = entry.avgCadence ?? '';
  els.editAvgPace500.value = entry.avgPace500 || '';
  els.editAvgStrokeRate.value = entry.avgStrokeRate ?? '';
  els.editRowAvgHr.value = entry.avgHr ?? '';
  els.editRowMaxHr.value = entry.maxHr ?? '';
  els.editAvgPower.value = entry.avgPower ?? '';
  els.editExerciseNotes.value = entry.notes || '';
  syncEditExerciseFields();
}

function syncEditExerciseFields(){
  const selected = els.editExerciseSelect.value;
  const isCustom = selected === 'custom';
  const profile = isCustom ? els.editCustomCategory.value : getExerciseProfile(state, selected);
  els.editCustomNameWrap.classList.toggle('hidden', !isCustom);
  els.editCustomCategoryWrap.classList.toggle('hidden', !isCustom);
  els.editBikeFields.classList.toggle('hidden', profile !== 'bike');
  els.editWalkingFields.classList.toggle('hidden', profile !== 'walking');
  els.editRowingFields.classList.toggle('hidden', profile !== 'rowing');
}

function saveEditedExercise(event){
  event.preventDefault();
  const id = els.editExerciseIdHidden.value;
  const index = state.exerciseEntries.findIndex((entry) => entry.id === id);
  if(index < 0) return;

  const exercise = getExercise(state, els.editExerciseSelect.value);
  const profile = els.editExerciseSelect.value === 'custom' ? els.editCustomCategory.value : getExerciseProfile(state, els.editExerciseSelect.value);

  let avgHr = numberOrNull(els.editAvgHr.value);
  let maxHr = numberOrNull(els.editMaxHr.value);
  let workoutCalories = numberOrNull(els.editWorkoutCalories.value);
  if(profile === 'walking'){
    avgHr = numberOrNull(els.editWalkAvgHr.value);
    maxHr = numberOrNull(els.editWalkMaxHr.value);
    workoutCalories = numberOrNull(els.editWalkCalories.value);
  }
  if(profile === 'rowing'){
    avgHr = numberOrNull(els.editRowAvgHr.value);
    maxHr = numberOrNull(els.editRowMaxHr.value);
  }

  state.exerciseEntries[index] = {
    ...state.exerciseEntries[index],
    date: els.editExerciseDate.value,
    recordTime: els.editExerciseTime.value || '',
    userId: els.editExerciseUser.value,
    exerciseId: els.editExerciseSelect.value === 'custom' ? 'custom' : els.editExerciseSelect.value,
    exerciseName: els.editExerciseSelect.value === 'custom' ? els.editCustomExerciseName.value.trim() : (exercise?.name || state.exerciseEntries[index].exerciseName),
    category: exercise?.category || els.editCustomCategory.value,
    sets: numberOrNull(els.editSets.value),
    reps: numberOrNull(els.editReps.value),
    weight: numberOrNull(els.editWeight.value),
    weightUnit: els.editWeightUnit.value || 'kg',
    durationSec: minutesToSeconds(els.editDurationMin.value),
    distanceKm: numberOrNull(els.editDistanceKm.value),
    resistance: els.editResistance.value.trim(),
    side: els.editSide.value,
    effort: els.editEffort.value,
    jointPain: els.editJointPain.value,
    avgHr,
    maxHr,
    workoutCalories,
    avgSpeedKmh: profile === 'walking' ? numberOrNull(els.editAvgSpeedKmh.value) : null,
    steps: profile === 'walking' ? numberOrNull(els.editExerciseSteps.value) : null,
    avgCadence: profile === 'walking' ? numberOrNull(els.editAvgCadence.value) : null,
    avgPace500: profile === 'rowing' ? els.editAvgPace500.value.trim() : '',
    avgStrokeRate: profile === 'rowing' ? numberOrNull(els.editAvgStrokeRate.value) : null,
    avgPower: profile === 'rowing' ? numberOrNull(els.editAvgPower.value) : null,
    notes: els.editExerciseNotes.value.trim()
  };

  saveState(state);
  closeEditModal();
  render();
}

function populateMetricEditor(entry){
  els.editMetricIdHidden.value = entry.id;
  els.editMetricDate.value = entry.date;
  els.editMetricTime.value = entry.recordTime || '';
  els.editMetricUser.value = entry.userId;
  els.editBodyWeight.value = entry.bodyWeight ?? '';
  els.editBodyWeightUnit.value = entry.bodyWeightUnit || 'kg';
  els.editSleepHours.value = entry.sleepHours ?? '';
  els.editMetricSteps.value = entry.steps ?? '';
  els.editSystolic.value = entry.systolic ?? '';
  els.editDiastolic.value = entry.diastolic ?? '';
  els.editPulseBpm.value = entry.pulseBpm ?? '';
  els.editEnergy.value = entry.energy || '';
  els.editSoreness.value = entry.soreness || '';
  els.editMetricNotes.value = entry.notes || '';
}

function saveEditedMetric(event){
  event.preventDefault();
  const id = els.editMetricIdHidden.value;
  const index = state.metricEntries.findIndex((entry) => entry.id === id);
  if(index < 0) return;

  state.metricEntries[index] = {
    ...state.metricEntries[index],
    date: els.editMetricDate.value,
    recordTime: els.editMetricTime.value || '',
    userId: els.editMetricUser.value,
    bodyWeight: numberOrNull(els.editBodyWeight.value),
    bodyWeightUnit: els.editBodyWeightUnit.value || 'kg',
    sleepHours: numberOrNull(els.editSleepHours.value),
    steps: numberOrNull(els.editMetricSteps.value),
    systolic: numberOrNull(els.editSystolic.value),
    diastolic: numberOrNull(els.editDiastolic.value),
    pulseBpm: numberOrNull(els.editPulseBpm.value),
    energy: els.editEnergy.value,
    soreness: els.editSoreness.value,
    notes: els.editMetricNotes.value.trim()
  };

  saveState(state);
  closeEditModal();
  render();
}

function populateNoteEditor(entry){
  els.editNoteIdHidden.value = entry.id;
  els.editNoteDate.value = entry.date;
  els.editNoteTime.value = entry.recordTime || '';
  els.editNoteUser.value = entry.userId;
  els.editNoteTitle.value = entry.title || '';
  els.editNoteBody.value = entry.body || '';
}

function saveEditedNote(event){
  event.preventDefault();
  const id = els.editNoteIdHidden.value;
  const index = state.noteEntries.findIndex((entry) => entry.id === id);
  if(index < 0) return;

  state.noteEntries[index] = {
    ...state.noteEntries[index],
    date: els.editNoteDate.value,
    recordTime: els.editNoteTime.value || '',
    userId: els.editNoteUser.value,
    title: els.editNoteTitle.value.trim(),
    body: els.editNoteBody.value.trim()
  };

  saveState(state);
  closeEditModal();
  render();
}

function numberOrNull(value){
  if(value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

init();
