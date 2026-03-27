import { STARTER_DATA, STORAGE_KEY, TIMER_KEY, LEGACY_STORAGE_KEYS } from './data.js';

export function clone(value){
  return JSON.parse(JSON.stringify(value));
}

export function todayISO(){
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function nowTimeHHMM(){
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

export function createId(prefix = 'id'){
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${random}`;
}

export function loadState(){
  try{
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    if(currentRaw){
      return mergeWithSeed(JSON.parse(currentRaw));
    }

    for(const legacyKey of LEGACY_STORAGE_KEYS){
      const legacyRaw = localStorage.getItem(legacyKey);
      if(legacyRaw){
        const migrated = mergeWithSeed(JSON.parse(legacyRaw));
        saveState(migrated);
        return migrated;
      }
    }

    const seed = clone(STARTER_DATA);
    saveState(seed);
    return seed;
  }catch(error){
    console.warn('Falling back to starter data after load error:', error);
    const seed = clone(STARTER_DATA);
    saveState(seed);
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
    users: normaliseUsers(state?.users?.length ? state.users : seed.users, seed.users),
    exerciseCatalog: mergeCatalog(seed.exerciseCatalog, state?.exerciseCatalog),
    exerciseEntries: Array.isArray(state?.exerciseEntries) ? state.exerciseEntries.map((entry) => normaliseExerciseEntry(entry, seed.exerciseCatalog)) : clone(seed.exerciseEntries),
    metricEntries: Array.isArray(state?.metricEntries) ? state.metricEntries.map(normaliseMetricEntry) : clone(seed.metricEntries),
    noteEntries: Array.isArray(state?.noteEntries) ? state.noteEntries.map(normaliseNoteEntry) : clone(seed.noteEntries),
    schemaVersion: 3
  };

  if(!merged.config.currentUserId || !merged.users.some((user) => user.id === merged.config.currentUserId)){
    merged.config.currentUserId = merged.users[0]?.id || '';
  }

  return merged;
}

function mergeCatalog(seedCatalog, incomingCatalog = []){
  if(!Array.isArray(incomingCatalog) || !incomingCatalog.length) return clone(seedCatalog);
  const byId = new Map(seedCatalog.map((item) => [item.id, item]));
  for(const item of incomingCatalog){
    const seed = byId.get(item.id) || {};
    byId.set(item.id, {
      favourite: false,
      supportsDuration: false,
      detailProfile: 'standard',
      notes: '',
      muscles: '',
      category: 'strength',
      ...seed,
      ...item
    });
  }
  return Array.from(byId.values());
}

function normaliseUsers(users, seedUsers){
  const defaultsById = new Map(seedUsers.map((user) => [user.id, user]));
  return users.map((user) => ({
    heightCm: null,
    preferredWeightUnit: 'kg',
    dailyStepTarget: null,
    shortLabel: user.label?.[0]?.toUpperCase() || 'U',
    ...defaultsById.get(user.id),
    ...user
  }));
}

function normaliseExerciseEntry(entry, catalog){
  const fallbackExercise = catalog.find((item) => item.id === entry.exerciseId) || null;
  const durationSec = entry.durationSec != null ? Number(entry.durationSec) : (entry.durationMin != null ? minutesToSeconds(entry.durationMin) : null);
  return {
    id: entry.id || createId('ex'),
    date: entry.date || todayISO(),
    recordTime: entry.recordTime || '',
    userId: entry.userId || '',
    exerciseId: entry.exerciseId || '',
    exerciseName: entry.exerciseName || fallbackExercise?.name || 'Exercise',
    category: entry.category || fallbackExercise?.category || 'strength',
    sets: numberOrNull(entry.sets),
    reps: numberOrNull(entry.reps),
    weight: numberOrNull(entry.weight),
    weightUnit: entry.weightUnit || 'kg',
    durationSec,
    distanceKm: numberOrNull(entry.distanceKm),
    resistance: entry.resistance || '',
    side: entry.side || '',
    effort: entry.effort || '',
    jointPain: entry.jointPain || '',
    avgHr: numberOrNull(entry.avgHr),
    maxHr: numberOrNull(entry.maxHr),
    workoutCalories: numberOrNull(entry.workoutCalories),
    avgSpeedKmh: numberOrNull(entry.avgSpeedKmh),
    steps: numberOrNull(entry.steps),
    avgCadence: numberOrNull(entry.avgCadence),
    avgPace500: entry.avgPace500 || '',
    avgStrokeRate: numberOrNull(entry.avgStrokeRate),
    avgPower: numberOrNull(entry.avgPower),
    notes: entry.notes || ''
  };
}

function normaliseMetricEntry(entry){
  const bodyWeight = entry.bodyWeight != null ? Number(entry.bodyWeight) : (entry.bodyWeightKg != null ? Number(entry.bodyWeightKg) : null);
  const bodyWeightUnit = entry.bodyWeightUnit || (entry.bodyWeightKg != null ? 'kg' : 'kg');
  return {
    id: entry.id || createId('metric'),
    date: entry.date || todayISO(),
    recordTime: entry.recordTime || '',
    userId: entry.userId || '',
    bodyWeight: numberOrNull(bodyWeight),
    bodyWeightUnit,
    systolic: numberOrNull(entry.systolic),
    diastolic: numberOrNull(entry.diastolic),
    pulseBpm: numberOrNull(entry.pulseBpm),
    sleepHours: numberOrNull(entry.sleepHours),
    energy: entry.energy || '',
    soreness: entry.soreness || '',
    steps: numberOrNull(entry.steps),
    notes: entry.notes || ''
  };
}

function normaliseNoteEntry(entry){
  return {
    id: entry.id || createId('note'),
    date: entry.date || todayISO(),
    recordTime: entry.recordTime || '',
    userId: entry.userId || '',
    title: entry.title || '',
    body: entry.body || ''
  };
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

export function getUser(state, userId){
  return state.users.find((user) => user.id === userId) || null;
}

export function getUserLabel(state, userId){
  return getUser(state, userId)?.label || userId || 'Unknown';
}

export function getExercise(state, exerciseId){
  return state.exerciseCatalog.find((exercise) => exercise.id === exerciseId) || null;
}

export function getExerciseProfile(state, exerciseId){
  return getExercise(state, exerciseId)?.detailProfile || 'standard';
}

export function updateUserProfile(state, userId, patch){
  state.users = state.users.map((user) => user.id === userId ? { ...user, ...patch } : user);
  saveState(state);
  return state;
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
  const exerciseEntries = sortEntriesByTime(filterEntriesByUser(state.exerciseEntries, userId).filter((entry) => entry.date === dateISO));
  const metricEntries = sortEntriesByTime(filterEntriesByUser(state.metricEntries, userId).filter((entry) => entry.date === dateISO));
  const noteEntries = sortEntriesByTime(filterEntriesByUser(state.noteEntries, userId).filter((entry) => entry.date === dateISO));

  const totalDurationSec = exerciseEntries.reduce((sum, entry) => sum + (entry.durationSec || 0), 0);
  const totalReps = exerciseEntries.reduce((sum, entry) => sum + (entry.reps || 0), 0);
  const totalSteps = metricEntries.reduce((sum, entry) => sum + (entry.steps || 0), 0);
  const uniqueExercises = new Set(exerciseEntries.map((entry) => entry.exerciseName)).size;

  return {
    exerciseCount: exerciseEntries.length,
    metricCount: metricEntries.length,
    noteCount: noteEntries.length,
    totalDurationSec,
    totalReps,
    totalSteps,
    uniqueExercises,
    latestMetric: metricEntries[0] || null,
    latestNote: noteEntries[0] || null
  };
}

export function findLatestMetric(state, userId = ''){
  const metrics = sortEntriesByDateTimeDesc(filterEntriesByUser(state.metricEntries, userId));
  return metrics[0] || null;
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
  const totalCalories = exerciseEntries.reduce((sum, entry) => sum + (entry.workoutCalories || 0), 0);
  const totalSteps = metricEntries.reduce((sum, entry) => sum + (entry.steps || 0), 0) + exerciseEntries.reduce((sum, entry) => sum + (entry.steps || 0), 0);

  return {
    exerciseEntries: sortEntriesByDateTimeDesc(exerciseEntries),
    metricEntries: sortEntriesByDateTimeDesc(metricEntries),
    noteEntries: sortEntriesByDateTimeDesc(noteEntries),
    totals: {
      exerciseCount: exerciseEntries.length,
      metricCount: metricEntries.length,
      noteCount: noteEntries.length,
      totalDurationSec,
      totalReps,
      totalCalories,
      totalSteps,
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

  const days = Array.from(dayMap.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((day) => ({
      ...day,
      exercises: sortEntriesByTime(day.exercises),
      metrics: sortEntriesByTime(day.metrics),
      notes: sortEntriesByTime(day.notes)
    }));

  return { days, totals: summary.totals };
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

export function formatTimeShort(timeValue){
  if(!timeValue) return 'Time not recorded';
  const [hourRaw = '00', minuteRaw = '00'] = timeValue.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if(Number.isNaN(hour) || Number.isNaN(minute)) return timeValue;
  const suffix = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${pad2(minute)} ${suffix}`;
}

export function toKg(value, unit = 'kg'){
  if(value == null || value === '') return null;
  const numeric = Number(value);
  if(Number.isNaN(numeric)) return null;
  return unit === 'lb' ? numeric * 0.45359237 : numeric;
}

export function fromKg(valueKg, unit = 'kg'){
  if(valueKg == null || valueKg === '') return null;
  const numeric = Number(valueKg);
  if(Number.isNaN(numeric)) return null;
  return unit === 'lb' ? numeric / 0.45359237 : numeric;
}

export function convertWeight(value, fromUnit = 'kg', toUnit = 'kg'){
  const kg = toKg(value, fromUnit);
  if(kg == null) return null;
  return fromKg(kg, toUnit);
}

export function formatWeight(value, unit = 'kg', decimals = 1){
  if(value == null || value === '') return '—';
  return `${Number(value).toFixed(decimals)} ${unit}`;
}

export function calculateBMI(bodyWeight, bodyWeightUnit, heightCm){
  const weightKg = toKg(bodyWeight, bodyWeightUnit);
  const heightM = Number(heightCm) / 100;
  if(!weightKg || !heightM || Number.isNaN(heightM)) return null;
  return weightKg / (heightM * heightM);
}

export function bmiBand(bmi){
  if(bmi == null) return 'BMI unavailable';
  if(bmi < 18.5) return 'Underweight';
  if(bmi < 25) return 'Healthy range';
  if(bmi < 30) return 'Overweight';
  return 'Obesity range';
}

export function escapeHtml(text = ''){
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function titleCase(value = ''){
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

export function sortEntriesByDateTimeDesc(entries){
  return [...entries].sort(compareEntriesDesc);
}

export function sortEntriesByTime(entries){
  return [...entries].sort(compareEntriesDesc);
}

function compareEntriesDesc(a, b){
  if(a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
  return (b.recordTime || '').localeCompare(a.recordTime || '');
}

function numberOrNull(value){
  if(value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function pad2(value){
  return String(value).padStart(2, '0');
}
