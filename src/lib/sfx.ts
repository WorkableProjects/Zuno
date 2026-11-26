import { getVolume, isMuted, perceptualGain } from "./audio";

/**
 * Game and menu sound effects, synthesized live with Web Audio: no files to
 * load. Everything runs through one bus with a compressor and a short room
 * reverb so the sounds sit together. They follow the music's mute toggle and
 * volume, and nothing here can throw into the app.
 */
export type Sfx =
  | "hover"
  | "click"
  | "back"
  | "select"
  | "navigate"
  | "open"
  | "close"
  | "toggleOn"
  | "toggleOff"
  | "correct"
  | "wrong"
  | "reveal"
  | "turn"
  | "join"
  | "vote"
  | "tick"
  | "timeUp"
  | "win"
  | "pause"
  | "skip"
  | "welcome"
  | "airhorn"
  | "drumroll"
  | "sadTrombone"
  | "applause"
  | "boing"
  | "rimshot"
  | "launch"
  | "launchBlackjack"
  | "launchDrawit"
  | "launchJeopardy"
  | "launchHeadbands"
  | "launchLiar"
  | "launchRpg"
  | "launchFeud"
  | "launchGridiron"
  | "themeDark"
  | "themeLight"
  | "themeVice"
  | "themeOcean"
  | "themeZunoSpecial"
  | "themeAnthropical"
  | "achievement"
  | "equip"
  | "unequip";

interface Bus {
  ac: BaseAudioContext;
  input: GainNode;
}

let bus: Bus | null = null;

/** A short stereo room: decorrelated noise with an exponential tail, darkened toward the end. */
function roomImpulse(ac: BaseAudioContext, seconds = 0.45): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      // One-pole low-pass whose cutoff falls over the tail: highs die first, like a real room.
      const a = 0.9 - 0.7 * (1 - k);
      lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
      d[i] = lp * Math.pow(1 - k, 3.2) * 2.2;
    }
  }
  return buf;
}

/** Soft saturation curve: keeps the master strictly below full scale. */
function softClipCurve(): Float32Array {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 1.15) * 0.92;
  return c;
}

/**
 * The shared master bus: a light compressor, a short low-wet room, a gentle
 * high shelf to take the fizz off, and a soft clipper as a safety net.
 */
export function createSfxBus(ac: BaseAudioContext): Bus {
  const input = ac.createGain();
  const tone = ac.createBiquadFilter();
  tone.type = "highshelf";
  tone.frequency.value = 7000;
  tone.gain.value = -2.5;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 14;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.16;
  const verb = ac.createConvolver();
  verb.buffer = roomImpulse(ac);
  const wet = ac.createGain();
  wet.gain.value = 0.13;
  const clip = ac.createWaveShaper();
  clip.curve = softClipCurve() as Float32Array<ArrayBuffer>;
  const master = ac.createGain();
  master.gain.value = 0.9;
  input.connect(tone);
  tone.connect(comp);
  tone.connect(verb);
  verb.connect(wet).connect(comp);
  comp.connect(clip).connect(master).connect(ac.destination);
  return { ac, input };
}

function getBus(): Bus | null {
  try {
    if (!bus) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      bus = createSfxBus(new AC());
    }
    const ac = bus.ac as AudioContext;
    if (ac.state === "suspended") void ac.resume().catch(() => undefined);
    return bus;
  } catch {
    return null;
  }
}

