/**
 * Gridiron's stadium sounds, synthesized on Zuno's shared sfx bus (compressor,
 * room reverb, soft clip), so they honor the sound-effects switch, mute and
 * volume, and never start before the browser has unlocked audio.
 *
 * Designs:
 * - whistle: a real pea whistle is a breathy tone around 3 kHz chopped by the
 *   pea's flutter (~30–45 Hz). Two slightly detuned tones, amplitude-trilled,
 *   with a band of breath noise and a soft attack and tail.
 * - hit: pads colliding are a low body thump (pitch-dropping sine) plus a short
 *   mid "crack" of filtered noise. No pure noise burst.
 * - crowd: pink-ish noise through vowel-like formant bands, swelling and
 *   decaying, randomly varied so repeats never sound identical.
 * - horn: detuned saws through a lowpass with slight vibrato, like a stadium
 *   air horn, followed by a crowd roar.
 * - chime: a soft two-note marker for first downs and scoring changes.
 * Each cue is rate-limited so rapid events never stack into noise.
 */
import { openSfxVoice } from "../../lib/sfx";

const lastAt = new Map<string, number>();
function gate(name: string, ms: number): boolean {
  const now = performance.now();
  if (now - (lastAt.get(name) ?? -1e9) < ms) return false;
  lastAt.set(name, now);
  return true;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
/** Two seconds of pink-ish noise (Paul Kellet's filter), cached per context. */
function pink(ac: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ac);
  if (buf) return buf;
  buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  noiseCache.set(ac, buf);
  return buf;
}
function noiseSrc(ac: BaseAudioContext): AudioBufferSourceNode {
  const s = ac.createBufferSource();
  s.buffer = pink(ac);
  s.loop = true;
  s.playbackRate.value = 0.9 + Math.random() * 0.2;
  return s;
}

export function whistle(len = 0.38) {
  if (!gate("whistle", 300)) return;
  const v = openSfxVoice(0.32, 2000);
  if (!v) return;
  const { ac, out } = v;
  const t = ac.currentTime + 0.01;
  const base = 2750 + Math.random() * 250;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(1, t + 0.025);
  env.gain.setValueAtTime(1, t + len - 0.08);
  env.gain.exponentialRampToValueAtTime(0.001, t + len + 0.05);
  // Pea flutter: amplitude trill.
  const trill = ac.createGain();
  trill.gain.value = 0.6;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 34 + Math.random() * 8;
  const depth = ac.createGain();
  depth.gain.value = 0.4;
  lfo.connect(depth).connect(trill.gain);
  for (const det of [0, 18]) {
    const o = ac.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(base + det, t);
    o.frequency.linearRampToValueAtTime(base + det - 60, t + len);
    const g = ac.createGain();
    g.gain.value = 0.22;
    o.connect(g).connect(trill);
    o.start(t);
    o.stop(t + len + 0.1);
  }
  const breath = noiseSrc(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = base;
  bp.Q.value = 6;
  const bg = ac.createGain();
  bg.gain.value = 0.5;
  breath.connect(bp).connect(bg).connect(trill);
  trill.connect(env).connect(out);
  lfo.start(t);
  breath.start(t);
  lfo.stop(t + len + 0.1);
  breath.stop(t + len + 0.1);
}

export function hit(power = 1) {
  if (!gate("hit", 120)) return;
  const v = openSfxVoice(0.55 * power, 1500);
  if (!v) return;
  const { ac, out } = v;
  const t = ac.currentTime + 0.005;
  const o = ac.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.16);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.9, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.25);
  const n = noiseSrc(ac);
  const f = ac.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1100 + Math.random() * 400;
  f.Q.value = 1.2;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.7, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  n.connect(f).connect(ng).connect(out);
  n.start(t);
  n.stop(t + 0.1);
}

/** A crowd reaction: `intensity` ~0.6 murmur to ~1.6 roar. */
export function crowd(intensity = 1, secs = 2.2) {
  if (!gate("crowd", 900)) return;
  const v = openSfxVoice(0.5 * Math.min(1.8, intensity), (secs + 1) * 1000);
  if (!v) return;
  const { ac, out } = v;
  const t = ac.currentTime + 0.01;
  const env = ac.createGain();
  const peak = Math.min(1, 0.55 + intensity * 0.3);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + 0.35);
  env.gain.setTargetAtTime(peak * 0.6, t + 0.6, 0.5);
  env.gain.setTargetAtTime(0.0001, t + secs * 0.55, secs * 0.18);
  env.connect(out);
  // Vowel-ish formants give voices instead of hiss.
  for (const [freq, q, g] of [[480, 1.4, 0.9], [950, 1.6, 0.7], [2300, 2.2, 0.35]] as const) {
    const n = noiseSrc(ac);
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freq * (0.92 + Math.random() * 0.16), t);
    f.frequency.linearRampToValueAtTime(freq * (1 + intensity * 0.12), t + 0.4);
    f.Q.value = q;
    const gg = ac.createGain();
    gg.gain.value = g;
    n.connect(f).connect(gg).connect(env);
    n.start(t, Math.random() * 1.5);
    n.stop(t + secs + 0.5);
  }
}

export function horn() {
  if (!gate("horn", 2500)) return;
  const v = openSfxVoice(0.3, 3500);
  if (v) {
    const { ac, out } = v;
    const t = ac.currentTime + 0.01;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.linearRampToValueAtTime(1800, t + 0.12);
    lp.Q.value = 0.8;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.06);
    env.gain.setValueAtTime(0.5, t + 1.0);
    env.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    const vib = ac.createOscillator();
    vib.frequency.value = 5.5;
    const vd = ac.createGain();
    vd.gain.value = 2.5;
    vib.connect(vd);
    for (const f of [233, 234.6, 293.7, 349.2]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      vd.connect(o.frequency);
      const g = ac.createGain();
      g.gain.value = 0.18;
      o.connect(g).connect(lp);
      o.start(t);
      o.stop(t + 1.55);
    }
    vib.start(t);
    vib.stop(t + 1.55);
    lp.connect(env).connect(out);
  }
  lastAt.delete("crowd");
  crowd(1.6, 3.2);
}

/** Soft two-note marker: up for good news (first down, score), down for bad. */
export function chime(good = true) {
  if (!gate("chime", 400)) return;
  const v = openSfxVoice(0.22, 1500);
  if (!v) return;
  const { ac, out } = v;
  const t = ac.currentTime + 0.01;
  const notes = good ? [659.3, 987.8] : [587.3, 440];
  notes.forEach((f, i) => {
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ac.createGain();
    const s = t + i * 0.09;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.5, s + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, s + 0.5);
    o.connect(g).connect(out);
    o.start(s);
    o.stop(s + 0.55);
  });
}
