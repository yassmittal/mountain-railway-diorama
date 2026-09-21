import * as THREE from 'three';
import { ROSTER, createPassenger } from './brainrot.js';
import { createSound } from './sound.js';
import { TUNING, gradeStop, stopAura, comboMultiplier, curveLimit, lapWeather, brakePower, rankFor, GRADES } from './rules.js';

// Brainrot Express: the diorama's train becomes a driving game. You hold the
// throttle and brake, stop the nose of the train on each glowing mark, and pick
// up the brainrot passengers before the shift clock runs out. main.js calls
// trainOptions() before moving the train, update() after, and updateCamera()
// while a shift is running.

const $ = s => document.querySelector(s);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
const mod = (x, n) => ((x % n) + n) % n;
const clamp = THREE.MathUtils.clamp;
const NOSE = 4.05;                  // head-car centre to its front face
const ORB_KMH = 90;                 // speed orbs only pay out above this

// Stops in route order. The station is the lap start; the others sit on the
// open-air stretches between the bridge, tunnel and shrine.
const STOPS = [
  { name: 'Yamaai Station', u: null, emoji: '🏯' },
  { name: 'Cliffside Halt', u: .335, emoji: '🪨' },
  { name: 'Tunnel Mouth', u: .70, emoji: '🕳️' },
  { name: 'Shrine Gate', u: .875, emoji: '⛩️' }
];