let noiseBuf: AudioBuffer | null = null;
let noiseFor: BaseAudioContext | null = null;
function noise(ac: BaseAudioContext): AudioBuffer {
  if (!noiseBuf || noiseFor !== ac) {
    noiseFor = ac;
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** `p` is the per-play pitch factor (random within 3% for interaction sounds, 1 for musical ones). */
type Ctx = { ac: BaseAudioContext; out: AudioNode; t: number; p: number };

function env(g: GainNode, t: number, peak: number, attack: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

interface FmOpts {
  /** Modulator frequency ratio: 2.76 is glassy, 1 is brassy, 3.9 to 4 is woody. */
  ratio?: number;
  /** Peak modulation depth in multiples of the carrier frequency. */
  index?: number;
  peak?: number;
  attack?: number;
  /** Carrier end frequency as a multiple of the start, for a pitch fall or rise. */
  glide?: number;
  /** Fraction of the length over which the modulation index dies away. */
  idx?: number;
}

/** The core voice: a sine carrier phase-modulated by a second sine whose depth decays. */
function fm(c: Ctx, f: number, at: number, len: number, o: FmOpts = {}) {
  const { ac, out, t, p } = c;
  const s = t + at;
  const fr = f * p;
  const car = ac.createOscillator();
  const mod = ac.createOscillator();
  const mg = ac.createGain();
  const g = ac.createGain();
  car.frequency.setValueAtTime(fr, s);
  if (o.glide) car.frequency.exponentialRampToValueAtTime(fr * o.glide, s + len);
  mod.frequency.setValueAtTime(fr * (o.ratio ?? 2.76), s);
  if (o.glide) mod.frequency.exponentialRampToValueAtTime(fr * (o.ratio ?? 2.76) * o.glide, s + len);
  mg.gain.setValueAtTime(Math.max(0.01, fr * (o.index ?? 1.5)), s);
  mg.gain.exponentialRampToValueAtTime(Math.max(0.01, fr * 0.02), s + len * (o.idx ?? 0.5));
  mod.connect(mg).connect(car.frequency);
  env(g, s, o.peak ?? 0.3, o.attack ?? 0.003, len);
  car.connect(g).connect(out);
  car.start(s);
  mod.start(s);
  car.stop(s + len + 0.05);
  mod.stop(s + len + 0.05);
}

/** Glass: a bright, inharmonic FM ping that fades quickly. */
const glass = (c: Ctx, f: number, at: number, len: number, peak = 0.25, index = 1.6) => fm(c, f, at, len, { ratio: 2.76, index, peak, idx: 0.45 });

/** Wood: a damped knock, an FM body with a small pitch fall and a clipped partial. */
const wood = (c: Ctx, f: number, at: number, len: number, peak = 0.4) =>
  fm(c, f, at, len, { ratio: 3.93, index: 0.9, peak, glide: 0.78, idx: 0.25, attack: 0.002 });

/** Marimba-like mallet: round, with a woody overtone that is gone almost at once. */
const mallet = (c: Ctx, f: number, at: number, len: number, peak = 0.3) =>
  fm(c, f, at, len, { ratio: 4, index: 0.7, peak, idx: 0.12, attack: 0.002 });

/** Filtered noise: transient ticks when short, swishes and risers when long. */
function nz(c: Ctx, at: number, len: number, f0: number, f1: number, peak = 0.2, q = 1, type: BiquadFilterType = "bandpass", attack = 0.002) {
  const { ac, out, t, p } = c;
  const s = t + at;
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const fl = ac.createBiquadFilter();
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f0 * p, s);
  fl.frequency.exponentialRampToValueAtTime(f1 * p, s + attack + len);
  const g = ac.createGain();
  env(g, s, peak, attack, len);
  src.connect(fl).connect(g).connect(out);
  src.start(s, Math.random() * 0.5);
  src.stop(s + attack + len + 0.05);
}

/** A sine body that falls in pitch: kicks, booms and sub drops. */
function sub(c: Ctx, from: number, to: number, at: number, len: number, peak = 0.5) {
  const { ac, out, t } = c;
  const s = t + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.setValueAtTime(from, s);
  o.frequency.exponentialRampToValueAtTime(to, s + len * 0.8);
  env(g, s, peak, 0.004, len);
  o.connect(g).connect(out);
  o.start(s);
  o.stop(s + len + 0.05);
}

/** A soft sustained chord tone: three detuned oscillators through a blooming low-pass. */
function pad(c: Ctx, f: number, at: number, len: number, peak = 0.12, attack = 0.08) {
  const { ac, out, t } = c;
  const s = t + at;
  const lp = ac.createBiquadFilter();
  const g = ac.createGain();
  lp.type = "lowpass";
  lp.Q.value = 0.7;
  lp.frequency.setValueAtTime(f * 2, s);
  lp.frequency.exponentialRampToValueAtTime(f * 5, s + attack + 0.1);
  lp.frequency.exponentialRampToValueAtTime(f * 2.2, s + len);
  g.gain.setValueAtTime(0.0001, s);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), s + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, s + len);
  ([[-8, "triangle"], [0, "sine"], [8, "triangle"]] as const).forEach(([d, type]) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = d;
    o.connect(lp);
    o.start(s);
    o.stop(s + len + 0.05);
  });
  lp.connect(g).connect(out);
}

