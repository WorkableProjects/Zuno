import { useEffect, useState } from "react";
import { ArrowLeft, LogIn, Send } from "lucide-react";
import { useEscape } from "../../components/navigation/spatialNav";
import { Notice, StatusView, TimerBadge } from "../../components/ui/Status";
import { adoptSeatId, clearSeat, loadSeat, saveSeat } from "../../lib/rejoin";
import { normalizeCode, playerId } from "../headbands/lobby";
import { LANES, MAX_ANSWER_LENGTH, type ChoiceTier, type LaneType } from "./gauntletEngine";
import { gauntletLobbyExists, isStaleGauntlet, joinGauntletLobby, leaveGauntletLobby, sendGauntletMove, watchGauntletLobby, type GauntletLobbyState, type GauntletMove, type GauntletPublic } from "./gauntletLobby";
import "../headbands/headbands.css";
import "./gauntlet.css";

interface Props {
  code: string | null;
  name?: string;
  onExit: () => void;
}

const NAME_KEY = "zuno.hb.name";
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};
const seatAtLoad = loadSeat("gauntlet");

/** A player's phone in an online Gauntlet room. */
export function GauntletJoin({ code: linkCode, name: givenName, onExit }: Props) {
  const resume = !givenName && seatAtLoad && (!linkCode || linkCode === seatAtLoad.code) ? seatAtLoad : null;
  if (resume) adoptSeatId(resume);
  const me = playerId();
  const [code, setCode] = useState(linkCode ?? "");
  const [name, setName] = useState(givenName ?? savedName());
  const [joined, setJoined] = useState<string | null>(null);
  const [lobby, setLobby] = useState<GauntletLobbyState | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEscape(onExit);

  useEffect(() => {
    if (!joined) return;
    return watchGauntletLobby(joined, (next) => setLobby((prev) => (next && prev?.game && isStaleGauntlet(prev.game, next.game) ? { ...next, game: prev.game } : next)), setProblem);
  }, [joined]);

  const join = async (c: string, n: string) => {
    if (c.length !== 5 || !n.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      if (!(await gauntletLobbyExists(c))) {
        clearSeat("gauntlet");
        setProblem(`There is no open room ${c}. Check the code on the host's screen.`);
        return;
      }
      await joinGauntletLobby(c, me, n, resume?.code === c && resume.extra?.includes("|t") ? Number(resume.extra.split("|t")[1]) : null);
      try {
        localStorage.setItem(NAME_KEY, n.trim());
      } catch {
        /* optional */
      }
      saveSeat("gauntlet", { code: c, name: n.trim(), extra: `id:${me}` });
      setJoined(c);
    } catch {
      setProblem("Could not reach the room. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (givenName && linkCode) void join(linkCode, givenName);
    else if (resume) void join(resume.code, resume.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mine = joined && lobby ? lobby.players[me] : undefined;
  const removed = joined && lobby && !mine;
  const pickTeam = (team: number) => {
    if (!joined || !mine) return;
    void joinGauntletLobby(joined, me, mine.name, team);
    saveSeat("gauntlet", { code: joined, name: mine.name, extra: `id:${me}|t${team}` });
  };
  const leave = () => {
    if (joined) void leaveGauntletLobby(joined, me);
    clearSeat("gauntlet");
    onExit();
  };

  return (
    <main className="screen game-scope" style={{ "--game": "#7C8CFF" } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Leave" onClick={leave}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Gauntlet{joined ? ` · Room ${joined}` : ""}</span>
      </header>
      <div className="gl-phone">
        {problem && <Notice tone="error">{problem}</Notice>}
        {!joined && (
          <form
            className="card gl-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void join(normalizeCode(code), name);
            }}
          >
            <h1 className="page-title">Join the Gauntlet</h1>
            <label className="field">
              <span className="field-label">Room code</span>
              <input className="input input-lg hb-code-input" value={code} maxLength={5} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="ABCDE" onChange={(e) => setCode(normalizeCode(e.target.value))} />
            </label>
            <label className="field">
              <span className="field-label">Your name</span>
              <input className="input input-lg" value={name} maxLength={24} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy || normalizeCode(code).length !== 5 || !name.trim()}>
              <LogIn size={18} strokeWidth={1.5} /> {busy ? "Joining…" : "Join"}
            </button>
          </form>
        )}
        {joined && lobby === undefined && <StatusView kind="loading" title="Connecting…" />}
        {joined && (lobby === null || removed) && (
          <StatusView kind="empty" title={removed ? "You left the room" : "The room has closed"} action={<button type="button" className="btn btn-primary" onClick={leave}>Back to Zuno</button>} />
        )}
        {joined && lobby?.hostAway && <Notice tone="warning">The host lost their connection. Hang on, they can resume.</Notice>}
        {joined && lobby && mine && lobby.phase === "lobby" && (
          <section className="card gl-panel" aria-labelledby="gl-pick">
            <p className="meta">You're in, {mine.name}</p>
            <h1 id="gl-pick" className="page-title">{mine.team === null ? "Pick your team" : `You're on ${lobby.teams[mine.team] ?? "a team"}`}</h1>
            <div className="gl-choices">
              {lobby.teams.map((t, i) => (
                <button key={i} type="button" className={`btn ${mine.team === i ? "btn-primary" : "btn-secondary"}`} aria-pressed={mine.team === i} onClick={() => pickTeam(i)}>
                  {t} · {Object.values(lobby.players).filter((p) => p.team === i).length}
                </button>
              ))}
            </div>
            {mine.team !== null && <p className="meta">Waiting for the host to start.</p>}
          </section>
        )}
        {joined && lobby && mine && lobby.phase === "playing" && (lobby.game ? <GauntletPhone code={joined} me={me} lobby={lobby} game={lobby.game} /> : <StatusView kind="loading" title="Starting…" />)}
      </div>
    </main>
  );
}

const TIERS: Array<{ tier: ChoiceTier; label: string }> = [
  { tier: "safe", label: "Safe · 300" },
  { tier: "bold", label: "Bold · 600, miss costs 100" },
  { tier: "unknown", label: "Unknown · 450" },
];
const LANE_NAMES: Record<LaneType, string> = { quickfire: "Quickfire", puzzle: "Puzzle", wild: "Wild" };

/** The phone view of a running match. It only ever sees the public view, never answers. */
function GauntletPhone({ code, me, lobby, game }: { code: string; me: string; lobby: GauntletLobbyState; game: GauntletPublic }) {
  const seat = lobby.players[me]?.team;
  const teamName = seat === null || seat === undefined ? null : lobby.teams[seat];
  const team = game.teams.find((t) => t.name === teamName) ?? null;
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const turn = game.turn;
  const turnKey = `${game.phase}:${game.turnNumber}`;
  useEffect(() => {
    setText("");
    setSent(null);
  }, [turnKey]);
  useEffect(() => {
    if (!game.timer.running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [game.timer.running]);
  const send = (move: GauntletMove) => {
    setSent(move.value);
    void sendGauntletMove(code, me, move).catch(() => setSent(null));
  };
  const secs = Math.ceil(Math.max(0, game.timer.remainingMs - (game.timer.running ? Math.max(0, now - game.timer.sentAt) : 0)) / 1000);

  if (!team) return <StatusView kind="empty" title="Watching" text="You were not placed on a team for this match. Follow along on the big screen." />;
  if (team.eliminated) return <StatusView kind="empty" title={`${team.name} is out`} text="Cheer the others on from the sidelines." />;

  const canAnswer = !!turn && !turn.resolved && !turn.submittedBy && (turn.teamId === null || turn.teamId === team.id) && secs > 0;
  return (
    <>
      <section className="card gl-panel" aria-label="Your team">
        <div className="gl-row">
          <strong>{team.name}</strong>
          <span className="gl-team-score">{game.scores[team.id] ?? 0}</span>
        </div>
        <span className="meta">Streak {game.streaks[team.id] ?? 0}</span>
      </section>
      {game.phase === "laneChoice" && (
        <section className="card gl-panel" aria-live="polite">
          {game.lanes[team.id] ? (
            <p>Your lane: <strong>{LANE_NAMES[game.lanes[team.id]]}</strong></p>
          ) : game.picker === team.id ? (
            <>
              <h2 className="page-title">Pick your lane</h2>
              <div className="gl-choices">
                {LANES.map((l) => (
                  <button key={l} type="button" className="btn btn-secondary" disabled={game.lockedLanes.includes(l) || !!sent} onClick={() => send({ type: "lane", value: l })}>
                    {LANE_NAMES[l]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="meta">Another team is picking a lane.</p>
          )}
        </section>
      )}
      {game.phase === "choice" && game.turnCount === 0 && (
        <section className="card gl-panel" aria-live="polite">
          {game.choiceLocked.includes(team.id) || sent ? (
            <p>Choice locked in. Only your team knows it.</p>
          ) : (
            <>
              <h2 className="page-title">Choose your risk</h2>
              <div className="gl-choices">
                {TIERS.map((t) => (
                  <button key={t.tier} type="button" className="btn btn-secondary" onClick={() => send({ type: "choice", value: t.tier })}>
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {turn && game.phase !== "results" && (
        <section className="card gl-question" aria-live="polite">
          <div className="gl-row">
            <span className="meta">{turn.teamId ? (turn.teamId === team.id ? "Your turn" : `${game.teams.find((t) => t.id === turn.teamId)?.name}'s turn`) : "All teams"}{turn.value ? ` · worth ${turn.value}` : ""}</span>
            {!turn.resolved && <TimerBadge seconds={secs} paused={!game.timer.running} />}
          </div>
          <p className="gl-prompt">{turn.prompt}</p>
          {turn.statements && <ol>{turn.statements.map((x) => <li key={x}>{x}</li>)}</ol>}
          {turn.hints.map((h, i) => <p key={i} className="meta">Hint {i + 1}: {h}</p>)}
          {canAnswer && !sent && (turn.choices?.length ? (
            <div className="gl-choices">
              {turn.choices.map((c) => <button key={c} type="button" className="btn btn-secondary" onClick={() => send({ type: "answer", value: c })}>{c}</button>)}
            </div>
          ) : (
            <form className="gl-actions" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send({ type: "answer", value: text.trim() }); }}>
              <label className="gl-grow">
                <span className="sr-only">Your answer</span>
                <input className="input input-lg" value={text} maxLength={MAX_ANSWER_LENGTH} autoComplete="off" placeholder="Your answer" onChange={(e) => setText(e.target.value)} />
              </label>
              <button type="submit" className="btn btn-primary" disabled={!text.trim()}><Send size={18} strokeWidth={1.5} /> Send</button>
            </form>
          ))}
          {sent && !turn.resolved && <p className="meta" role="status">Sent. Waiting for the host.</p>}
          {turn.submittedBy && turn.submittedBy !== team.id && !turn.resolved && <p className="meta">Another team buzzed in.</p>}
          {turn.resolved && (
            <p role="status">
              {turn.outcome === "correct" ? "Correct" : turn.outcome === "partial" ? "Partial credit" : turn.outcome === "expired" ? "Time's up" : turn.outcome === "pass" ? "Passed" : "Not this time"}
              {turn.answer ? <> · <strong>{turn.answer}</strong></> : null}
            </p>
          )}
        </section>
      )}
      {!turn && !["laneChoice", "choice", "results"].includes(game.phase) && <StatusView kind="loading" title="Get ready" text="The host is setting up the next stage." />}
      {game.phase === "results" && (
        <StatusView kind="empty" title={game.winners.includes(team.id) ? "You won!" : "Match over"} text={`Final score ${game.scores[team.id] ?? 0}. Winners: ${game.winners.map((w) => game.teams.find((t) => t.id === w)?.name).join(" & ")}`} />
      )}
    </>
  );
}
