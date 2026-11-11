import { useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Download, Play } from "lucide-react";
import type { GameFile } from "../../game-files/schema/common";
import { validateGameFileText } from "../../game-files/schema/validateGameFile";
import { Dialog } from "../ui/Dialog";
import { slugify } from "./editorModel";

interface Props {
  file: GameFile;
  gameType: string;
  /** Sends the exported text through the normal import and validation path. */
  onHost: (text: string, filename: string) => void;
  onClose: () => void;
}

/** Names, re-validates and downloads a game file, then offers to host it. */
export function ExportDialog({ file, gameType, onHost, onClose }: Props) {
  const [name, setName] = useState(() => slugify(file.metadata.title) || "my-game");
  const [saved, setSaved] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const text = useMemo(() => JSON.stringify(file, null, 2), [file]);
  const filename = `${slugify(name) || "my-game"}.zuno.json`;

  const download = () => {
    // The exact text being saved is validated again before it leaves the editor.
    const check = validateGameFileText(text, gameType);
    if (!check.ok) {
      setProblem(check.errors[0]);
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setProblem(null);
    setSaved(filename);
  };

  return (
    <Dialog title="Export game file" onClose={onClose}>
      {(close) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            download();
          }}
        >
          <h2 className="dialog-title">Export game file</h2>
          <p className="dialog-text">The file downloads to this device. Keep it to host this game again later.</p>
          <label className="field export-name">
            <span className="field-label">File name</span>
            <span className="name-row">
              <input className="input" data-autofocus value={name} maxLength={48} onChange={(e) => setName(e.target.value)} />
              <span className="meta">.zuno.json</span>
            </span>
          </label>
          {problem && (
            <div className="notice notice-error" role="alert">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>{problem}</p>
            </div>
          )}
          {saved && (
            <div className="notice notice-ok" role="status">
              <CircleCheck size={18} strokeWidth={1.5} />
              <p>Saved as {saved}</p>
            </div>
          )}
          <div className="dialog-actions" data-nav-row="1">
            <button type="button" className="btn btn-quiet" onClick={close}>
              {saved ? "Keep editing" : "Cancel"}
            </button>
            <button type="submit" className={`btn ${saved ? "btn-secondary" : "btn-primary"}`}>
              <Download size={18} strokeWidth={1.5} />
              {saved ? "Download again" : "Download file"}
            </button>
            {saved && (
              <button type="button" className="btn btn-primary" onClick={() => onHost(text, saved)}>
                <Play size={18} strokeWidth={1.5} />
                Load &amp; Host This Game
              </button>
            )}
          </div>
        </form>
      )}
    </Dialog>
  );
}