/** An FM brass voice: unison modulator whose depth swells then settles, with vibrato. */
function horn(c: Ctx, f: number, at: number, len: number, peak = 0.2, o: { bend?: number; vibrato?: number; index?: number; swell?: number } = {}) {
  const { ac, out, t } = c;
  const s = t + at;
  const index = o.index ?? 2.4;
  const g = ac.createGain();
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 5.2;
  lfoGain.gain.setValueAtTime(0, s);
  lfoGain.gain.linearRampToValueAtTime(o.vibrato ?? 6, s + len * 0.7);
  lfo.connect(lfoGain);
  g.gain.setValueAtTime(0.0001, s);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), s + 0.035);
  g.gain.setValueAtTime(Math.max(peak, 0.0002), s + Math.max(0.04, len - 0.1));
  g.gain.exponentialRampToValueAtTime(0.0001, s + len);
  [-6, 6].forEach((d) => {
    const car = ac.createOscillator();
    const mod = ac.createOscillator();
    const mg = ac.createGain();
    car.frequency.setValueAtTime(f, s);
    mod.frequency.setValueAtTime(f, s);
    if (o.bend) {
      car.frequency.exponentialRampToValueAtTime(f * o.bend, s + len);
      mod.frequency.exponentialRampToValueAtTime(f * o.bend, s + len);
    }
    car.detune.value = d;
    mod.detune.value = d;
    lfoGain.connect(car.detune);
    mg.gain.setValueAtTime(f * 0.3, s);
    mg.gain.exponentialRampToValueAtTime(f * index, s + (o.swell ?? 0.07));
    mg.gain.exponentialRampToValueAtTime(f * index * 0.45, s + len);
    mod.connect(mg).connect(car.frequency);
    car.connect(g);
    car.start(s);
    mod.start(s);
    car.stop(s + len + 0.05);
    mod.stop(s + len + 0.05);
  });
  g.connect(out);
  lfo.start(s);
  lfo.stop(s + len + 0.05);
}

/**
 * Palette: everything musical lives in D major (D, E, F#, A, B), so cues and
 * stingers sit together as one family.
 */
const N = (semis: number) => 440 * Math.pow(2, semis / 12);
const D3 = N(-19), A3 = N(-12), D4 = N(-7), Fs4 = N(-3), A4 = N(0);
const D5 = N(5), E5 = N(7), Fs5 = N(9), A5 = N(12), B5 = N(14), D6 = N(17), Fs6 = N(21), A6 = N(24);

