import {
  loadState,
  exportState,
  importStateFromText,
  buildTodaySnapshot,
  findLatestMetric,
  getUser,
  getUserLabel,
  formatSecondsLong,
  todayISO,
  formatWeight,
  calculateBMI,
  bmiBand,
  convertWeight
} from './core.js';

let state = loadState();

const els = {
  snapshotCards: document.getElementById('snapshotCards'),
  todayBreakdown: document.getElementById('todayBreakdown'),
  exportBtn: document.getElementById('exportBtn'),
  importInput: document.getElementById('importInput')
};

function render(){
  const activeUser = getUser(state, state.config.currentUserId);
  const snapshot = buildTodaySnapshot(state, todayISO(), state.config.currentUserId || '');
  const latestMetric = findLatestMetric(state, state.config.currentUserId || '');
  const bmi = latestMetric && activeUser?.heightCm ? calculateBMI(latestMetric.bodyWeight, latestMetric.bodyWeightUnit, activeUser.heightCm) : null;
  const targetSteps = activeUser?.dailyStepTarget || null;

  const cards = [
    { label: 'Active person', value: getUserLabel(state, state.config.currentUserId), note: 'Default for quick entry' },
    { label: 'Exercise entries today', value: String(snapshot.exerciseCount), note: `${snapshot.uniqueExercises} unique exercises` },
    { label: 'Timed duration today', value: snapshot.totalDurationSec ? formatSecondsLong(snapshot.totalDurationSec) : '—', note: 'From saved duration entries' },
    { label: 'Steps today', value: snapshot.totalSteps ? String(snapshot.totalSteps) : '—', note: targetSteps ? `Target ${targetSteps}` : 'Target not set yet' }
  ];

  els.snapshotCards.innerHTML = cards.map((card) => `
    <div class="stat-card">
      <div class="stat-label">${card.label}</div>
      <div class="stat-value">${card.value}</div>
      <div class="stat-note">${card.note}</div>
    </div>
  `).join('');

  const latestWeight = latestMetric?.bodyWeight != null
    ? `${formatWeight(latestMetric.bodyWeight, latestMetric.bodyWeightUnit)}${latestMetric.bodyWeightUnit === 'kg' ? ` • ${formatWeight(convertWeight(latestMetric.bodyWeight, 'kg', 'lb'), 'lb')}` : ` • ${formatWeight(convertWeight(latestMetric.bodyWeight, 'lb', 'kg'), 'kg')}`}`
    : 'No body weight recorded yet';

  const bmiText = bmi != null ? `${bmi.toFixed(1)} • ${bmiBand(bmi)}` : 'BMI not available yet';
  const profileText = activeUser?.heightCm ? `${activeUser.heightCm} cm tall` : 'Height not set yet';

  els.todayBreakdown.innerHTML = `
    <div class="today-item">
      <div class="entry-line"><span class="entry-name">Exercise entries</span><span class="inline-pill">${snapshot.exerciseCount}</span></div>
      <div class="entry-note">${snapshot.totalReps} reps recorded today. Timed work: ${snapshot.totalDurationSec ? formatSecondsLong(snapshot.totalDurationSec) : '—'}.</div>
    </div>
    <div class="today-item">
      <div class="entry-line"><span class="entry-name">Body metrics</span><span class="inline-pill">${snapshot.metricCount}</span></div>
      <div class="entry-note">Latest weight: ${latestWeight}. BMI snapshot: ${bmiText}.</div>
    </div>
    <div class="today-item">
      <div class="entry-line"><span class="entry-name">Profile</span><span class="inline-pill">${activeUser?.preferredWeightUnit?.toUpperCase() || 'KG'}</span></div>
      <div class="entry-note">${profileText}. Daily step target: ${targetSteps || 'not set'}.</div>
    </div>
    <div class="today-item">
      <div class="entry-line"><span class="entry-name">Notes</span><span class="inline-pill">${snapshot.noteCount}</span></div>
      <div class="entry-note">Use the Entry page to log shoulder response, sleep, recovery, or session context without clogging the workout flow.</div>
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
