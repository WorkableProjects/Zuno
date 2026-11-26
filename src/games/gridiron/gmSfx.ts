/** Synthesized game-day sounds: whistle, crowd, touchdown horn and hit. Silent when Zuno is muted. */
import { getVolume, isMuted } from "../../lib/audio";

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (isMuted()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
const level = () => 0.18 * getVolume();

function noise(a: AudioContext, secs: number): AudioBufferSourceNode {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * secs), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource();
  s.buffer = buf;
  return s;
}

export function whistle() {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const lfo = a.createOscillator();
  const lg = a.createGain();
  const g = a.createGain();
  o.frequency.value = 2900;
  lfo.frequency.value = 38;
  lg.gain.value = 120;
  lfo.connect(lg).connect(o.frequency);
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(level() * 0.5, a.currentTime + 0.02);
  g.gain.setValueAtTime(level() * 0.5, a.currentTime + 0.32);
  g.gain.linearRampToValueAtTime(0, a.currentTime + 0.4);
  o.connect(g).connect(a.destination);
  o.start();
  lfo.start();
  o.stop(a.currentTime + 0.42);
  lfo.stop(a.currentTime + 0.42);
}

export function hit() {
  const a = ac();
  if (!a) return;
  const s = noise(a, 0.18);
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 500;
  const g = a.createGain();
  g.gain.setValueAtTime(level() * 1.4, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.18);
  s.connect(f).connect(g).connect(a.destination);
  s.start();
}

export function crowd(intensity = 1, secs = 2.2) {
  const a = ac();
  if (!a) return;
  const s = noise(a, secs);
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 900;
  f.Q.value = 0.6;
  const g = a.createGain();
  g.gain.setValueAtTime(0, a.currentTime);
  g.gain.linearRampToValueAtTime(level() * 0.6 * intensity, a.currentTime + 0.3);
  g.gain.linearRampToValueAtTime(0, a.currentTime + secs);
  s.connect(f).connect(g).connect(a.destination);
  s.start();
}

export function horn() {
  const a = ac();
  if (!a) return;
  for (const freq of [233, 294, 349]) {
    const o = a.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    const g = a.createGain();
    g.gain.setValueAtTime(0, a.currentTime);
    g.gain.linearRampToValueAtTime(level() * 0.22, a.currentTime + 0.05);
    g.gain.setValueAtTime(level() * 0.22, a.currentTime + 1.1);
    g.gain.linearRampToValueAtTime(0, a.currentTime + 1.4);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 1.45);
  }
  crowd(1.6, 3);
}