const DESIGNS: Record<Sfx, (c: Ctx) => void> = {
  // Interaction palette: soft glass and wood, 30 to 90 ms.
  hover: (c) => {
    glass(c, 3100, 0, 0.032, 0.07, 1);
    nz(c, 0, 0.012, 8000, 6500, 0.025, 2, "highpass");
  },
  click: (c) => {
    wood(c, 640, 0, 0.055, 0.42);
    glass(c, 1960, 0.002, 0.045, 0.1, 1.2);
    nz(c, 0, 0.008, 3200, 2200, 0.07, 1.5);
  },
  back: (c) => {
    wood(c, 400, 0, 0.075, 0.42);
    glass(c, 940, 0.004, 0.06, 0.08, 1);
    nz(c, 0, 0.012, 1500, 900, 0.06, 1);
  },
  select: (c) => {
    glass(c, D6, 0, 0.07, 0.2, 1.3);
    glass(c, A6, 0.028, 0.085, 0.16, 1.1);
    wood(c, 520, 0, 0.04, 0.2);
  },
  navigate: (c) => {
    nz(c, 0, 0.075, 700, 2800, 0.1, 1.1, "bandpass", 0.035);
    wood(c, 330, 0.03, 0.05, 0.22);
    glass(c, 1480, 0.045, 0.04, 0.07, 1);
  },
  open: (c) => {
    glass(c, Fs5, 0, 0.06, 0.18, 1.2);
    glass(c, A5 * 1.26, 0.03, 0.075, 0.2, 1.2);
    nz(c, 0, 0.06, 1200, 3400, 0.05, 1, "bandpass", 0.03);
  },
  close: (c) => {
    glass(c, A5 * 1.26, 0, 0.055, 0.17, 1.1);
    glass(c, Fs5, 0.03, 0.072, 0.17, 1.2);
    nz(c, 0, 0.06, 3200, 1100, 0.045, 1, "bandpass", 0.02);
  },
  toggleOn: (c) => {
    wood(c, 780, 0, 0.035, 0.3);
    glass(c, 1760, 0.022, 0.065, 0.18, 1);
  },
  toggleOff: (c) => {
    wood(c, 560, 0, 0.035, 0.3);
    glass(c, 1170, 0.022, 0.065, 0.14, 1);
  },

  // Game cues: richer, still in D major.
  correct: (c) => {
    [D5, Fs5, A5, D6].forEach((f, i) => glass(c, f, i * 0.065, 0.85, 0.22, 1.5));
    mallet(c, D3, 0, 0.35, 0.3);
    glass(c, Fs6, 0.26, 0.9, 0.1, 1.2);
    nz(c, 0.2, 0.5, 7000, 10000, 0.03, 0.6, "bandpass", 0.1);
  },
  wrong: (c) => {
    // Two dull, slightly dissonant knocks: a muffled "no".
    [0, 0.15].forEach((at, i) => {
      fm(c, 150 - i * 12, at, 0.3, { ratio: 1.41, index: 2.2, peak: 0.42, glide: 0.8, idx: 0.5 });
      fm(c, 111 - i * 9, at, 0.3, { ratio: 1.5, index: 1.6, peak: 0.3, glide: 0.8, idx: 0.5 });
      nz(c, at, 0.05, 900, 350, 0.12, 0.8, "lowpass");
    });
    sub(c, 90, 45, 0.15, 0.4, 0.35);
  },
  reveal: (c) => {
    nz(c, 0, 0.5, 400, 7000, 0.12, 0.8, "bandpass", 0.42);
    fm(c, A3, 0, 0.55, { ratio: 2, index: 0.4, peak: 0.12, glide: 2, attack: 0.4, idx: 0.9 });
    sub(c, 100, 36, 0.5, 0.55, 0.5);
    [D5, A5, Fs6].forEach((f, i) => glass(c, f, 0.5 + i * 0.03, 1.3, 0.2, 1.8));
    nz(c, 0.5, 0.35, 5000, 9000, 0.05, 0.7, "highpass", 0.005);
  },
  turn: (c) => {
    mallet(c, A5, 0, 0.45, 0.26);
    glass(c, D6, 0.1, 0.65, 0.2, 1.1);
    glass(c, A6, 0.1, 0.5, 0.06, 0.8);
  },
  join: (c) => {
    mallet(c, Fs5, 0, 0.25, 0.28);
    glass(c, B5, 0.075, 0.4, 0.2, 1.1);
    glass(c, Fs6, 0.075, 0.3, 0.06, 0.8);
  },
  vote: (c) => {
    wood(c, 820, 0, 0.05, 0.32);
    glass(c, E5 * 2, 0.012, 0.15, 0.17, 1.2);
    nz(c, 0, 0.01, 4200, 3000, 0.07, 3);
  },
  tick: (c) => {
    wood(c, 1450, 0, 0.032, 0.3);
    nz(c, 0, 0.007, 6500, 4500, 0.1, 3, "highpass");
  },
  timeUp: (c) => {
    [0, 0.17, 0.34].forEach((at) => {
      fm(c, A4, at, 0.22, { ratio: 1.5, index: 2.5, peak: 0.26, idx: 0.5 });
      fm(c, A4 * 2.003, at, 0.2, { ratio: 2.76, index: 1.5, peak: 0.1 });
    });
    sub(c, 120, 40, 0.34, 0.65, 0.5);
    fm(c, D3, 0.34, 0.7, { ratio: 1, index: 1.2, peak: 0.2, glide: 0.9 });
  },
  win: (c) => {
    // Stinger: a quick rising D major arpeggio into a full, warm landing.
    nz(c, 0, 0.3, 500, 6000, 0.07, 0.8, "bandpass", 0.25);
    [D5, Fs5, A5, D6].forEach((f, i) => glass(c, f, i * 0.075, 0.5, 0.2, 1.4));
    const land = 0.33;
    sub(c, 140, 48, land, 0.5, 0.5);
    [D3, A3, D4, Fs4].forEach((f) => pad(c, f, land, 1.5, 0.1, 0.03));
    [D5, A5, D6, Fs6].forEach((f, i) => glass(c, f, land + i * 0.035, 1.4, 0.19, 1.6));
    glass(c, A6, land + 0.2, 1.2, 0.08, 1.2);
    nz(c, land, 0.8, 7500, 11000, 0.035, 0.6, "bandpass", 0.05);
  },
  pause: (c) => {
    mallet(c, A5, 0, 0.16, 0.24);
    mallet(c, D5, 0.09, 0.3, 0.24);
  },
  skip: (c) => {
    nz(c, 0, 0.14, 3800, 600, 0.12, 1, "bandpass", 0.015);
    glass(c, 1480, 0, 0.05, 0.09, 1);
    wood(c, 700, 0.07, 0.04, 0.12);
  },
  welcome: (c) => {
    // Stinger: a gentle, unhurried D major bloom that settles, with no hard hit.
    [D3, A3, Fs4].forEach((f) => pad(c, f, 0.02, 1.7, 0.08, 0.35));
    [A4, D5, Fs5, A5].forEach((f, i) => glass(c, f, 0.1 + i * 0.12, 1.4, 0.17, 1.3));
    glass(c, D6, 0.62, 1.7, 0.12, 1.4);
    nz(c, 0, 0.5, 600, 4500, 0.035, 0.8, "bandpass", 0.3);
    nz(c, 0.6, 0.9, 7500, 11000, 0.025, 0.6, "bandpass", 0.1);
  },

  // Soundboard: bigger, funnier, still built from the same parts.
  airhorn: (c) => {
    [D3, D3 * 1.5, D4 * 1.26].forEach((f) => horn(c, f, 0, 0.95, 0.15, { vibrato: 3, index: 3, swell: 0.03, bend: 0.97 }));
    horn(c, D4, 0, 0.95, 0.06, { vibrato: 3, index: 2 });
    nz(c, 0, 0.12, 2500, 900, 0.16, 0.8, "bandpass", 0.008);
    sub(c, 180, 100, 0, 0.3, 0.25);
  },
  drumroll: (c) => {
    // Snare-like bursts with a woody body, accelerating and swelling into a crash.
    for (let i = 0; i < 20; i++) {
      const at = i * 0.054 - i * i * 0.0006;
      const lvl = 0.07 + i * 0.011;
      nz(c, at, 0.05, 2600, 1500, lvl, 1.6);
      nz(c, at, 0.03, 6000, 4000, lvl * 0.5, 1, "highpass");
      wood(c, 210, at, 0.05, lvl * 0.7);
    }
    sub(c, 120, 45, 1.0, 0.5, 0.5);
    nz(c, 1.0, 0.9, 8000, 4500, 0.16, 0.6, "highpass", 0.004);
    glass(c, D5, 1.0, 0.8, 0.1, 1.5);
  },
  sadTrombone: (c) => {
    ([[-14, 0, 0.42], [-15, 0.46, 0.42], [-16, 0.92, 0.42]] as const).forEach(([semi, at, len]) =>
      horn(c, N(semi), at, len, 0.24, { vibrato: 2, index: 1.6, swell: 0.08 }),
    );
    horn(c, N(-17), 1.38, 1.3, 0.26, { bend: 0.84, vibrato: 14, index: 1.6, swell: 0.1 });
  },
  applause: (c) => {
    nz(c, 0, 1.8, 1800, 2600, 0.07, 0.4, "bandpass", 0.35);
    for (let i = 0; i < 70; i++) {
      const at = Math.random() * 1.75;
      const f = 900 + Math.random() * 2200;
      const swell = Math.sin((Math.min(at, 1.75) / 1.75) * Math.PI);
      nz(c, at, 0.018 + Math.random() * 0.03, f * 1.4, f, (0.05 + Math.random() * 0.09) * (0.4 + swell), 1.8 + Math.random() * 2);
    }
  },
  boing: (c) => {
    fm(c, 150, 0, 0.55, { ratio: 1, index: 0.5, peak: 0.34, glide: 3, idx: 0.9, attack: 0.004 });
    // Wobble: a second voice sweeps up and settles to give the spring its flutter.
    fm(c, 450, 0.12, 0.5, { ratio: 2.01, index: 2, peak: 0.2, glide: 0.4, idx: 0.7 });
    glass(c, 1320, 0.02, 0.4, 0.07, 2);
  },
  rimshot: (c) => {
    // Ba-dum: two toms, then a crash on the tss.
    wood(c, 230, 0, 0.12, 0.45);
    nz(c, 0, 0.08, 3200, 2000, 0.2, 1.4);
    wood(c, 150, 0.16, 0.14, 0.45);
    nz(c, 0.16, 0.08, 3200, 2000, 0.2, 1.4);
    nz(c, 0.4, 0.9, 8000, 5500, 0.17, 0.6, "highpass", 0.004);
    nz(c, 0.4, 0.12, 3600, 2200, 0.25, 1.2);
    sub(c, 100, 45, 0.4, 0.3, 0.35);
  },
  launch: (c) => {
    // Stinger: whoosh and a rising tone land on a D major impact at 0.45 s, when the wipe covers the screen.
    const land = 0.45;
    nz(c, 0, land, 250, 7000, 0.3, 0.9, "bandpass", 0.2);
    fm(c, D3, 0, land, { ratio: 2, index: 0.8, peak: 0.16, glide: 4, attack: 0.38, idx: 1 });
    sub(c, 150, 36, land, 0.6, 0.6);
    [D3, A3, D4, Fs4].forEach((f) => pad(c, f, land, 1.0, 0.1, 0.02));
    [D5, A5, D6].forEach((f, i) => glass(c, f, land + i * 0.04, 1.0, 0.18, 1.8));
    nz(c, land, 0.7, 6500, 1200, 0.2, 0.6, "bandpass", 0.005);
  },
  // Per-game launch stingers: each lands around 0.45-0.55 s, when its button effect peaks.
  launchBlackjack: (c) => {
    // Formal: a card slid off the deck, two chips set down, then a warm, quiet major-seventh chord.
    nz(c, 0, 0.16, 5200, 2600, 0.12, 0.9, "bandpass", 0.02);
    wood(c, 2100, 0.22, 0.05, 0.22);
    wood(c, 2350, 0.3, 0.05, 0.18);
    [D3, A3, Fs4, N(4) /* C#5 */].forEach((f, i) => pad(c, f, 0.42 + i * 0.03, 1.3, 0.07, 0.12));
    mallet(c, A5, 0.48, 0.9, 0.08);
  },
  launchDrawit: (c) => {
    // Friendly: two quick marker scribbles, a springy pop, and a bouncy mallet run up the scale.
    nz(c, 0, 0.09, 1800, 3600, 0.1, 3, "bandpass", 0.01);
    nz(c, 0.1, 0.09, 2400, 1500, 0.1, 3, "bandpass", 0.01);
    fm(c, 300, 0.22, 0.25, { ratio: 1, index: 0.6, peak: 0.22, glide: 2.4, idx: 0.8 });
    [D5, E5, Fs5, A5, D6].forEach((f, i) => mallet(c, f, 0.3 + i * 0.055, 0.35, 0.22));
  },
  launchJeopardy: (c) => {
    // Game show: a riser into a bright brass fanfare.
    nz(c, 0, 0.4, 400, 5000, 0.12, 0.8, "bandpass", 0.35);
    horn(c, A4, 0.4, 0.14, 0.14, { index: 2.6 });
    [D4, Fs4, A4, D5].forEach((f) => horn(c, f, 0.55, 0.7, 0.09, { vibrato: 4, index: 2.4 }));
    sub(c, 140, 45, 0.55, 0.5, 0.45);
  },
  launchHeadbands: (c) => {
    // Silly: a rising slide whistle and a cheeky two-note boop.
    fm(c, 420, 0, 0.42, { ratio: 1, index: 0.2, peak: 0.16, glide: 2.6, idx: 1, attack: 0.05 });
    glass(c, Fs5, 0.45, 0.25, 0.2, 1);
    glass(c, A5, 0.55, 0.45, 0.22, 1);
    sub(c, 220, 90, 0.45, 0.2, 0.3);
  },
  launchLiar: (c) => {
    // Suspicious: a low heartbeat, then a dissonant tritone sting with a dark tail.
    sub(c, 90, 45, 0, 0.18, 0.5);
    sub(c, 90, 45, 0.2, 0.18, 0.4);
    [D3, N(-13) /* G#3 */, D4].forEach((f) => pad(c, f, 0.42, 1.1, 0.08, 0.02));
    fm(c, N(-1), 0.42, 0.9, { ratio: 3.5, index: 2.2, peak: 0.09, glide: 0.94, idx: 0.6 });
    nz(c, 0.42, 0.8, 900, 300, 0.12, 0.7, "bandpass", 0.01);
  },
  launchRpg: (c) => {
    // Rock, paper... three fist-pump thumps, then a slam with a coin glint.
    [0, 0.14, 0.28].forEach((at, i) => { wood(c, 180 - i * 15, at, 0.1, 0.4); sub(c, 120, 60, at, 0.12, 0.3); });
    sub(c, 160, 40, 0.45, 0.5, 0.6);
    nz(c, 0.45, 0.25, 3000, 900, 0.2, 0.8, "bandpass", 0.003);
    glass(c, D6, 0.5, 0.6, 0.14, 2.2);
    glass(c, A6, 0.56, 0.5, 0.1, 2.2);
  },
  launchGridiron: (c) => {
    // Ready, hike: a referee's whistle trill, the snap, a boot on the ball, and the stadium rising.
    for (let i = 0; i < 5; i++) nz(c, i * 0.045, 0.05, 3100, 3000, 0.09, 28, "bandpass", 0.004);
    wood(c, 150, 0.28, 0.08, 0.45);
    sub(c, 130, 55, 0.28, 0.14, 0.35);
    sub(c, 190, 45, 0.48, 0.3, 0.65);
    nz(c, 0.48, 0.12, 2400, 700, 0.18, 1, "bandpass", 0.002);
    nz(c, 0.5, 0.9, 900, 1400, 0.1, 0.6, "bandpass", 0.18);
    glass(c, A5, 0.56, 0.5, 0.12, 1.4);
  },
  launchFeud: (c) => {
    // Survey says: two bright bells and a short crowd cheer.
    glass(c, A5, 0.1, 0.5, 0.28, 1.2);
    glass(c, D6, 0.32, 0.8, 0.3, 1.2);
    for (let i = 0; i < 14; i++) nz(c, 0.32 + i * 0.03, 0.08, 1800 + (i % 4) * 500, 1200, 0.07, 2, "bandpass", 0.01);
    nz(c, 0.32, 0.7, 2500, 1600, 0.08, 0.5, "bandpass", 0.1);
  },
  // Theme switches: one short signature cue per preset.
  themeDark: (c) => {
    // A soft descending pair, lights dimming.
    glass(c, A5, 0, 0.5, 0.14, 1);
    glass(c, D5, 0.09, 0.7, 0.12, 1);
  },
  themeLight: (c) => {
    // A bright rising pair, lights on.
    glass(c, D5, 0, 0.4, 0.14, 1);
    glass(c, A5, 0.08, 0.6, 0.14, 1.4);
  },
  themeVice: (c) => {
    // Neon buzz into a synth stab.
    nz(c, 0, 0.12, 120, 120, 0.06, 6, "bandpass", 0.002);
    fm(c, D4, 0.1, 0.4, { ratio: 2, index: 1.6, peak: 0.12, glide: 1, idx: 0.6 });
    fm(c, Fs4, 0.1, 0.4, { ratio: 2, index: 1.6, peak: 0.08, glide: 1, idx: 0.6 });
  },
  themeOcean: (c) => {
    // A wave washing in and out, with two droplets.
    nz(c, 0, 0.9, 300, 1400, 0.14, 0.6, "lowpass", 0.35);
    glass(c, Fs5, 0.25, 0.35, 0.1, 2.4);
    glass(c, D6, 0.4, 0.4, 0.08, 2.4);
  },
  themeZunoSpecial: (c) => {
    // The Zuno flourish: a quick major arpeggio into a shimmering chord.
    [D5, Fs5, A5, D6].forEach((f, i) => mallet(c, f, i * 0.06, 0.4, 0.16));
    [D4, Fs4, A4].forEach((f) => pad(c, f, 0.24, 0.9, 0.06, 0.05));
    glass(c, A6, 0.26, 0.8, 0.08, 1.8);
  },
  themeAnthropical: (c) => {
    // Warm wood and a leafy brush.
    wood(c, 520, 0, 0.12, 0.25);
    wood(c, 780, 0.08, 0.12, 0.2);
    nz(c, 0.05, 0.3, 4000, 2500, 0.05, 1, "bandpass", 0.05);
  },
  achievement: (c) => {
    // Unlock fanfare: a bright rising run that lands on a sparkling major chord.
    [D5, E5, Fs5, A5].forEach((f, i) => mallet(c, f, i * 0.07, 0.3, 0.18));
    [D4, Fs4, A4, D5].forEach((f) => horn(c, f, 0.3, 0.6, 0.06, { index: 2 }));
    [D6, A6].forEach((f, i) => glass(c, f, 0.32 + i * 0.05, 0.9, 0.12, 2));
    sub(c, 140, 50, 0.3, 0.35, 0.3);
  },
  equip: (c) => {
    // A snap-on click with a little shine.
    wood(c, 1600, 0, 0.04, 0.3);
    glass(c, A5, 0.03, 0.35, 0.12, 1.6);
  },
  unequip: (c) => {
    // The same click, falling.
    wood(c, 1200, 0, 0.04, 0.26);
    glass(c, D5, 0.03, 0.3, 0.08, 1);
  },
};

