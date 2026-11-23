import { getVolume, isMuted } from "./audio";

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
  | "airhorn"
  | "drumroll"
  | "sadTrombone"
  | "applause"
  | "boing"
  | "rimshot";

interface Bus {
  ac: AudioContext;
  input: GainNode;
}

let bus: Bus | null = null;

function impulse(ac: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function getBus(): Bus | null {
  try {
    if (!bus) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ac = new AC();
      const input = ac.createGain();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      const tone = ac.createBiquadFilter();
      tone.type = "highshelf";
      tone.frequency.value = 6000;
      tone.gain.value = -4;
      const verb = ac.createConvolver();
      verb.buffer = impulse(ac, 1.6, 3);
      const wet = ac.createGain();
      wet.gain.value = 0.22;
      input.connect(tone);
      tone.connect(comp);
      tone.connect(verb);
      verb.connect(wet).connect(comp);
      comp.connect(ac.destination);
      bus = { ac, input };
    }
    if (bus.ac.state === "suspended") void bus.ac.resume().catch(() => undefined);
    return bus;
  } catch {
    return null;
  }
}

let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

type Ctx = { ac: AudioContext; out: AudioNode; t: number };

function env(g: GainNode, t: number, peak: number, attack: number, release: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
}

/** A soft bell: a sine with an FM shimmer that fades quickly. */
function bell({ ac, out, t }: Ctx, f: number, at: number, len: number, peak = 0.5, bright = 2) {
  const s = t + at;
  const car = ac.createOscillator();
  const mod = ac.createOscillator();
  const modGain = ac.createGain();
  const g = ac.createGain();
  car.frequency.value = f;
  mod.frequency.value = f * 3.01;
  modGain.gain.setValueAtTime(f * bright, s);
  modGain.gain.exponentialRampToValueAtTime(1, s + len * 0.6);
  mod.connect(modGain).connect(car.frequency);
  env(g, s, peak, 0.004, len);
  car.connect(g).connect(out);
  car.start(s);
  mod.start(s);
  car.stop(s + len + 0.1);
  mod.stop(s + len + 0.1);
}

/** A plucked tone through a closing low-pass filter. */
function pluck({ ac, out, t }: Ctx, f: number, at: number, len: number, peak = 0.4, type: OscillatorType = "sawtooth") {
  const s = t + at;
  const o = ac.createOscillator();
  const o2 = ac.createOscillator();
  const lp = ac.createBiquadFilter();
  const g = ac.createGain();
  o.type = type;
  o2.type = type;
  o.frequency.value = f;
  o2.frequency.value = f;
  o2.detune.value = 7;
  lp.type = "lowpass";
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(f * 8, s);
  lp.frequency.exponentialRampToValueAtTime(f * 1.2, s + len);
  env(g, s, peak, 0.005, len);
  o.connect(lp);
  o2.connect(lp);
  lp.connect(g).connect(out);
  o.start(s);
  o2.start(s);
  o.stop(s + len + 0.1);
  o2.stop(s + len + 0.1);
}

/** A low body hit with a falling pitch. */
function thump({ ac, out, t }: Ctx, from: number, to: number, at: number, len: number, peak = 0.6) {
  const s = t + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.setValueAtTime(from, s);
  o.frequency.exponentialRampToValueAtTime(to, s + len);
  env(g, s, peak, 0.003, len);
  o.connect(g).connect(out);
  o.start(s);
  o.stop(s + len + 0.05);
}

/** Filtered noise: clicks when short, whooshes when long and swept. */
function air({ ac, out, t }: Ctx, at: number, len: number, f0: number, f1: number, peak = 0.3, q = 1.2, attack = 0.004) {
  const s = t + at;
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, s);
  bp.frequency.exponentialRampToValueAtTime(f1, s + attack + len);
  const g = ac.createGain();
  env(g, s, peak, attack, len);
  src.connect(bp).connect(g).connect(out);
  src.start(s, Math.random() * 0.5);
  src.stop(s + attack + len + 0.05);
}

const N = (semis: number) => 440 * Math.pow(2, semis / 12);
const C5 = N(3), E5 = N(7), G5 = N(10), C6 = N(15), D5 = N(5), A4 = N(0), F4 = N(-4), C4 = N(-9);

