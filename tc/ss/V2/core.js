import { STARTER_DATA, STORAGE_KEY, TIMER_KEY } from './data.js';

export function clone(value){
  return JSON.parse(JSON.stringify(value));
}

export function todayISO(){
  return new Date().toISOString().slice(0, 10);
}

export function nowIsoString(){
  return new Date().toISOString();
}

export function createId(prefix = 'id'){
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${random}`;
}

export function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw){
      const seed = clone(STARTER_DATA);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }

    const parsed = JSON.parse(raw);
    return mergeWithSeed(parsed);
  }catch(error){
    console.warn('Falling back to starter data after load error:', error);
    const seed = clone(STARTER_DATA);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

export function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function mergeWithSeed(state){
  const seed = clone(STARTER_DATA);
  const merged = {
    ...seed,
    ...state,
    config: { ...seed.config, ...(state?.config || {}) },
    users: Array.isArray(state?.users) && state.users.length ? state.users : seed.users,
    exerciseCatalog: Array.isArray(state?.exerciseCatalog) && state.exerciseCatalog.length ? state.exerciseCatalog : seed.exerciseCatalog,
    exerciseEntries: Array.isArray(state?.exerciseEntries) ? state.exerciseEntries : seed.exerciseEntries,
    metricEntries: Array.isArray(state?.metricEntries) ? state.metricEntries : seed.metricEntries,
    noteEntries: Array.isArray(state?.noteEntries) ? state.noteEntries : seed.noteEntries,
    schemaVersion: 2
  };

  if(!state?.schemaVersion || state.schemaVersion < 2){
    merged.metricEntries = merged.metricEntries.map((entry) => ({
      bodyWeightKg: null,
      systolic: null,
      diastolic: null,
      pulseBpm: null,
      sleepHours: null,
      energy: '',
      soreness: '',
      notes: '',
      ...entry
    }));
  }

  return merged;
}

export function exportState(state){
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `tc-backup-${todayISO()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function importStateFromText(text){
  const parsed = JSON.parse(text);
  const merged = mergeWithSeed(parsed);
  saveState(merged);
  return merged;
}

export function loadTimer(){
  try{
    const raw = localStorage.getItem(TIMER_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(error){
    console.warn('Timer load failed:', error);
    return null;
  }
}

export function saveTimer(timer){
  localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
}

export function clearTimer(){
  localStorage.removeItem(TIMER_KEY);
}

export function formatSecondsCompact(seconds){
  if(seconds == null || Number.isNaN(seconds)) return '00:00';
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if(hrs > 0){
    return `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}`;
  }
  return `${pad2(mins)}:${pad2(secs)}`;
}

export function formatSecondsLong(seconds){
  if(seconds == null || Number.isNaN(seconds)) return '—';
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const parts = [];
  if(hrs) parts.push(`${hrs}h`);
  if(mins || hrs) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

export function secondsToMinuteDecimal(seconds){
  if(seconds == null || Number.isNaN(seconds)) return '';
  return (seconds / 60).toFixed(1);
}

export function minutesToSeconds(minutes){
  if(minutes == null || minutes === '') return null;
  const value = Number(minutes);
  if(Number.isNaN(value)) return null;
  return Math.round(value * 60);
}

export function secondsToMinutes(seconds){
  if(seconds == null || Number.isNaN(seconds)) return null;
  return seconds / 60;
}

export function groupByDate(entries, dateField = 'date'){
  const groups = new Map();
  for(const entry of entries){
    const key = entry[dateField] || 'Unknown';
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }));
}

export function getUserLabel(state, userId){
  return state.users.find((user) => user.id === userId)?.label || userId || 'Unknown';
}

export function getExercise(state, exerciseId){
  return state.exerciseCatalog.find((exercise) => exercise.id === exerciseId) || null;
}

export function filterEntriesByUser(entries, userId){
  if(!userId) return entries;
  return entries.filter((entry) => entry.userId === userId);
}

export function filterByDateRange(entries, startDate, endDate){
  return entries.filter((entry) => {
    if(startDate && entry.date < startDate) return false;
    if(endDate && entry.date > endDate) return false;
    return true;
  });
}

export function buildTodaySnapshot(state, dateISO, userId = ''){
  const exerciseEntries = filterEntriesByUser(state.exerciseEntries, userId).filter((entry) => entry.date === dateISO);
  const metricEntries = filterEntriesByUser(state.metricEntries, userId).filter((entry) => entry.date === dateISO);
  const noteEntries = filterEntriesByUser(state.noteEntries, userId).filter((entry) => entry.date === dateISO);

  const totalDurationSec = exerciseEntries.reduce((sum, entry) => sum + (entry.durationSec || 0), 0);
  const totalReps = exerciseEntries.reduce((sum, entry) => sum + (entry.reps || 0), 0);
  const uniqueExercises = new Set(exerciseEntries.map((entry) => entry.exerciseName)).size;

  return {
    exerciseCount: exerciseEntries.length,
    metricCount: metricEntries.length,
    noteCount: noteEntries.length,
    totalDurationSec,
    totalReps,
    uniqueExercises,
    latestMetric: metricEntries[metricEntries.length - 1] || null
  };
}

export function summariseHistory(state, filters){
  const userId = filters.userId || '';
  const exerciseId = filters.exerciseId || '';
  const category = filters.category || '';

  let exerciseEntries = filterEntriesByUser(state.exerciseEntries, userId);
  let metricEntries = filterEntriesByUser(state.metricEntries, userId);
  let noteEntries = filterEntriesByUser(state.noteEntries, userId);

  exerciseEntries = filterByDateRange(exerciseEntries, filters.startDate, filters.endDate);
  metricEntries = filterByDateRange(metricEntries, filters.startDate, filters.endDate);
  noteEntries = filterByDateRange(noteEntries, filters.startDate, filters.endDate);

  if(exerciseId){
    exerciseEntries = exerciseEntries.filter((entry) => entry.exerciseId === exerciseId);
  }

  if(category){
    exerciseEntries = exerciseEntries.filter((entry) => entry.category === category);
  }

  const totalDurationSec = exerciseEntries.reduce((sum, entry) => sum + (entry.durationSec || 0), 0);
  const totalReps = exerciseEntries.reduce((sum, entry) => sum + (entry.reps || 0), 0);

  return {
    exerciseEntries,
    metricEntries,
    noteEntries,
    totals: {
      exerciseCount: exerciseEntries.length,
      metricCount: metricEntries.length,
      noteCount: noteEntries.length,
      totalDurationSec,
      totalReps,
      uniqueExercises: new Set(exerciseEntries.map((entry) => entry.exerciseName)).size
    }
  };
}

export function buildDayGroups(state, filters){
  const summary = summariseHistory(state, filters);
  const dayMap = new Map();

  const ensureDay = (date) => {
    if(!dayMap.has(date)){
      dayMap.set(date, { date, exercises: [], metrics: [], notes: [] });
    }
    return dayMap.get(date);
  };

  for(const entry of summary.exerciseEntries){
    ensureDay(entry.date).exercises.push(entry);
  }
  for(const entry of summary.metricEntries){
    ensureDay(entry.date).metrics.push(entry);
  }
  for(const entry of summary.noteEntries){
    ensureDay(entry.date).notes.push(entry);
  }

  const days = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  return { days, totals: summary.totals };
}

export function formatDateLong(dateISO){
  if(!dateISO) return '—';
  const date = new Date(`${dateISO}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function escapeHtml(text = ''){
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function pad2(value){
  return String(value).padStart(2, '0');
}