function signTexture(text, emoji) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 224;
  const x = c.getContext('2d');
  x.fillStyle = '#f7f4ea'; x.fillRect(0, 0, 512, 224);
  x.fillStyle = '#c62d25'; x.fillRect(0, 160, 512, 26);
  x.fillStyle = '#1b1d1f'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 58px Impact, "Arial Black", sans-serif'; x.fillText(`${emoji} ${text}`, 256, 88, 470);
  x.font = '700 22px -apple-system, "Segoe UI", sans-serif'; x.fillStyle = '#fff'; x.fillText('BRAINROT EXPRESS · STOP HERE', 256, 174);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createGame({ scene, camera, world, train, setMode, state, shared, cinematography }) {
  const L = train.length, sound = createSound();
  const stationU = world.stationU;
  STOPS[0].u = stationU;

  // --- Curve speed limits, sampled every half unit along the loop ----------
  const STEP = .5, samples = Math.ceil(L / STEP), limits = new Float32Array(samples), turns = new Int8Array(samples);
  for (let i = 0; i < samples; i++) {
    const s = i * STEP, a = world.curve.getTangentAt(mod((s - 4) / L, 1)), b = world.curve.getTangentAt(mod((s + 4) / L, 1));
    limits[i] = curveLimit(Math.acos(clamp(a.dot(b), -1, 1)));
    turns[i] = Math.sign(a.x * b.z - a.z * b.x) || 1;   // sign of the heading change
  }
  const limitAt = s => limits[Math.floor(mod(s, L) / STEP) % samples];
  const turnAt = s => -turns[Math.floor(mod(s, L) / STEP) % samples];
  function nextLimit(s, range) {
    let low = Infinity, at = 0;
    for (let d = 0; d <= range; d += STEP) { const l = limitAt(s + d); if (l < low - 1e-6) { low = l; at = d; } }
    return { limit: low, at };
  }

  // --- Stops: glowing stop mark, station sign, standing spot ----------------
  const surfaces = [], trainParts = new Set();
  train.cars.forEach(c => c.traverse(o => trainParts.add(o)));
  scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !trainParts.has(o) && !o.material?.transparent) surfaces.push(o); });
  const ray = new THREE.Raycaster();
  function groundBelow(x, z, fromY) {
    ray.set(V(x, fromY, z), DOWN); ray.far = 8;
    const hit = ray.intersectObjects(surfaces, false)[0];
    return hit ? hit.point.y : world.inFootprint(x, z) ? world.height(x, z) : null;
  }
  const markMat = new THREE.MeshStandardMaterial({ color: '#ffe14a', emissive: '#ffcf2e', emissiveIntensity: 1, roughness: .4 });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: .8, depthWrite: false, toneMapped: false });
  const poleMat = new THREE.MeshStandardMaterial({ color: '#3c4246', roughness: .5, metalness: .6 });
  const stops = STOPS.map((def, index) => {
    const u = def.u, base = u * L;
    const p = world.curve.getPointAt(u), t = world.curve.getTangentAt(u), n = V(t.z, 0, -t.x).normalize();
    // Stand on whichever side of the line has a plausible platform or verge.
    let best = null;
    for (const side of [1, -1]) {
      const q = p.clone().addScaledVector(n, side * 3.3), y = groundBelow(q.x, q.z, p.y + 2.6);
      if (y === null) continue;
      const score = Math.abs(y - p.y - .5);
      if (!best || score < best.score) best = { side, score, spot: V(q.x, y, q.z) };
    }
    const side = best?.side ?? 1, spot = best?.spot ?? p.clone().addScaledVector(n, 3.3);
    // The stop mark lies across the rails where the nose of the train should be.
    const mp = world.curve.getPointAt(mod((base + NOSE) / L, 1)), mt = world.curve.getTangentAt(mod((base + NOSE) / L, 1));
    const mark = new THREE.Group(); mark.position.copy(mp); mark.position.y += .2; mark.rotation.y = Math.atan2(mt.x, mt.z); scene.add(mark);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.9, .07, .32), markMat.clone()); mark.add(bar);
    for (const sx of [-1.75, 1.75]) { const cone = new THREE.Mesh(new THREE.ConeGeometry(.16, .55, 12), bar.material); cone.position.set(sx, .27, 0); mark.add(cone); }
    // Station name board beside the waiting spot.
    // Angled halfway between the track and the oncoming train so the chase camera can read it.
    const faces = n.clone().multiplyScalar(-side).sub(t).normalize();
    const sign = new THREE.Group(); sign.position.copy(spot).addScaledVector(t, 2.4); sign.rotation.y = Math.atan2(faces.x, faces.z); scene.add(sign);
    for (const sx of [-1.05, 1.05]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.6, 8), poleMat); pole.position.set(sx, 1.3, 0); pole.castShadow = true; sign.add(pole); }
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.05), new THREE.MeshStandardMaterial({ map: signTexture(def.name, def.emoji), emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0, side: THREE.DoubleSide, roughness: .6 }));
    board.material.emissiveMap = board.material.map; board.position.y = 2.2; board.castShadow = true; sign.add(board);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 40), ringMat.clone()); ring.rotation.x = -Math.PI / 2; ring.position.copy(spot); ring.position.y += .06; scene.add(ring);
    return { ...def, index, base, side, spot, facing: Math.atan2(-n.x * side, -n.z * side), bar, board, ring, passenger: null, respawnAfter: -Infinity, honked: false };
  });
  const nextAbs = (stop, after) => stop.base + L * Math.ceil((after - stop.base) / L);

  // --- Passengers ------------------------------------------------------------
  let rosterBag = [];
  function drawCharacter() { if (!rosterBag.length) rosterBag = [...ROSTER].sort(() => Math.random() - .5); return rosterBag.pop(); }
  function spawn(stop) {
    const p = createPassenger(drawCharacter());
    p.root.position.copy(stop.spot); p.root.rotation.y = stop.facing; p.root.scale.setScalar(.001);
    p.born = clockTime; p.phase = Math.random() * 10; p.hype = 0;
    scene.add(p.root); stop.passenger = p;
  }
  // Figures build fresh geometry per spawn; their materials are shared and stay.
  function dispose(p) { scene.remove(p.root); p.figure.traverse(o => o.geometry?.dispose()); p.label.material.map.dispose(); p.label.material.dispose(); }

  // --- Speed orbs --------------------------------------------------------------
  const orbGeo = new THREE.IcosahedronGeometry(.42, 0), orbRing = new THREE.TorusGeometry(.72, .055, 8, 32);
  const orbMat = new THREE.MeshStandardMaterial({ color: '#ff9cf6', emissive: '#ff2fe0', emissiveIntensity: 3.2, roughness: .3 });
  const ringOrbMat = new THREE.MeshStandardMaterial({ color: '#8ff7ff', emissive: '#27e6ff', emissiveIntensity: 3, roughness: .3 });
  const orbs = Array.from({ length: 12 }, () => {
    const g = new THREE.Group(), core = new THREE.Mesh(orbGeo, orbMat), ring = new THREE.Mesh(orbRing, ringOrbMat);
    g.add(core, ring); g.visible = false; scene.add(g);
    return { g, core, ring, s: 0, done: true, fade: 0, cluster: 0 };
  });
  const clusterHits = [0, 0, 0];
  function layOrbs(lapStart) {
    let k = 0; clusterHits.fill(0);
    for (let c = 0; c < 3; c++) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const centre = lapStart + 25 + Math.random() * (L - 45);
        const clear = stops.every(st => { const d = Math.abs(mod(centre - st.base - NOSE + L / 2, L) - L / 2); return d > 22; });
        if (!clear || [-8, 0, 8].some(d => limitAt(centre + d) * TUNING.kmh < 120)) continue;
        for (let i = 0; i < 4; i++) {
          const o = orbs[k++], s = centre + (i - 1.5) * 3.6, pt = world.curve.getPointAt(mod(s / L, 1));
          o.s = s; o.done = false; o.fade = 0; o.cluster = c; o.g.position.copy(pt); o.g.position.y += 3.4; o.g.scale.setScalar(1); o.g.visible = true;
        }
        break;
      }
    }
    for (; k < orbs.length; k++) { orbs[k].done = true; orbs[k].g.visible = false; }
  }

  // --- Game state ----------------------------------------------------------------
  let phase = 'title', resumePhase = 'play', clockTime = 0;
  let s0 = 0, lap = 0, timeLeft = 0, aura = 0, combo = 0, stats = null;
  let targetIdx = 1, targetS = 0, boarding = null, derail = null, derailMeter = 0, leanTarget = 0;
  let countdown = 0, lastBeep = 0, camMode = 'chase', shake = 0, lastFront = 0, riders = [];
  let fizzledCluster = -1, orbChain = 0;
  const input = { up: false, down: false, touchUp: false, touchDown: false, horn: false };
  let best = { aura: 0 };
  try { best = JSON.parse(localStorage.getItem('brainrot-best')) || best; } catch {}

  const hud = {
    aura: $('#g-aura'), combo: $('#g-combo'), clock: $('#g-clock'), lap: $('#g-lap'),
    stopName: $('#g-stop-name'), stopWho: $('#g-stop-who'), stopDist: $('#g-stop-dist'),
    speed: $('#g-speed'), limit: $('#g-limit'), ahead: $('#g-ahead'), meter: $('#g-meter'), meterFill: $('#g-meter i'), warn: $('#g-warn'),
    ruler: $('#g-ruler'), rulerTrain: $('#g-ruler-train'), rulerText: $('#g-ruler-text'),
    riders: $('#g-riders'), pops: $('#g-pops'), banner: $('#g-banner'), flash: $('#g-flash'), lines: $('#g-lines')
  };
  const shown = new Map();
  function set(el, value) { if (shown.get(el) !== value) { shown.set(el, value); el.textContent = value; } }
  function toggle(el, cls, on) { if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on); }

  function pop(text, kind = '', sub = '') {
    const el = document.createElement('div'); el.className = `pop ${kind}`;
    el.style.setProperty('--tilt', `${(Math.random() * 10 - 5).toFixed(1)}deg`);
    el.innerHTML = `<b></b>${sub ? '<small></small>' : ''}`; el.firstChild.textContent = text; if (sub) el.lastChild.textContent = sub;
    hud.pops.append(el); while (hud.pops.children.length > 4) hud.pops.firstChild.remove();
    setTimeout(() => el.remove(), 1700);
  }
  function banner(title, note) {
    hud.banner.innerHTML = '<b></b><span></span>'; hud.banner.firstChild.textContent = title; hud.banner.lastChild.textContent = note;
    hud.banner.classList.remove('show'); void hud.banner.offsetWidth; hud.banner.classList.add('show');
  }
  function flash(kind) { hud.flash.className = ''; void hud.flash.offsetWidth; hud.flash.className = kind; }
  function screen(id) {
    for (const el of document.querySelectorAll('.g-screen')) el.hidden = el.id !== id;
    document.body.classList.toggle('g-playing', phase === 'countdown' || phase === 'play' || phase === 'paused');
  }

  function renderTitle() {
    $('#g-best').textContent = best.aura ? `BEST ${best.aura.toLocaleString()} AURA · ${rankFor(best.aura).title}` : 'no aura yet. be the first.';
    $('#g-roster').innerHTML = [...ROSTER, ...ROSTER].map(r => `<span>${r.emoji} ${r.name}</span>`).join('');
    for (const b of document.querySelectorAll('.g-mute')) b.textContent = sound.muted ? '🔇' : '🔊';
  }

  // --- Flow ------------------------------------------------------------------------
  function resetPassengers() {
    for (const st of stops) { if (st.passenger) dispose(st.passenger); st.passenger = null; st.honked = false; }
    if (boarding) { dispose(boarding.p); boarding = null; }
  }
  function startShift() {
    sound.unlock();
    resetPassengers();
    s0 = stationU * L + L * 4;
    train.place(s0, 0);
    lap = 0; setMode(lapWeather(0).mode);
    timeLeft = TUNING.shiftSeconds; aura = 0; combo = 0; derail = null; derailMeter = 0; leanTarget = 0; riders = [];
    stats = { boarded: 0, perfect: 0, maxCombo: 0, orbs: 0, derails: 0, missed: 0, laps: 0 };
    targetIdx = 1; targetS = nextAbs(stops[1], s0 + 1);
    for (const st of stops) if (st.index !== 0) spawn(st);
    stops[0].respawnAfter = s0 + 35;
    layOrbs(s0); lastFront = s0 + NOSE;
    phase = 'countdown'; countdown = 3.6; lastBeep = 4;
    state.cinematic = false; state.paused = false; swoop = { t: 0, from: camera.position.clone(), look: lookTarget.clone() };
    camSnap = true; hud.riders.textContent = ''; sound.setCombo(0);
    screen('g-hud');
    sound.whoosh();
  }
  function endShift() {
    phase = 'over'; sound.stopAll(); sound.bruh();
    input.up = input.down = input.touchUp = input.touchDown = false;
    stats.laps = lap;
    const rank = rankFor(aura), isBest = aura > best.aura;
    if (isBest) { best = { aura, rank: rank.title, at: Date.now() }; try { localStorage.setItem('brainrot-best', JSON.stringify(best)); } catch {} }
    $('#g-final-rank').textContent = rank.title;
    $('#g-newbest').hidden = !isBest;
    $('#g-stats').innerHTML = [
      ['🚃', 'passengers', stats.boarded], ['🗿', 'perfect stops', stats.perfect], ['🔥', 'max combo', `x${stats.maxCombo}`],
      ['⚡', 'speed orbs', stats.orbs], ['💀', 'derails', stats.derails], ['🔁', 'laps', stats.laps]
    ].map(([e, k, v]) => `<div><i>${e}</i><b>${v}</b><span>${k}</span></div>`).join('');
    countUp($('#g-final-aura'), aura);
    screen('g-results');
    handBack();
  }
  function handBack() {
    // Return the train to the autopilot and the camera to the cinematic director.
    train.place(train.distance, train.speed);
    state.paused = false; state.cinematic = true; cinematography.reset();
    camera.fov = 46; camera.up.copy(UP); camera.updateProjectionMatrix();
    sound.horn(false);
  }
  function toTitle() { phase = 'title'; resetPassengers(); for (const o of orbs) { o.done = true; o.g.visible = false; } sound.stopAll(); renderTitle(); screen('g-title'); handBack(); }
  function pause(on) {
    if (on && (phase === 'play' || phase === 'countdown')) { resumePhase = phase; phase = 'paused'; state.paused = true; sound.stopAll(); screen('g-pause'); }
    else if (!on && phase === 'paused') { phase = resumePhase; state.paused = false; screen('g-hud'); }
  }
  function countUp(el, value) {
    const start = performance.now();
    const tick = now => { const t = Math.min(1, (now - start) / 1200), e = 1 - (1 - t) ** 3; el.textContent = Math.round(value * e).toLocaleString(); if (t < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  function advanceTarget() { targetIdx = (targetIdx + 1) % stops.length; targetS = nextAbs(stops[targetIdx], targetS + 1); for (const st of stops) st.honked = false; }

  function startBoarding(err) {
    const stop = stops[targetIdx], grade = gradeStop(err), p = stop.passenger;
    boarding = { t: 0, stop, p, grade, err, from: p.root.position.clone() };
    stop.passenger = null; stop.respawnAfter = targetS + 40; p.label.visible = false;
    sound.whoosh();
  }
  function finishBoarding() {
    const { grade, p, err } = boarding;
    const level = GRADES.indexOf(grade), gained = stopAura(grade, combo);
    aura += gained; timeLeft += grade.time; stats.boarded++;
    if (grade.name === 'PERFECT') stats.perfect++;
    if (grade.name === 'SLOPPY') combo = 0; else combo++;
    stats.maxCombo = Math.max(stats.maxCombo, combo); sound.setCombo(combo);
    level === 0 ? sound.boom() : sound.grade(level);
    if (level === 0) { shake = .6; flash('good'); }
    pop(grade.caption, level < 2 ? 'good big' : level === 3 ? 'bad' : '', `${Math.abs(err).toFixed(2)} m ${err > 0 ? 'past' : 'short of'} the line`);
    setTimeout(() => pop(`+${gained.toLocaleString()} AURA  +${grade.time}s`, 'gain', combo > 1 ? `COMBO x${combo} · ${comboMultiplier(combo - 1)}× multiplier` : `“${p.def.line}” — ${p.def.name}`), 380);
    riders.push(p.def.emoji); hud.riders.textContent = riders.slice(-14).join('');
    dispose(p); boarding = null; advanceTarget();
  }
  function missed() {
    const stop = stops[targetIdx];
    combo = 0; sound.setCombo(0); stats.missed++; sound.bruh(); flash('bad');
    pop('MISSED 💀', 'bad big', `${stop.passenger?.def.name ?? 'your passenger'} got left on read`);
    advanceTarget();
  }
  function triggerDerail() {
    derail = { t: 0 }; derailMeter = 0; stats.derails++; combo = 0; sound.setCombo(0);
    aura = Math.max(0, aura - TUNING.derailPenalty); timeLeft -= TUNING.derailTime;
    train.place(train.distance, 0); leanTarget = turnAt(train.distance) * .62;
    shake = 1.4; flash('bad'); sound.bruh(); sound.boom();
    pop('DERAILED 💀', 'bad big', `-${TUNING.derailPenalty} AURA · -${TUNING.derailTime}s · respect the speed limit`);
  }

  // --- Input -------------------------------------------------------------------------
  const keyMap = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
  addEventListener('keydown', e => {
    if (e.target.matches?.('input,select,textarea')) return;
    if (keyMap[e.code]) { input[keyMap[e.code]] = true; e.preventDefault(); return; }
    if (e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); if (phase === 'title' || phase === 'over') startShift(); else if (phase === 'play') honk(true); return; }
    if (e.code === 'Enter' && (phase === 'title' || phase === 'over') && !e.target.matches?.('button')) { startShift(); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') { pause(phase !== 'paused'); return; }
    if (e.code === 'KeyC') cycleCamera();
    if (e.code === 'KeyM') muteToggle();
  });
  addEventListener('keyup', e => { if (keyMap[e.code]) input[keyMap[e.code]] = false; if (e.code === 'Space') honk(false); });
  addEventListener('blur', () => { input.up = input.down = input.touchUp = input.touchDown = false; honk(false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
  function hold(el, key) {
    const on = e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); input[key] = true; el.classList.add('held'); sound.unlock(); };
    const off = () => { input[key] = false; el.classList.remove('held'); };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
  }
  hold($('#g-touch-go'), 'touchUp'); hold($('#g-touch-brake'), 'touchDown');
  const hornButton = $('#g-touch-horn');
  hornButton.addEventListener('pointerdown', e => { e.preventDefault(); honk(true); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) hornButton.addEventListener(type, () => honk(false));
  function honk(on) {
    input.horn = on; sound.horn(on && phase === 'play');
    if (!on || phase !== 'play') return;
    const stop = stops[targetIdx], p = stop.passenger;
    if (p && !stop.honked && targetS - train.distance < 45 && targetS - train.distance > 0) {
      stop.honked = true; p.hype = 1; aura += 15; pop('📯 +15 AURA', 'gain small', `${p.def.name} heard that`);
    }
  }
  function cycleCamera() { camMode = { chase: 'nose', nose: 'drone', drone: 'chase' }[camMode]; camSnap = true; pop(`CAM: ${camMode.toUpperCase()}`, 'small'); }
  function muteToggle() { const m = sound.toggleMute(); for (const b of document.querySelectorAll('.g-mute')) b.textContent = m ? '🔇' : '🔊'; }

  $('#g-play').onclick = startShift;
  $('#g-again').onclick = startShift;
  $('#g-menu').onclick = toTitle;
  $('#g-resume').onclick = () => pause(false);
  $('#g-restart').onclick = () => { phase = 'play'; startShift(); };
  $('#g-quit').onclick = toTitle;
  $('#g-pause-btn').onclick = () => pause(true);
  $('#g-cam-btn').onclick = cycleCamera;
  for (const b of document.querySelectorAll('.g-mute')) b.onclick = muteToggle;
  $('#g-share').onclick = async () => {
    const text = `I pulled ${aura.toLocaleString()} AURA as a ${rankFor(aura).title} on Brainrot Express 🚃💨 (${stats.perfect} perfect stops, x${stats.maxCombo} combo, ${stats.derails} derails)`;
    try { await navigator.clipboard.writeText(text); $('#g-share').textContent = 'COPIED ✅'; } catch { $('#g-share').textContent = 'COPY FAILED'; }
    setTimeout(() => $('#g-share').textContent = 'COPY FLEX 📋', 1800);
  };

  // --- Per-frame hooks ----------------------------------------------------------------
  function trainOptions(base) {
    if (phase === 'title' || phase === 'over') return base;
    const locked = phase !== 'play' || boarding || derail;
    const up = input.up || input.touchUp, down = input.down || input.touchDown;
    return {
      ...base, manual: true, paused: base.paused || phase === 'paused',
      throttle: locked || down ? 0 : up ? 1 : 0, brake: locked ? 1 : down ? 1 : 0,
      accel: TUNING.accel, brakeDecel: brakePower(lapWeather(lap).mode), maxSpeed: TUNING.maxSpeed, lean: leanTarget
    };
  }

  function update(dt, now) {
    clockTime += dt;
    const s = train.distance, v = train.speed, playing = phase === 'play';
    sound.update({ speed: v, throttle: trainOptions({}).throttle ?? 0, brake: input.down || input.touchDown ? 1 : 0, playing: phase === 'play' || phase === 'countdown', wet: lapWeather(lap).mode === 'rain' });

    // Passengers and stop dressing animate in every phase.
    const target = phase === 'title' || phase === 'over' ? null : stops[targetIdx];
    for (const st of stops) {
      const isTarget = st === target, pulse = .5 + .5 * Math.sin(clockTime * 6);
      st.bar.material.emissiveIntensity = isTarget ? 2.2 + pulse * 2.5 : .35;
      st.ring.visible = isTarget; st.ring.material.opacity = .45 + pulse * .45; st.ring.scale.setScalar(1 + pulse * .12);
      st.board.material.emissiveIntensity = .08 + shared.night.value * .5;
      const p = st.passenger; if (!p) continue;
      const age = clockTime - p.born, grow = age < .6 ? 1 + Math.sin(age / .6 * Math.PI) * .25 : 1;
      p.root.scale.setScalar(Math.min(1, age / .35) * grow * 1.05);
      p.hype = Math.max(0, p.hype - dt * .4);
      p.anim(clockTime * (1 + p.hype * 1.5) + p.phase);
      p.figure.position.y = p.hype > 0 ? Math.abs(Math.sin(clockTime * 12)) * .6 * p.hype : 0;
      p.label.visible = isTarget;
    }
    for (const st of stops) if (!st.passenger && phase !== 'title' && s > st.respawnAfter && Math.abs(mod(s - st.base + L / 2, L) - L / 2) > 30) spawn(st);

    // Orbs spin; collection is checked while driving.
    for (const o of orbs) {
      if (!o.g.visible) continue;
      o.core.rotation.set(clockTime * 1.7, clockTime * 2.3, 0); o.ring.rotation.set(Math.PI / 2 + Math.sin(clockTime * 2) * .4, clockTime * 3, 0);
      if (o.fade) { o.fade += dt * 4; o.g.scale.setScalar(o.collected ? 1 + o.fade * 1.5 : Math.max(.001, 1 - o.fade)); if (o.fade >= 1) o.g.visible = false; }
    }

    if (phase === 'countdown') {
      countdown -= dt; const n = Math.ceil(countdown - .6);
      if (n < lastBeep && n >= 0) { lastBeep = n; if (n > 0) { pop(String(n), 'count'); sound.beep(false); } else { pop('GO!! 🚃💨', 'count good'); sound.beep(true); phase = 'play'; } }
    }

    if (playing) {
      timeLeft -= dt;
      const front = s + NOSE;
      // Laps rotate the weather and top up the clock.
      const newLap = Math.floor((s - s0) / L);
      if (newLap > lap) {
        lap = newLap; const w = lapWeather(lap); setMode(w.mode); timeLeft += 10; layOrbs(s0 + lap * L);
        banner(`LAP ${lap + 1} · ${w.label}`, `${w.note} · +10s`); sound.ding(7);
      }
      for (const o of orbs) {
        if (o.done || front < o.s) continue;
        o.done = true; o.fade = .001;
        if (v * TUNING.kmh >= ORB_KMH) {
          o.collected = true; orbChain++; stats.orbs++; const gain = Math.round(TUNING.orbAura * comboMultiplier(combo));
          aura += gain; timeLeft += TUNING.orbTime; sound.ding(orbChain % 8);
          if (++clusterHits[o.cluster] === 4) pop('FULL SEND ⚡', 'gain', `4/4 speed orbs · +${gain * 4} AURA`);
        } else {
          o.collected = false; orbChain = 0;
          if (fizzledCluster !== o.cluster + lap * 10) { fizzledCluster = o.cluster + lap * 10; pop('too slow 🐌', 'small bad', `speed orbs need ${ORB_KMH}+ km/h`); }
        }
      }
      lastFront = front;

      // Overspeed on curves fills the derail meter and tips the train.
      const limit = limitAt(s), ratio = v / limit;
      if (!derail) {
        if (ratio > 1.04) derailMeter += (ratio - 1.02) * TUNING.derailFill * dt; else derailMeter = Math.max(0, derailMeter - .45 * dt);
        leanTarget = turnAt(s) * clamp((ratio - .96) * .9, 0, .3) * (derailMeter > 0 ? 1 : .4);
        if (derailMeter > .5) shake = Math.max(shake, derailMeter * .25);
        if (derailMeter >= 1) triggerDerail();
      } else {
        derail.t += dt;
        if (derail.t > TUNING.derailSeconds) leanTarget = 0;
        if (derail.t > TUNING.derailSeconds + .7) { derail = null; pop('rerailed. try again 🙏', 'small'); }
      }

      // Stopping on the mark boards the waiting passenger.
      if (boarding) {
        boarding.t += dt; const e = Math.min(1, boarding.t / TUNING.boardSeconds), p = boarding.p;
        const door = train.cars[0].localToWorld(V(boarding.stop.side * 1.1, 1.4, -.5));
        p.root.position.lerpVectors(boarding.from, door, e); p.root.position.y += Math.sin(e * Math.PI) * 2.6;
        p.root.rotation.y += dt * 14; p.root.scale.setScalar(1.05 * (1 - e * .7)); p.anim(clockTime * 3);
        if (e >= 1) finishBoarding();
      } else if (!derail) {
        const err = s - targetS, stop = stops[targetIdx];
        if (v < .06 && Math.abs(err) <= TUNING.stopWindow && stop.passenger && clockTime - stop.passenger.born > .4) startBoarding(err);
        else if (err > TUNING.missDistance) missed();
      }

      if (timeLeft <= 5 && Math.ceil(timeLeft) !== lastTick && timeLeft > 0) { lastTick = Math.ceil(timeLeft); sound.beep(false); }
      if (timeLeft <= 0) { timeLeft = 0; endShift(); }
    }
    if (phase === 'countdown' || phase === 'play' || phase === 'paused') renderHud(s, v);
  }
  let lastTick = 0;

  function renderHud(s, v) {
    set(hud.aura, aura.toLocaleString());
    set(hud.combo, combo > 1 ? `x${combo} COMBO · ${comboMultiplier(combo)}×` : 'no combo');
    toggle(hud.combo, 'hot', combo > 1);
    const t = Math.max(0, timeLeft);
    set(hud.clock, `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
    toggle(hud.clock, 'panic', t < 10);
    const w = lapWeather(lap);
    set(hud.lap, `LAP ${lap + 1} · ${w.label}`);
    const stop = stops[targetIdx], who = boarding?.p ?? stop.passenger, dist = targetS - s;
    set(hud.stopName, `${stop.emoji} ${stop.name}`);
    set(hud.stopWho, who ? `${who.def.emoji} ${who.def.name} is waiting` : 'nobody here yet');
    set(hud.stopDist, boarding ? 'BOARDING…' : dist > 0 ? `${Math.ceil(dist)} m` : `${(-dist).toFixed(1)} m past`);
    // Precision ruler for the final approach.
    const near = !boarding && dist < 45 && dist > -TUNING.missDistance;
    toggle(hud.ruler, 'show', near);
    if (near) {
      hud.rulerTrain.style.left = `${clamp((-dist + 45) / 51 * 100, 0, 100)}%`;
      const g = gradeStop(-dist);
      set(hud.rulerText, Math.abs(dist) < .6 ? 'ON THE LINE — BRAKE' : dist > 0 ? `${dist.toFixed(1)} m to go${g ? ' · ' + g.name + ' zone' : ''}` : `${(-dist).toFixed(1)} m past · ${g ? g.name : 'MISS'}`);
    }
    const kmh = Math.round(v * TUNING.kmh), limit = limitAt(s), ahead = nextLimit(s, v * v / (2 * brakePower(w.mode)) + 20);
    set(hud.speed, String(kmh));
    set(hud.limit, String(Math.round(limit * TUNING.kmh)));
    const warnAhead = ahead.limit < limit - 1e-6 && ahead.limit < v;
    set(hud.ahead, warnAhead ? `⚠ ${Math.round(ahead.limit * TUNING.kmh)} in ${Math.round(ahead.at)} m` : '');
    const over = v / limit > 1.04 && !derail;
    toggle(hud.warn, 'show', over);
    toggle(hud.meter, 'show', derailMeter > .02);
    hud.meterFill.style.width = `${Math.round(Math.min(1, derailMeter) * 150)}px`;
    hud.lines.style.opacity = String(clamp((kmh - 70) / 90, 0, 1) * .85);
  }

  // --- Camera ---------------------------------------------------------------------------
  let swoop = null, camSnap = true;
  const camPos = V(0, 0, 0), lookTarget = V(0, 0, 0), desired = V(0, 0, 0), look = V(0, 0, 0), fwd = V(0, 0, 0), right = V(0, 0, 0), tmp = V(0, 0, 0);
  const inTunnel = u => u > world.tunnelStart - .004 && u < world.tunnelEnd + .01;
  function updateCamera(cam, dt) {
    const head = train.cars[0], s = train.distance, v = train.speed;
    fwd.set(0, 0, 1).applyQuaternion(head.quaternion); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, UP).normalize();
    // The cab's windshields are backed by opaque rubber, so the in-tunnel view
    // is a nose camera just ahead of the glass. It stays inside the bore.
    const tunnel = inTunnel(mod(s / L, 1)), mode = camMode === 'chase' && tunnel ? 'nose' : camMode;
    let near = .3;
    if (mode === 'nose') {
      desired.copy(head.localToWorld(tmp.set(0, 2.35, 4.35))); look.copy(head.localToWorld(tmp.set(0, 1.6, 30)));
      cam.up.set(0, 1, 0).applyQuaternion(head.quaternion); camPos.copy(desired); lookTarget.copy(look); near = .1;
    } else {
      if (mode === 'chase') {
        desired.copy(world.curve.getPointAt(mod((s - 14 - v * .5) / L, 1))); desired.y += 6.8 + v * .15;
        look.copy(head.position).addScaledVector(fwd, 7 + v * .5); look.y += 1.2;
      } else {
        desired.copy(head.position).addScaledVector(UP, 21).addScaledVector(fwd, -15).addScaledVector(right, 13);
        look.copy(head.position).addScaledVector(fwd, 9);
      }
      if (camSnap || lastMode === 'nose') { camPos.copy(desired); lookTarget.copy(look); }
      camPos.lerp(desired, 1 - Math.exp(-dt * 5)); lookTarget.lerp(look, 1 - Math.exp(-dt * 7));
      // Cuttings and hillsides would hide the train: sample the terrain along the
      // line of sight and rise until it is clear.
      let lift = 0;
      if (!tunnel) for (let f = .4; f <= 1.001; f += .15) {
        tmp.lerpVectors(lookTarget, camPos, f);
        if (world.inFootprint(tmp.x, tmp.z)) lift = Math.max(lift, (world.height(tmp.x, tmp.z) + 1.3 - tmp.y) / f);
      }
      lift = Math.min(lift, 9);
      clearance += (lift - clearance) * (1 - Math.exp(-dt * (lift > clearance ? 10 : 2)));
      cam.up.copy(UP);
    }
    camSnap = false; lastMode = mode;
    cam.position.copy(camPos); if (mode !== 'nose') cam.position.y += clearance;
    if (swoop) {
      swoop.t += dt / 1.3; const e = swoop.t >= 1 ? 1 : 1 - (1 - swoop.t) ** 3;
      cam.position.lerpVectors(swoop.from, camPos, e); tmp.lerpVectors(swoop.look, lookTarget, e);
      if (swoop.t >= 1) swoop = null; else { cam.lookAt(tmp); finish(cam, dt, v, near); return; }
    }
    if (shake > 0) { cam.position.x += (Math.random() - .5) * shake * .5; cam.position.y += (Math.random() - .5) * shake * .35; shake = Math.max(0, shake - dt * 1.6); }
    cam.lookAt(lookTarget);
    finish(cam, dt, v, near);
  }
  let lastMode = 'chase', clearance = 0;
  function finish(cam, dt, v, near) {
    const fov = 52 + v * 1.8;
    if (Math.abs(cam.fov - fov) > .05 || cam.near !== near) { cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 3)); cam.near = near; cam.updateProjectionMatrix(); }
  }

  renderTitle();
  const api = {
    get phase() { return phase; },
    get ownsCamera() { return phase === 'countdown' || phase === 'play' || phase === 'paused'; },
    trainOptions, update, updateCamera,
    ready() { document.body.classList.add('g-game'); screen('g-title'); state.cinematic = true; cinematography.reset(); },
    // Debug and test hooks, e.g. window.brainrot.debug().
    debug: () => ({ phase, s: train.distance, v: train.speed, targetIdx, targetS, err: train.distance - targetS, timeLeft, aura, combo, lap, derailMeter, limit: limitAt(train.distance), stops: stops.map(st => ({ name: st.name, side: st.side, spot: st.spot.toArray() })) }),
    start: startShift, input, stops, limitAt
  };
  return api;
}
