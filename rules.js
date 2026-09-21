// Pure game rules for Brainrot Express. No DOM, no Three.js scene access, so
// scripts/verify.mjs can check the scoring without a browser.

export const TUNING = {
  shiftSeconds: 60,          // starting clock; stops and orbs buy more time
  maxSpeed: 9,               // route units per second (×18 for the km/h display)
  accel: 1.05,
  brake: 1.9,
  rainBrake: 1.2,            // wet rails: the brakes are cooked
  safeSpeed: 8.2,            // limit on straight track
  kmh: 18,
  stopWindow: 5,             // metres either side of the mark that still counts as a stop
  missDistance: 6,           // passing the mark by this much abandons the passenger
  boardSeconds: 1.1,
  derailFill: 2.6,           // how fast sustained overspeed fills the derail meter
  derailSeconds: 2.6,
  derailPenalty: 250,
  derailTime: 6,
  orbAura: 25,
  orbTime: .6
};

export const GRADES = [
  { max: .6, name: 'PERFECT', mult: 3, time: 14, caption: 'PERFECT STOP 🗿' },
  { max: 1.5, name: 'GREAT', mult: 2, time: 11, caption: 'GREAT STOP 🔥' },
  { max: 2.8, name: 'OK', mult: 1.2, time: 8, caption: 'MID STOP 😐' },
  { max: TUNING.stopWindow, name: 'SLOPPY', mult: .6, time: 5, caption: 'SLOPPY 🤡' }
];

// error: signed metres from the mark (positive = overshot).
export function gradeStop(error) {
  const e = Math.abs(error);
  return GRADES.find(g => e <= g.max) ?? null;
}

export function comboMultiplier(combo) {
  return 1 + Math.min(combo, 10) * .5;
}

export function stopAura(grade, combo) {
  return Math.round(200 * grade.mult * comboMultiplier(combo));
}

// Curve speed limit from the heading change across ±4 units of track, the same
// measure the autopilot uses for its cruise speed. Snapped to 10 km/h signs.
export function curveLimit(angle) {
  const raw = TUNING.safeSpeed * Math.min(1, Math.max(.4, 1 - angle * .9));
  return Math.floor(raw * TUNING.kmh / 10) * 10 / TUNING.kmh;
}

// Weather rotates each lap, and wet rails cut braking.
export const LAP_WEATHER = [
  { mode: 'evening', label: 'GOLDEN HOUR', note: 'vibes immaculate' },
  { mode: 'rain', label: 'RAIN', note: 'wet rails · brakes are cooked' },
  { mode: 'night', label: 'NIGHT SHIFT', note: 'headlights only · lock in' },
  { mode: 'day', label: 'BROAD DAYLIGHT', note: 'no excuses now' }
];
export function lapWeather(lap) { return LAP_WEATHER[lap % LAP_WEATHER.length]; }
export function brakePower(mode) { return mode === 'rain' ? TUNING.rainBrake : TUNING.brake; }

export const RANKS = [
  { min: 0, title: 'NPC' },
  { min: 1500, title: 'Mid Conductor' },
  { min: 4000, title: 'Rizz Rail Operator' },
  { min: 8000, title: 'Sigma Stationmaster' },
  { min: 14000, title: 'Skibidi Shinkansen' },
  { min: 22000, title: 'Brainrot Final Boss' }
];
export function rankFor(aura) { return RANKS.filter(r => aura >= r.min).at(-1); }
