// Every Brainrot Express sound is synthesized with WebAudio, so the game ships
// no audio files. The context is created on the first user gesture (browsers
// block audio before one), and every call is a no-op until then.

export function createSound() {
  let ctx = null, master, musicBus, sfx, noise, engine, clackAt = 0, musicNext = 0, step = 0, muted = false, hornNodes = null, squeal;
  const intensity = { combo: 0 };
  try { muted = localStorage.getItem('brainrot-muted') === '1'; } catch {}

  function unlock() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : .8; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = .32; musicBus.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Engine: a filtered sawtooth whose pitch follows speed.
    const osc = ctx.createOscillator(), sub = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    osc.type = 'sawtooth'; sub.type = 'square'; filter.type = 'lowpass'; filter.frequency.value = 400; gain.gain.value = 0;
    osc.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(sfx); osc.start(); sub.start();
    engine = { osc, sub, filter, gain };
    // Brake squeal: a thin sine that only sings when braking hard at speed.
    const so = ctx.createOscillator(), sg = ctx.createGain(); so.type = 'sine'; so.frequency.value = 2900; sg.gain.value = 0; so.connect(sg); sg.connect(sfx); so.start();
    squeal = { so, sg };
    musicNext = ctx.currentTime + .1;
  }

  function env(node, t, a, peak, decay, end = .0001) {
    node.gain.setValueAtTime(.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(end, t + a + decay);
  }
  function tone(type, freq, t, dur, vol = .2, bus = sfx, glideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    env(g, t, .005, vol, dur); o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + .05);
  }
  function hiss(t, dur, vol, freq = 6000, bus = sfx, type = 'highpass') {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise;
    f.type = type; f.frequency.value = freq; env(g, t, .002, vol, dur); s.connect(f); f.connect(g); g.connect(bus); s.start(t, Math.random() * .5); s.stop(t + dur + .05);
  }

  // The four-bar loop: kick, hats, and a bass line that climbs with the combo.
  const bass = [55, 55, 65.4, 55, 73.4, 55, 82.4, 73.4];
  function scheduleMusic(playing) {
    if (!playing) { musicNext = ctx.currentTime + .05; return; }
    const beat = 60 / 132 / 2;
    while (musicNext < ctx.currentTime + .15) {
      const t = musicNext, s = step % 16;
      if (s % 4 === 0) { tone('sine', 150, t, .22, .5, musicBus, 42); }
      if (s % 2 === 1 || intensity.combo >= 3) hiss(t, .04, s % 4 === 2 ? .12 : .06, 7000, musicBus);
      if (s % 8 === 4) hiss(t, .12, .16, 1800, musicBus, 'bandpass');
      if (s % 2 === 0) tone('square', bass[(s / 2 + Math.floor(step / 16)) % 8] * (intensity.combo >= 5 ? 2 : 1), t, beat * 1.6, .07, musicBus);
      musicNext += beat; step++;
    }
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted; try { localStorage.setItem('brainrot-muted', muted ? '1' : '0'); } catch {}
      if (ctx) master.gain.setTargetAtTime(muted ? 0 : .8, ctx.currentTime, .05);
      return muted;
    },
    setCombo(c) { intensity.combo = c; },
    // Called every frame with the train state.
    update({ speed = 0, throttle = 0, brake = 0, playing = false, wet = false }) {
      if (!ctx) return;
      const t = ctx.currentTime;
      engine.osc.frequency.setTargetAtTime(38 + speed * 11 + throttle * 12, t, .08);
      engine.sub.frequency.setTargetAtTime(19 + speed * 5.5, t, .08);
      engine.filter.frequency.setTargetAtTime(260 + speed * 90 + throttle * 500, t, .1);
      engine.gain.gain.setTargetAtTime(playing ? .025 + Math.min(1, speed / 9) * .045 + throttle * .03 : 0, t, .12);
      squeal.sg.gain.setTargetAtTime(playing && brake > .5 && speed > 1.2 ? Math.min(.035, speed * .004) * (wet ? 1.6 : 1) : 0, t, .06);
      squeal.so.frequency.setTargetAtTime(2600 + speed * 60 + Math.sin(t * 30) * 80, t, .02);
      // Rail joints every four units: faster train, faster clack.
      if (playing && speed > .3 && t > clackAt) { hiss(t, .03, .22, 1200, sfx, 'bandpass'); hiss(t + .09, .03, .16, 1100, sfx, 'bandpass'); clackAt = t + 4 / speed; }
      scheduleMusic(playing);
    },
    horn(on) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (on && !hornNodes) {
        const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .04); g.connect(sfx);
        const oscs = [311, 370, 466].map(f => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(); return o; });
        hornNodes = { g, oscs };
      } else if (!on && hornNodes) {
        const { g, oscs } = hornNodes; g.gain.setTargetAtTime(.0001, t, .05); oscs.forEach(o => o.stop(t + .3)); hornNodes = null;
      }
    },
    // The iconic boom: a pitched-down sine thump with a crunchy edge.
    boom() {
      if (!ctx) return; const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain(), shaper = ctx.createWaveShaper(), curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
      shaper.curve = curve; o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(34, t + .9);
      env(g, t, .01, .9, 1.1); o.connect(shaper); shaper.connect(g); g.connect(sfx); o.start(t); o.stop(t + 1.2);
      hiss(t, .15, .3, 300, sfx, 'lowpass');
    },
    ding(pitch = 0) { if (!ctx) return; const t = ctx.currentTime, f = 880 * 2 ** (pitch / 12); tone('triangle', f, t, .12, .18); tone('triangle', f * 1.5, t + .06, .16, .14); },
    grade(level) {
      if (!ctx) return; const t = ctx.currentTime, notes = [[523, 659, 784, 1047], [523, 659, 784], [440, 523], [330, 294]][level];
      notes.forEach((f, i) => tone('square', f, t + i * .08, .14, .09));
    },
    beep(high) { if (!ctx) return; tone('square', high ? 1046 : 523, ctx.currentTime, high ? .45 : .18, .12); },
    // Sad trombone, for derails and missed passengers.
    bruh() {
      if (!ctx) return; const t = ctx.currentTime;
      [293, 277, 261, 246].forEach((f, i) => tone('sawtooth', f, t + i * .28, i === 3 ? .8 : .26, .1, sfx, i === 3 ? 200 : undefined));
    },
    whoosh() { if (!ctx) return; hiss(ctx.currentTime, .4, .2, 900, sfx, 'bandpass'); },
    stopAll() { if (!ctx) return; this.horn(false); engine.gain.gain.setTargetAtTime(0, ctx.currentTime, .1); squeal.sg.gain.setTargetAtTime(0, ctx.currentTime, .05); }
  };
}
