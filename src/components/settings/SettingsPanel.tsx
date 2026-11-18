import { useState, useSyncExternalStore } from "react";
import { Monitor, Moon, Smartphone, Sun, Volume2, VolumeX, X } from "lucide-react";
import { applyMotion, loadMotion, loadSfxOn, saveMotion, saveSfxOn, type Device, type Motion, type Theme } from "../../app/storage";
import { getVolume, isMuted, setMuted, setVolume, subscribeMuted } from "../../lib/audio";
import { setSfxEnabled } from "../../lib/sfx";
import { Dialog } from "../ui/Dialog";
import "./settings.css";

interface Props {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  device: Device;
  onDevice: (device: Device) => void;
  onClose: () => void;
}

export function SettingsPanel({ theme, onTheme, device, onDevice, onClose }: Props) {
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

  return (
    <Dialog title="Settings" onClose={onClose} variant="sheet">
      {(close) => (
        <>
          <div className="sheet-head">
            <h2 className="dialog-title">Settings</h2>
            <button type="button" className="icon-btn" aria-label="Close settings" onClick={close}>
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>

          <div className="field settings-field">
            <span className="field-label" id="theme-label">
              Theme
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="theme-label" data-nav-row="0">
              {(
                [
                  ["dark", "Dark Mode", Moon],
                  ["light", "Light Mode", Sun],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  data-autofocus={theme === value ? "" : undefined}
                  className={`segment${theme === value ? " is-on" : ""}`}
                  onClick={() => onTheme(value)}
                >
                  <Icon size={18} strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>
            <p className="field-hint">Saved on this device. Zuno has no accounts.</p>
          </div>

          <div className="field settings-field">
            <span className="field-label" id="device-label">
              Layout
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="device-label" data-nav-row="1">
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
          </div>

          <div className="field settings-field">
            <span className="field-label" id="music-label">
              Music
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="music-label" data-nav-row="2">
              {(
                [
                  [false, "On", Volume2],
                  [true, "Off", VolumeX],
                ] as const
              ).map(([value, label, Icon]) => (
                <button key={label} type="button" role="radio" aria-checked={muted === value} className={`segment${muted === value ? " is-on" : ""}`} onClick={() => setMuted(value)}>
                  <Icon size={18} strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>
            <label className="settings-range" data-nav-row="3">
              <span>Volume</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(volume * 100)}
                aria-label="Volume"
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  setVol(v);
                  setVolume(v);
                }}
              />
              <span className="settings-range-value">{Math.round(volume * 100)}%</span>
            </label>
          </div>

          <div className="field settings-field">
            <span className="field-label" id="sfx-label">
              Sound effects
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="sfx-label" data-nav-row="4">
              {(
                [
                  [true, "On"],
                  [false, "Off"],
                ] as const
              ).map(([value, label]) => (
                <button key={label} type="button" role="radio" aria-checked={sfxOn === value} className={`segment${sfxOn === value ? " is-on" : ""}`} onClick={() => chooseSfx(value)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="field-hint">Clicks and game sounds. Music has its own switch.</p>
          </div>

          <div className="field settings-field">
            <span className="field-label" id="motion-label">
              Background motion
            </span>
            <div className="segmented" role="radiogroup" aria-labelledby="motion-label" data-nav-row="5">
              {(
                [
                  ["full", "Full 3D"],
                  ["calm", "Calm"],
                  ["off", "Still"],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={motion === value} className={`segment${motion === value ? " is-on" : ""}`} onClick={() => chooseMotion(value)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="field-hint">Calm keeps the gradients moving but stops the 3D turning. Still freezes the background.</p>
          </div>

          <p className="settings-version">Zuno v{__APP_VERSION__}</p>
        </>
      )}
    </Dialog>
  );
}
