import {
  loadState,
  buildDayGroups,
  getUserLabel,
  formatDateLong,
  formatSecondsLong
} from './core.js';

const state = loadState();

const els = {
  filterUser: document.getElementById('filterUser'),
  filterCategory: document.getElementById('filterCategory'),
  filterExercise: document.getElementById('filterExercise'),
  filterStart: document.getElementById('filterStart'),
  filterEnd: document.getElementById('filterEnd'),
  searchText: document.getElementById('searchText'),
  historyStats: document.getElementById('historyStats'),
  historyTimeline: document.getElementById('historyTimeline')
};

function init(){
  populateFilters();
  attachEvents();
  render();
}

function populateFilters(){
  els.filterUser.innerHTML = ['<option value="">All people</option>', ...state.users.map((user) => `<option value="${user.id}">${user.label}</option>`)].join('');

  const categories = Array.from(new Set(state.exerciseCatalog.map((exercise) => exercise.category))).sort();
  els.filterCategory.innerHTML = ['<option value="">All categories</option>', ...categories.map((category) => `<option value="${category}">${titleCase(category)}</option>`)].join('');

  els.filterExercise.innerHTML = ['<option value="">All exercises</option>', ...state.exerciseCatalog.map((exercise) => `<option value="${exercise.id}">${exercise.name}</option>`), '<option value="custom">Custom entry</option>'].join('');
}

function attachEvents(){
  [els.filterUser, els.filterCategory, els.filterExercise, els.filterStart, els.filterEnd, els.searchText].forEach((element) => {
    element.addEventListener('input', render);
    element.addEventListener('change', render);
  });
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
      ...day.exercises.flatMap((entry) => [entry.exerciseName, entry.notes, entry.resistance, entry.category]),
      ...day.metrics.flatMap((entry) => [entry.notes, entry.energy, entry.soreness]),
      ...day.notes.flatMap((entry) => [entry.title, entry.body])
    ].join(' ').toLowerCase();
    return haystack.includes(searchText);
  });
}

function renderStats(totals, userId){
  const cards = [
    { label: 'Exercises', value: totals.exerciseCount, note: `${totals.uniqueExercises} unique exercises` },
    { label: 'Metrics', value: totals.metricCount, note: userId ? `For ${getUserLabel(state, userId)}` : 'Across all people' },
    { label: 'Notes', value: totals.noteCount, note: 'Session context entries' },
    { label: 'Timed work', value: totals.totalDurationSec ? formatSecondsLong(totals.totalDurationSec) : '—', note: `${totals.totalReps} reps recorded` }
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
  if(entry.sets != null) details.push(`${entry.sets} sets`);
  if(entry.reps != null) details.push(`${entry.reps} reps`);
  if(entry.weight != null) details.push(`${entry.weight} ${entry.weightUnit}`);
  if(entry.durationSec) details.push(formatSecondsLong(entry.durationSec));
  if(entry.distanceKm != null) details.push(`${entry.distanceKm} km`);
  if(entry.resistance) details.push(`Resistance ${entry.resistance}`);
  if(entry.side) details.push(`Side ${entry.side}`);
  if(entry.effort) details.push(`Effort ${entry.effort}`);
  if(entry.jointPain) details.push(`Joint pain ${entry.jointPain}`);

  return `
    <div class="timeline-item">
      <div class="entry-line">
        <span class="entry-name">${entry.exerciseName}</span>
        <span class="user-pill">${getUserLabel(state, entry.userId)}</span>
        <span class="category-pill">${entry.category}</span>
      </div>
      <div class="entry-detail">${details.length ? details.join(' • ') : 'No numeric detail entered.'}</div>
      ${entry.notes ? `<div class="timeline-note">${entry.notes}</div>` : ''}
    </div>
  `;
}

function renderMetric(entry){
  const parts = [];
  if(entry.bodyWeightKg != null) parts.push(`Weight ${entry.bodyWeightKg.toFixed(1)} kg`);
  if(entry.systolic != null || entry.diastolic != null) parts.push(`BP ${entry.systolic ?? '—'}/${entry.diastolic ?? '—'}`);
  if(entry.pulseBpm != null) parts.push(`Pulse ${entry.pulseBpm} bpm`);
  if(entry.sleepHours != null) parts.push(`Sleep ${entry.sleepHours} hrs`);
  if(entry.energy) parts.push(`Energy ${entry.energy}`);
  if(entry.soreness) parts.push(`Soreness ${entry.soreness}`);

  return `
    <div class="timeline-item">
      <div class="entry-line">
        <span class="entry-name">Body metric</span>
        <span class="user-pill">${getUserLabel(state, entry.userId)}</span>
      </div>
      <div class="entry-detail">${parts.join(' • ') || 'No metric detail entered.'}</div>
      ${entry.notes ? `<div class="timeline-note">${entry.notes}</div>` : ''}
    </div>
  `;
}

function renderNote(entry){
  return `
    <div class="timeline-item">
      <div class="entry-line">
        <span class="entry-name">${entry.title || 'Session note'}</span>
        <span class="user-pill">${getUserLabel(state, entry.userId)}</span>
      </div>
      <div class="timeline-note">${entry.body || ''}</div>
    </div>
  `;
}

function titleCase(value){
  return value.charAt(0).toUpperCase() + value.slice(1);
}

init();