export const SFX_NAMES = Object.keys(DESIGNS) as Sfx[];
export const isSfx = (v: unknown): v is Sfx => typeof v === "string" && Object.prototype.hasOwnProperty.call(DESIGNS, v);

/** Interaction sounds get a little random pitch each play, so repeats never sound mechanical. */
const VARIED = new Set<Sfx>(["hover", "click", "back", "select", "navigate", "open", "close", "toggleOn", "toggleOff", "vote", "tick", "skip", "pause"]);
const pitchFor = (name: Sfx) => (VARIED.has(name) ? 1 + (Math.random() * 2 - 1) * 0.03 : 1);

/** Per-voice loudness trim: soft synthesized transients need a lift to sit beside the bigger cues. */
const TRIM: Partial<Record<Sfx, number>> = {
  hover: 4, click: 3, back: 3, select: 3, navigate: 3, open: 3, close: 3, toggleOn: 3, toggleOff: 3,
  vote: 2.5, tick: 2.5, skip: 2.5, pause: 1.8, turn: 1.5, join: 1.5, correct: 1.4, welcome: 1.5, applause: 4, boing: 1.5,
  launchBlackjack: 1.9, launchDrawit: 2, launchFeud: 2, launchGridiron: 1.6, launchHeadbands: 1.6, launchLiar: 1.3, launchRpg: 1.3, launchJeopardy: 1.15,
  themeDark: 2, themeLight: 2, themeVice: 1.6, themeOcean: 1.8, themeZunoSpecial: 1.6, themeAnthropical: 2.2, equip: 2.2, unequip: 2.2,
};
const trim = (name: Sfx) => TRIM[name] ?? 1;

