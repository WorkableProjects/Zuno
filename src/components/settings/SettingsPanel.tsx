import { Monitor, Moon, Smartphone, Sun, X } from "lucide-react";
import type { Device, Theme } from "../../app/storage";
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

          <div className="field">
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

          <div className="field">
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
        </>
      )}
    </Dialog>
  );
}
