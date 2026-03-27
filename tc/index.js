import { loadState, exportState, importStateFromText, buildTodaySnapshot, getUserLabel, formatSecondsLong, todayISO } from './core.js';

let state = loadState();

const els = {
  snapshotCards: document.getElementById('snapshotCards'),
  todayBreakdown: document.getElementById('todayBreakdown'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput')
};

function render(){
  const snapshot = buildTodaySnapshot(state, todayISO(), state.config.currentUserId || '');
  const userLabel = getUserLabel(state, state.config.currentUserId);

  const cards = [
    { label: 'Active person', value: userLabel, note: 'Default for quick entry' },
    { label: 'Exercise entries today', value: String(snapshot.exerciseCount), note: `${snapshot.uniqueExercises} unique exercises` },
    { label: 'Timed duration today', value: snapshot.totalDurationSec ? formatSecondsLong(snapshot.totalDurationSec) : '—', note: 'From saved duration entries' },
    { label: 'Context items today', value: String(snapshot.metricCount + snapshot.noteCount), note: 'Metrics plus notes' }
  ];

  els.snapshotCards.innerHTML = cards.map((card) => `
    <div class="stat-card">
      <div class="stat-label">${card.label}</div>
      <div class="stat-value">${card.value}</div>
      <div class="stat-note">${card.note}</div>
    </div>
  `).join('');

  const latestMetricText = snapshot.latestMetric?.bodyWeightKg != null
    ? `${snapshot.latestMetric.bodyWeightKg.toFixed(1)} kg`
    : 'No body weight saved today';

  els.todayBreakdown.innerHTML = `
    <div class="today-item">
      <div class="entry-line"><span class="entry-name">Exercise entries</span><span class="inline-pill">${snapshot.exerciseCount}</span></div>
      <div class="entry-note">${snapshot.totalReps} reps recorded today. Timed work: ${snapshot.totalDurationSec ? formatSecondsLong(snapshot.totalDurationSec) : '—'}.</div>
    </div>
    <div class="today-item">
      <div class="entry-line"><span class="entry-name">Body metrics</span><span class="inline-pill">${snapshot.metricCount}</span></div>
      <div class="entry-note">Latest body weight: ${latestMetricText}.</div>
    </div>
    <div class="today-item">
      <div class="entry-line"><span class="entry-name">Notes</span><span class="inline-pill">${snapshot.noteCount}</span></div>
      <div class="entry-note">Use the Entry page to record shoulder response, sleep, or session observations.</div>
    </div>
  `;
}

els.exportBtn.addEventListener('click', () => exportState(state));
els.importInput.addEventListener('change', async (event) => {
  const [file] = event.target.files || [];
  if(!file) return;
  const text = await file.text();
  state = importStateFromText(text);
  render();
  event.target.value = '';
});

render();
