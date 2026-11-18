import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Check, Copy, Play, UserMinus } from "lucide-react";
import { useEscape } from "../../components/navigation/spatialNav";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { Notice, PlayerChip, StatusView } from "../../components/ui/Status";
import type { GauntletFile } from "../../game-files/schema/gauntlet";
import { useJoinSound } from "../../lib/useGameSounds";
import { createGauntletLobby, gauntletJoinLink, joinGauntletLobby, leaveGauntletLobby, setGauntletPhase, watchGauntletLobby, type GauntletLobbyState } from "./gauntletLobby";
import type { Options, TeamSetup } from "./gauntletEngine";
import "../headbands/headbands.css";
import "./gauntlet.css";

interface Props {
  file: GauntletFile;
  teamNames: string[];
  options: Options;
  code: string | null;
  onCode: (code: string) => void;
  onBack: () => void;
  /** teamMap: lobby team index to engine team id. */
  onStart: (teams: TeamSetup[], teamMap: Record<number, string>) => void;
}

/** Host lobby for online Gauntlet. Players join on phones and pick a team. */
export function GauntletLobby({ file, teamNames, options, code: initial, onCode, onBack, onStart }: Props) {
  const [code, setCode] = useState(initial);
  const [lobby, setLobby] = useState<GauntletLobbyState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const created = useRef(false);
  useEscape(() => setConfirmLeave(true), !confirmLeave);

  useEffect(() => {
    if (code || created.current) return;
    created.current = true;
    createGauntletLobby(teamNames)
      .then((c) => {
        setCode(c);
        onCode(c);
      })
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : "Could not open a room."));
  }, [code, onCode, teamNames]);
  useEffect(() => (code ? watchGauntletLobby(code, setLobby, setProblem) : undefined), [code]);
  useEffect(() => {
    if (code) void QRCode.toDataURL(gauntletJoinLink(code), { margin: 1, width: 240 }).then(setQr).catch(() => setQr(""));
  }, [code]);

  const players = Object.entries(lobby?.players ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  useJoinSound(players.length);
  const byTeam = teamNames.map((_, i) => players.filter(([, p]) => p.team === i));
  const unassigned = players.filter(([, p]) => p.team === null || p.team >= teamNames.length);
  const filled = byTeam.filter((t) => t.length > 0).length;
  const ready = !!code && filled >= Math.max(1, Math.min(file.settings.minTeams, teamNames.length)) && unassigned.length === 0;

  const start = async () => {
    if (!code || !ready) return;
    const teams: TeamSetup[] = [];
    const map: Record<number, string> = {};
    byTeam.forEach((members, i) => {
      if (!members.length) return;
      teams.push({ name: teamNames[i], players: members.map(([, p]) => p.name) });
      map[i] = `t${teams.length}`;
    });
    await setGauntletPhase(code, "playing");
    onStart(teams, map);
  };

  return (
    <main className="screen game-scope" style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Close the room" onClick={() => setConfirmLeave(true)}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Trivia Gauntlet online</span>
      </header>
      <div className="gl-wrap">
        {problem && <Notice tone="error">{problem}</Notice>}
        {!code && !problem && <StatusView kind="loading" title="Opening a room…" />}
        {code && (
          <div className="card gl-panel hb-join-info">
            {qr && <img className="hb-qr" src={qr} alt={`QR code to join room ${code}`} width={200} height={200} />}
            <div className="hb-join-text">
              <p className="meta">Room code</p>
              <p className="hb-code">{code}</p>
              <p className="hb-link">{gauntletJoinLink(code)}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(gauntletJoinLink(code))
                    .then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    })
                    .catch(() => undefined)
                }
              >
                {copied ? <Check size={16} strokeWidth={1.5} /> : <Copy size={16} strokeWidth={1.5} />} {copied ? "Link copied" : "Copy link"}
              </button>
              <p className="meta">{options.mode === "survival" ? "Survival" : "Standard"}{options.safeMode ? " · Safe mode" : ""}. Phones answer for their team; this screen shows the questions and judges answers.</p>
            </div>
          </div>
        )}
        <section className="card gl-panel" aria-label="Teams">
          {teamNames.map((t, i) => (
            <div key={i} className="gl-team-edit" data-nav-row={10 + i}>
              <strong>{t}</strong>
              <div className="gl-actions">
                {byTeam[i].length === 0 && <span className="meta">Nobody yet</span>}
                {byTeam[i].map(([id, p]) => (
                  <PlayerChip
                    key={id}
                    name={p.name}
                    state="online"
                    extra={
                      <>
                        <label>
                          <span className="sr-only">Move {p.name}</span>
                          <select className="input" value={i} onChange={(e) => code && void joinGauntletLobby(code, id, p.name, Number(e.target.value))}>
                            {teamNames.map((n, k) => <option key={k} value={k}>{n}</option>)}
                          </select>
                        </label>
                        <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove ${p.name}`} onClick={() => code && void leaveGauntletLobby(code, id)}>
                          <UserMinus size={16} strokeWidth={1.5} />
                        </button>
                      </>
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          {unassigned.length > 0 && <Notice tone="warning">{unassigned.map(([, p]) => p.name).join(", ")} still choosing a team.</Notice>}
          <div className="setup-actions" data-nav-row={40}>
            <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => void start()}>
              <Play size={18} strokeWidth={1.5} /> Start match
            </button>
          </div>
        </section>
      </div>
      {confirmLeave && <ConfirmDialog title="Close the room?" text="Everyone on their phones is sent back to the start." confirmLabel="Close room" danger onConfirm={onBack} onClose={() => setConfirmLeave(false)} />}
    </main>
  );
}
