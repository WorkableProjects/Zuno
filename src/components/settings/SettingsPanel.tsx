import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, Leaf, LogOut, Monitor, Moon, Smartphone, Star, Sun, Sunset, Waves, Volume2, VolumeX } from "lucide-react";
import { THEMES } from "../../app/themes";
import { applyMotion, loadMotion, loadSfxOn, saveMotion, saveSfxOn, type Device, type Motion, type RailPosition, type Theme } from "../../app/storage";
import { getVolume, isMuted, setMuted, setVolume, subscribeMuted } from "../../lib/audio";
import { setSfxEnabled } from "../../lib/sfx";
import { logOut, useProfile } from "../../lib/profile";
import "./settings.css";

interface Props {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  device: Device;
  onDevice: (device: Device) => void;
  rail: RailPosition;
  onRail: (rail: RailPosition) => void;
}

function Card({ id, title, children, className = "" }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={`st-${id}`} className={`st-card ${className}`} aria-labelledby={`st-${id}-h`}>
      <h2 id={`st-${id}-h`} className="st-card-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`st-switch${on ? " is-on" : ""}`} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className="st-switch-track" aria-hidden="true">
        <span className="st-switch-dot" />
      </span>
    </button>
  );
}

function Segmented<T extends string>({ label, value, options, onChange, row }: { label: string; value: T; options: ReadonlyArray<readonly [T, string, typeof Moon]>; onChange: (v: T) => void; row: string }) {
  return (
    <div className="st-field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label} data-nav-row={row}>
        {options.map(([v, text, Icon]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} className={`segment${value === v ? " is-on" : ""}`} onClick={() => onChange(v)}>
            <Icon size={16} strokeWidth={1.75} />
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

const THEME_ICONS: Record<Theme, typeof Moon> = { dark: Moon, light: Sun, vice: Sunset, ocean: Waves, "zuno-special": Star, anthropical: Leaf };
const RAIL_OPTIONS = [
  ["left", "Left", ArrowLeftToLine],
  ["top", "Top", ArrowUpToLine],
  ["right", "Right", ArrowRightToLine],
  ["bottom", "Bottom", ArrowDownToLine],
] as const;
const DEVICE_OPTIONS = [
  ["desktop", "Desktop", Monitor],
  ["mobile", "Mobile", Smartphone],
] as const;

/** The Settings page, a section of the launcher. Profile editing lives on the Profile page. */
export function SettingsPage({ theme, onTheme, device, onDevice, rail, onRail }: Props) {
  const muted = useSyncExternalStore(subscribeMuted, isMuted);
  const [volume, setVol] = useState(getVolume);
  const [sfxOn, setSfxOn] = useState(loadSfxOn);
  const [motion, setMotion] = useState<Motion>(loadMotion);
  const profile = useProfile();

  const chooseMotion = (m: Motion) => {
    setMotion(m);
    saveMotion(m);
    applyMotion(m);
  };
  const chooseSfx = (on: boolean) => {
    setSfxOn(on);
    saveSfxOn(on);
    setSfxEnabled(on);
  };

  return (
    <main className="lx-page st">
      <header className="lx-head st-head">
        <h1 className="lx-title">Settings</h1>
      </header>
      <div className="st-cards">
        <Card id="look" title="Look">
          <div className="st-themes" role="radiogroup" aria-label="Theme" data-nav-row="20">
            {THEMES.map(({ id, label, swatch }) => {
              const Icon = THEME_ICONS[id];
              return (
                <button key={id} type="button" role="radio" aria-checked={theme === id} className={`st-theme st-theme-${id}${theme === id ? " is-on" : ""}`} style={{ "--sw-bg": swatch.bg, "--sw-panel": swatch.panel, "--sw-accent": swatch.accent } as React.CSSProperties} onClick={() => onTheme(id)}>
                  <span className="st-theme-preview" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="st-theme-label">
                    <Icon size={15} strokeWidth={1.75} />
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="st-pair">
            <Segmented label="Layout" value={device} options={DEVICE_OPTIONS} onChange={onDevice} row="21" />
            <Segmented label="Sidebar position" value={rail} options={RAIL_OPTIONS} onChange={onRail} row="22" />
          </div>
        </Card>

        <div className="st-pair st-pair-cards">
          <Card id="sound" title="Sound">
            <div className="st-list" data-nav-row="30">
              <Toggle on={!muted} label="Music" onChange={(on) => setMuted(!on)} />
              <Toggle on={sfxOn} label="Sound effects" onChange={chooseSfx} />
            </div>
            <label className="settings-range" data-nav-row="31">
              {volume === 0 || muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(volume * 100)}
                aria-label="Volume"
                disabled={muted}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  setVol(v);
                  setVolume(v);
                }}
              />
              <span className="settings-range-value">{Math.round(volume * 100)}%</span>
            </label>
          </Card>

          <Card id="motion" title="Background motion">
            <div className="st-motion" role="radiogroup" aria-label="Background motion" data-nav-row="40">
              {(
                [
                  ["full", "Full 3D", "Everything moves."],
                  ["calm", "Calm", "Gradients drift."],
                  ["off", "Still", "A frozen backdrop."],
                ] as const
              ).map(([value, label, hint]) => (
                <button key={value} type="button" role="radio" aria-checked={motion === value} className={`st-option${motion === value ? " is-on" : ""}`} onClick={() => chooseMotion(value)}>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <footer id="st-about" className="st-strip" aria-label="About">
          <span className="settings-version">Zuno v{__APP_VERSION__}</span>
          <span className="st-strip-note">Look, layout and sound are saved on this device{profile ? " and with your profile" : ""}.</span>
          {profile && (
            <button type="button" className="btn btn-quiet st-signout" onClick={() => void logOut()} data-nav-row="50">
              <LogOut size={16} />
              Sign out
            </button>
          )}
        </footer>
      </div>
    </main>
  );
}