/** Interaction-class sounds: the ones the delegated listener may stand in for. */
const INTERACTION = new Set<Sfx>(["hover", "click", "back", "select", "navigate", "open", "close", "toggleOn", "toggleOff"]);

/**
 * Renders one voice into any audio context (a real or offline one) through
 * the same master bus. For tests and tooling; the app uses playSfx.
 */
export function renderSfx(ac: BaseAudioContext, name: Sfx, gain = 0.5): void {
  const b = createSfxBus(ac);
  const out = ac.createGain();
  out.gain.value = gain * trim(name);
  out.connect(b.input);
  DESIGNS[name]({ ac, out, t: 0.01, p: 1 });
}

const last = new Map<Sfx, number>();
let lastAny = 0;

let sfxOn = (() => {
  try {
    return localStorage.getItem("zuno.sfx") !== "off";
  } catch {
    return true;
  }
})();
/** Sound effects can be switched off on their own, leaving the music playing. */
export function setSfxEnabled(on: boolean) {
  sfxOn = on;
  sfxListeners.forEach((l) => l());
}
const sfxListeners = new Set<() => void>();
export const isSfxEnabled = () => sfxOn;
export function subscribeSfx(l: () => void): () => void {
  sfxListeners.add(l);
  return () => void sfxListeners.delete(l);
}