const DESIGNS: Record<Sfx, (c: Ctx) => void> = {
  hover: (c) => {
    air(c, 0, 0.025, 5200, 4800, 0.07, 6);
  },
  click: (c) => {
    air(c, 0, 0.018, 3200, 2400, 0.35, 3);
    thump(c, 220, 90, 0, 0.06, 0.35);
  },
  back: (c) => {
    air(c, 0, 0.02, 1800, 1200, 0.3, 3);
    thump(c, 160, 70, 0, 0.08, 0.35);
  },
  select: (c) => {
    air(c, 0, 0.015, 3500, 2600, 0.3, 3);
    bell(c, G5, 0.01, 0.35, 0.28, 1.2);
    bell(c, C6, 0.06, 0.45, 0.22, 1.2);
  },
  navigate: (c) => {
    air(c, 0, 0.28, 400, 3800, 0.16, 0.8, 0.12);
    thump(c, 120, 55, 0.12, 0.18, 0.25);
  },
  open: (c) => {
    air(c, 0, 0.16, 900, 3000, 0.12, 1, 0.06);
    bell(c, E5, 0.05, 0.3, 0.15, 0.8);
  },
  close: (c) => {
    air(c, 0, 0.14, 2800, 700, 0.1, 1, 0.03);
  },
  toggleOn: (c) => {
    air(c, 0, 0.015, 3000, 2600, 0.25, 4);
    bell(c, C6, 0.015, 0.18, 0.15, 0.6);
  },
  toggleOff: (c) => {
    air(c, 0, 0.015, 2200, 1800, 0.25, 4);
    bell(c, G5 / 2, 0.015, 0.18, 0.12, 0.6);
  },
  correct: (c) => {
    [C5, E5, G5, C6].forEach((f, i) => bell(c, f, i * 0.07, 0.9, 0.32, 1.5));
    pluck(c, C4, 0, 0.6, 0.2, "triangle");
    air(c, 0.2, 0.6, 6000, 9000, 0.05, 0.5, 0.05);
  },
  wrong: (c) => {
    thump(c, 140, 60, 0, 0.45, 0.6);
    pluck(c, N(-14), 0, 0.5, 0.25);
    pluck(c, N(-13), 0.02, 0.5, 0.2);
  },
  reveal: (c) => {
    air(c, 0, 0.55, 300, 6000, 0.18, 0.7, 0.45);
    thump(c, 90, 40, 0.5, 0.5, 0.55);
    [C5, G5, E5 * 2].forEach((f, i) => bell(c, f, 0.5 + i * 0.03, 1.4, 0.22, 2));
  },
  turn: (c) => {
    bell(c, D5, 0, 0.5, 0.28, 1.4);
    bell(c, A4 * 2, 0.11, 0.7, 0.26, 1.4);
  },
  join: (c) => {
    pluck(c, G5, 0, 0.15, 0.25, "triangle");
    bell(c, C6, 0.08, 0.4, 0.22, 1);
  },
  vote: (c) => {
    air(c, 0, 0.012, 4000, 3000, 0.3, 4);
    pluck(c, E5, 0, 0.18, 0.25, "square");
  },
  tick: (c) => {
    air(c, 0, 0.012, 6000, 5000, 0.35, 8);
    thump(c, 900, 600, 0, 0.03, 0.2);
  },
  timeUp: (c) => {
    [0, 0.18, 0.36].forEach((at) => {
      pluck(c, A4, at, 0.14, 0.35, "square");
      pluck(c, A4 * 1.5, at, 0.14, 0.2, "square");
    });
    thump(c, 110, 45, 0.36, 0.6, 0.6);
  },
  win: (c) => {
    air(c, 0, 0.5, 200, 5000, 0.15, 0.7, 0.4);
    thump(c, 100, 45, 0.45, 0.6, 0.6);
    [C4, F4, A4, C5].forEach((f) => pluck(c, f, 0.45, 1.6, 0.16));
    [C5, E5, G5, C6, E5 * 2].forEach((f, i) => bell(c, f, 0.45 + i * 0.09, 1.6, 0.25, 1.8));
  },
  pause: (c) => {
    pluck(c, G5, 0, 0.2, 0.2, "triangle");
    pluck(c, C5, 0.1, 0.35, 0.2, "triangle");
  },
  skip: (c) => {
    air(c, 0, 0.18, 3500, 600, 0.2, 1.2, 0.02);
  },
  airhorn: (c) => {
    [N(-14), N(-10), N(-7)].forEach((f) => {
      pluck(c, f, 0, 0.9, 0.22, "sawtooth");
      pluck(c, f * 2, 0.01, 0.9, 0.1, "square");
    });
    air(c, 0, 0.12, 1500, 900, 0.2, 0.8, 0.01);
    thump(c, 160, 90, 0, 0.3, 0.3);
  },
  drumroll: (c) => {
    for (let i = 0; i < 18; i++) {
      const at = i * 0.055 - i * i * 0.0007;
      air(c, at, 0.05, 2200, 1400, 0.12 + i * 0.01, 2);
      thump(c, 200, 110, at, 0.05, 0.12);
    }
    thump(c, 110, 50, 0.95, 0.4, 0.5);
    air(c, 0.95, 0.9, 7000, 5000, 0.12, 0.6, 0.01);
  },
  sadTrombone: (c) => {
    [[-14, 0, 0.4], [-15, 0.45, 0.4], [-16, 0.9, 0.4], [-17, 1.35, 1.1]].forEach(([semi, at, len]) => {
      pluck(c, N(semi), at, len, 0.3, "sawtooth");
      pluck(c, N(semi) * 2, at, len, 0.08, "triangle");
    });
  },
  applause: (c) => {
    air(c, 0, 1.8, 2500, 3500, 0.14, 0.5, 0.3);
    for (let i = 0; i < 40; i++) air(c, Math.random() * 1.7, 0.03 + Math.random() * 0.03, 1800 + Math.random() * 3500, 1500 + Math.random() * 2500, 0.1 + Math.random() * 0.1, 1.5);
  },
  boing: (c) => {
    thump(c, 140, 520, 0, 0.14, 0.45);
    thump(c, 520, 160, 0.14, 0.45, 0.4);
    bell(c, 330, 0.02, 0.5, 0.15, 2.5);
  },
  rimshot: (c) => {
    air(c, 0, 0.1, 3000, 2000, 0.3, 1.5);
    thump(c, 220, 110, 0, 0.12, 0.45);
    air(c, 0.16, 0.1, 3000, 2000, 0.3, 1.5);
    thump(c, 140, 70, 0.16, 0.14, 0.45);
    air(c, 0.4, 0.9, 7500, 5500, 0.18, 0.6, 0.005);
    thump(c, 90, 45, 0.4, 0.3, 0.4);
  },
};

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
}

