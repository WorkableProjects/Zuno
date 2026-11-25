import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Info, Leaf, Monitor, Moon, Palette, Smartphone, Sparkles, Star, Sun, Sunset, Waves, UserRound, Volume2, VolumeX } from "lucide-react";
import { THEMES } from "../../app/themes";
import { applyMotion, loadMotion, loadSfxOn, saveMotion, saveSfxOn, type Device, type Motion, type Theme } from "../../app/storage";
import { getVolume, isMuted, setMuted, setVolume, subscribeMuted } from "../../lib/audio";
import { setSfxEnabled } from "../../lib/sfx";
import { ProfileCard } from "./ProfileCard";
import "./settings.css";

interface Props {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  device: Device;
  onDevice: (device: Device) => void;
}

const SECTIONS = [
  { id: "profile", label: "Profile", Icon: UserRound },
  { id: "look", label: "Look", Icon: Palette },
  { id: "sound", label: "Sound", Icon: Volume2 },
  { id: "motion", label: "Motion", Icon: Sparkles },
  { id: "about", label: "About", Icon: Info },
] as const;

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={`st-${id}`} className="st-card" aria-labelledby={`st-${id}-h`}>
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

/** The Settings page, a section of the launcher. */
const THEME_ICONS: Record<Theme, typeof Moon> = { dark: Moon, light: Sun, vice: Sunset, ocean: Waves, "zuno-special": Star, anthropical: Leaf };

export function SettingsPage({ theme, onTheme, device, onDevice }: Props) {
  const muted = useSyncExternalStore(subscribeMuted, isMuted);
  const [volume, setVol] = useState(getVolume);
  const [sfxOn, setSfxOn] = useState(loadSfxOn);
  const [motion, setMotion] = useState<Motion>(loadMotion);

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
  const jump = (id: string) => document.getElementById(`st-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="lx-page st">
      <header className="lx-head">
        <h1 className="lx-title">Settings</h1>
      </header>
      <div className="st-layout">
        <nav className="st-nav" aria-label="Settings sections" data-nav-row="1">
          {SECTIONS.map(({ id, label, Icon }) => (
            <button key={id} type="button" className="st-nav-btn" onClick={() => jump(id)}>
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>

        <div className="st-cards">
          <Card id="profile" title="Profile">
            <ProfileCard />
          </Card>

          <Card id="look" title="Look">
            <span className="field-label">Theme</span>
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
                      <Icon size={16} strokeWidth={1.75} />
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="field-label st-gap">Layout</span>
            <div className="segmented" role="radiogroup" aria-label="Layout" data-nav-row="21">
              {(
                [
                  ["desktop", "Desktop", Monitor],
                  ["mobile", "Mobile", Smartphone],
                ] as const
              ).map(([value, label, Icon]) => (
                <button key={value} type="button" role="radio" aria-checked={device === value} className={`segment${device === value ? " is-on" : ""}`} onClick={() => onDevice(value)}>
                  <Icon size={18} strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>
            <p className="field-hint">Desktop uses the full width. Mobile stays compact and vertical.</p>
          </Card>

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
                aria-label="Music volume"
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
                  ["calm", "Calm", "Gradients drift, no 3D turning."],
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

          <Card id="about" title="About">
            <p className="field-hint">Theme, layout and sound are saved on this device. Your name and picture follow your profile.</p>
            <p className="settings-version">Zuno v{__APP_VERSION__}</p>
          </Card>
        </div>
      </div>
    </main>
  );
}