/**
 * Creates and resumes the audio context. Call from inside a user gesture:
 * iOS Safari and Android Chrome keep it suspended otherwise. Plays one silent
 * sample, which iOS needs before it will output anything. Returns true once running.
 */
export function unlockSfx(): boolean {
  const b = getBus();
  if (!b) return false;
  try {
    if (b.ac.state === "suspended") void (b.ac as AudioContext).resume().catch(() => undefined);
    const src = b.ac.createBufferSource();
    src.buffer = b.ac.createBuffer(1, 1, 22050);
    src.connect(b.ac.destination);
    src.start(0);
  } catch {
    /* optional */
  }
  return b.ac.state === "running";
}

/**
 * Plays a voice. `auto` marks a sound from the delegated listener: it steps
 * aside when anything else just played, so one interaction never makes two
 * sounds and an explicit call always wins.
 */
export function playSfx(name: Sfx, opts: { auto?: boolean } = {}): void {
  if (!sfxOn || isMuted() || getVolume() <= 0) return;
  const now = performance.now();
  if (now - (last.get(name) ?? 0) < (name === "hover" ? 45 : 60)) return;
  if (opts.auto && INTERACTION.has(name) && now - lastAny < 110) return;
  last.set(name, now);
  lastAny = now;
  const b = getBus();
  if (!b) return;
  try {
    const out = b.ac.createGain();
    out.gain.value = 0.5 * trim(name) * perceptualGain(getVolume());
    out.connect(b.input);
    DESIGNS[name]({ ac: b.ac, out, t: b.ac.currentTime + 0.005, p: pitchFor(name) });
    window.setTimeout(() => out.disconnect(), 4000);
  } catch {
    /* sound is optional */
  }
}