export function playSfx(name: Sfx): void {
  if (!sfxOn || isMuted() || getVolume() <= 0) return;
  const now = performance.now();
  if (now - (last.get(name) ?? 0) < (name === "hover" ? 45 : 60)) return;
  // A game sound right after a click replaces the plain click.
  if ((name === "click" || name === "hover") && now - lastAny < 30) return;
  last.set(name, now);
  if (name !== "click" && name !== "hover") lastAny = now;
  const b = getBus();
  if (!b) return;
  try {
    const out = b.ac.createGain();
    out.gain.value = 0.5 * getVolume();
    out.connect(b.input);
    DESIGNS[name]({ ac: b.ac, out, t: b.ac.currentTime + 0.005 });
    window.setTimeout(() => out.disconnect(), 4000);
  } catch {
    /* sound is optional */
  }
}

/** The shared audio context, for decoding recorded clips that play through the same bus. */
export function getSfxContext(): AudioContext | null {
  return getBus()?.ac ?? null;
}

/** Plays a decoded recorded clip through the sfx bus, honoring mute and volume. */
export function playSfxBuffer(buf: AudioBuffer): boolean {
  if (!sfxOn || isMuted() || getVolume() <= 0) return true;
  const b = getBus();
  if (!b) return false;
  try {
    const out = b.ac.createGain();
    out.gain.value = 0.9 * getVolume();
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

const INTERACTIVE = "button, [role=button], [role=tab], [role=radio], a[href], .tile, summary";
const isBack = (el: Element) => /^(back|exit|leave|close|cancel)/i.test(el.getAttribute("aria-label") ?? (el as HTMLElement).innerText ?? "");

/**
 * Menu sounds for the whole app: hover and press on every control, back and
 * cancel, switches, dialogs opening and closing. Game sounds come on top.
 */
export function installClickSounds(): () => void {
  let hovered: Element | null = null;
  const onOver = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = (e.target as Element | null)?.closest?.(INTERACTIVE) ?? null;
    if (el === hovered) return;
    hovered = el;
    if (el && !(el as HTMLButtonElement).disabled && !el.closest(".sound-control")) playSfx("hover");
  };
  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.(INTERACTIVE);
    if (!el || (el as HTMLButtonElement).disabled || el.closest(".sound-control")) return;
    // Let any game sound from this click win.
    window.setTimeout(() => playSfx(isBack(el) ? "back" : "click"), 0);
  };
  const onChange = (e: Event) => {
    const t = e.target as HTMLInputElement | null;
    if (t?.type === "checkbox") playSfx(t.checked ? "toggleOn" : "toggleOff");
  };
  let dialogs = document.querySelectorAll("[role=dialog], dialog[open]").length;
  const observer = new MutationObserver(() => {
    const n = document.querySelectorAll("[role=dialog], dialog[open]").length;
    if (n > dialogs) playSfx("open");
    else if (n < dialogs) playSfx("close");
    dialogs = n;
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
  document.addEventListener("pointerover", onOver, { passive: true });
  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  return () => {
    observer.disconnect();
    document.removeEventListener("pointerover", onOver);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("change", onChange, true);
  };
}