/**
 * A tone that rises over `ms`, for drum-roll builds before a reveal. Goes
 * through the shared bus, so it honors the sound-effects switch, mute and volume.
 */
export function playRise(ms: number): void {
  if (!sfxOn || isMuted() || getVolume() <= 0) return;
  const b = getBus();
  if (!b) return;
  try {
    const { ac } = b;
    const out = ac.createGain();
    out.gain.value = perceptualGain(getVolume());
    out.connect(b.input);
    const t = ac.currentTime + 0.005;
    const d = ms / 1000;
    // A swelling FM tone climbing a fifth-and-a-bit, under a thin rising hiss.
    fm({ ac, out, t, p: 1 }, D3, 0, d, { ratio: 2, index: 0.6, peak: 0.1, glide: 3.5, attack: d * 0.9, idx: 1 });
    nz({ ac, out, t, p: 1 }, 0, d, 500, 6000, 0.05, 0.8, "bandpass", d * 0.9);
    window.setTimeout(() => out.disconnect(), ms + 1500);
  } catch {
    /* sound is optional */
  }
}

/** The shared audio context, for decoding recorded clips that play through the same bus. */
export function getSfxContext(): AudioContext | null {
  return (getBus()?.ac as AudioContext | undefined) ?? null;
}

/** Plays a decoded recorded clip through the sfx bus, honoring mute and volume. */
export function playSfxBuffer(buf: AudioBuffer): boolean {
  if (!sfxOn || isMuted() || getVolume() <= 0) return true;
  const b = getBus();
  if (!b) return false;
  try {
    const out = b.ac.createGain();
    out.gain.value = 0.9 * perceptualGain(getVolume());
    out.connect(b.input);
    const src = b.ac.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    src.onended = () => out.disconnect();
    src.start();
    return true;
  } catch {
    return false;
  }
}

/** Retired: the delegated pointer and keyboard sounds now live in audioManager. Kept so old callers still work. */
export function installClickSounds(): () => void {
  return () => undefined;
}
