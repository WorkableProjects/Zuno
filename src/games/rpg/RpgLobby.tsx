import { useEffect, useRef, useState } from "react";
import { FlipCode } from "../../components/ui/FlipCode";
import { useRegisterRoom } from "../../lib/room";
import QRCode from "qrcode";
import { ArrowDown, ArrowLeft, ArrowUp, Check, CircleAlert, Copy, Crown, Play, UserMinus } from "lucide-react";
import { Avatar, AvatarPicker } from "../../components/avatar/AvatarView";
import { loadAvatar, saveAvatar } from "../../components/avatar/avatarData";
import { useEscape } from "../../components/navigation/spatialNav";
import { ConfirmDialog } from "../../components/ui/Dialog";
import { ITEM_COST_LIMITS, ITEM_IDS, RPG_LIMITS, formatCoins, itemInfo, type ItemId, type RpgFile, type RpgSettings } from "../../game-files/schema/rpg";
import { playerId } from "../headbands/lobby";
import { useJoinSound } from "../../lib/useGameSounds";
import { ItemInfoTip } from "./ItemInfo";
import { RpgTitle } from "./RpgTitle";
import {
  canStart,
  clearRpgReady,
  closeRpgLobby,
  createRpgLobby,
  joinRpgLobby,
  leaveRpgLobby,
  moveInOrder,
  orderedPlayers,
  rpgJoinLink,
  setRpgLobby,
  setRpgOrder,
  watchRpgLobby,
  type RpgLobbyState,
} from "./rpgLobby";
import "../jeopardy/setup.css";
import "../headbands/headbands.css";
import "./rpg.css";

interface Props {
  file: RpgFile;
  code: string | null;
  onCode: (code: string) => void;
  onBack: () => void;
  onStart: (players: Array<{ id: string; name: string }>, settings: RpgSettings) => void;
}

const NAME_KEY = "zuno.hb.name";
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

const MONEY_PRESETS = [1000, 10000, 100000, 1000000];

/** The host's lobby for online Rock Paper Gamble. The host plays too. */
export function RpgLobby({ file, code: initialCode, onCode, onBack, onStart }: Props) {
  const me = playerId();
  const [name, setName] = useState(savedName);
  const [avatar, setAvatar] = useState(loadAvatar);
  const [code, setCode] = useState<string | null>(initialCode);
  const [lobby, setLobby] = useState<RpgLobbyState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [money, setMoney] = useState(file.settings.startingMoney);
  const [itemsOn, setItemsOn] = useState(file.settings.items);
  const [costs, setCosts] = useState<Record<ItemId, number>>({ ...file.settings.itemCosts });
  const created = useRef(false);
  const cleared = useRef(false);
  useEscape(() => setConfirmLeave(true), !confirmLeave);
  useRegisterRoom(code ? `rpg/${code}` : null, "Host");

  useEffect(() => {
    if (code || created.current) return;
    created.current = true;
    createRpgLobby()
      .then((c) => {
        setCode(c);
        onCode(c);
      })
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : "Could not open a room."));
  }, [code, onCode]);

  useEffect(() => {
    if (!code) return;
    void setRpgLobby(code, { phase: "lobby", game: null, actions: null, private: null, startingMoney: file.settings.startingMoney });
    return watchRpgLobby(code, setLobby, setProblem);
  }, [code, file.settings.startingMoney]);

  // A room reopened after a game starts fresh: nobody is ready yet.
  useEffect(() => {
    if (!code || !lobby || cleared.current) return;
    cleared.current = true;
    const ready = Object.entries(lobby.players).filter(([, p]) => p.ready).map(([id]) => id);
    if (ready.length > 0) void clearRpgReady(code, ready).catch(() => undefined);
  }, [code, lobby]);

  const trimmed = name.trim();
  useEffect(() => {
    if (!code || trimmed === "") return;
    const t = window.setTimeout(() => {
      void joinRpgLobby(code, me, trimmed, avatar).catch(() => setProblem("Could not add you to the room."));
      saveAvatar(avatar);
      try {
        localStorage.setItem(NAME_KEY, trimmed);
      } catch {
        /* optional */
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [code, me, trimmed, avatar]);

  // Phones read the starting money from the room.
  const validMoney = Number.isInteger(money) && money >= RPG_LIMITS.minMoney && money <= RPG_LIMITS.maxMoney;
  useEffect(() => {
    if (!code || !validMoney) return;
    const t = window.setTimeout(() => void setRpgLobby(code, { startingMoney: money }).catch(() => undefined), 250);
    return () => window.clearTimeout(t);
  }, [code, money, validMoney]);

  useEffect(() => {
    if (code)
      void QRCode.toDataURL(rpgJoinLink(code), { margin: 1, width: 240 })
        .then(setQr)
        .catch(() => setQr(""));
  }, [code]);

  const list = lobby ? orderedPlayers(lobby) : [];
  useJoinSound(list.length);
  const maxPlayers = file.settings.maxPlayers;
  const names = list.map((p) => p.name.trim().toLowerCase());
  const dupes = new Set(names).size !== names.length;
  const validCosts = ITEM_IDS.every((id) => Number.isInteger(costs[id]) && costs[id] >= ITEM_COST_LIMITS[id].min && costs[id] <= ITEM_COST_LIMITS[id].max);
  const ready = !!code && validMoney && (!itemsOn || validCosts) && !dupes && canStart(list, me, RPG_LIMITS.minPlayers, maxPlayers);
  const notReady = list.filter((p) => p.id !== me && !p.ready).length;

  const reorder = (id: string, by: -1 | 1) => {
    if (!code) return;
    void setRpgOrder(code, moveInOrder(list.map((p) => p.id), id, by)).catch(() => setProblem("Could not change the order."));
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(rpgJoinLink(code));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The link is on screen. */
    }
  };

  const start = async () => {
    if (!code || !ready) return;
    try {
      await setRpgOrder(code, list.map((p) => p.id));
      await setRpgLobby(code, { phase: "playing", startingMoney: money });
    } catch {
      setProblem("Could not start the game. Check your connection.");
      return;
    }
    onStart(
      list.map((p) => ({ id: p.id, name: p.name })),
      { ...file.settings, startingMoney: money, items: itemsOn, itemCosts: validCosts ? costs : file.settings.itemCosts },
    );
  };

  return (
    <main className="screen game-scope" style={{ "--game": file.appearance.accentColor } as React.CSSProperties}>
      <header className="screen-bar" data-nav-row="0">
        <button type="button" className="icon-btn" aria-label="Close the room" onClick={() => setConfirmLeave(true)}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="screen-bar-title">Rock Paper Gamble online</span>
      </header>
      <div className="setup">
        <div className="setup-intro">
          <RpgTitle />
          <p className="page-lede">Rock paper scissors duels with money on the line.</p>
          {code ? (
            <div className="hb-join-info">
              {qr && <img className="hb-qr" src={qr} alt={`QR code to join room ${code}`} width={200} height={200} />}
              <div className="hb-join-text">
                <p className="meta">Room code</p>
                <FlipCode code={code} />
                <p className="hb-link">{rpgJoinLink(code)}</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
                  {copied ? <Check size={16} strokeWidth={1.5} /> : <Copy size={16} strokeWidth={1.5} />}
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
            </div>
          ) : (
            !problem && (
              <p className="page-lede" role="status">
                Opening a room…
              </p>
            )
          )}
          <div className="hb-howto">
            <p>You play too. Everyone else scans the code, or opens Zuno, taps Join and types the room code.</p>
            <p>Everyone starts with the same money. On your turn, challenge someone. Everyone else bets on who wins. Win the duel and you take the pot.</p>
          </div>
          {problem && (
            <div className="notice notice-error" role="alert">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>{problem}</p>
            </div>
          )}
        </div>

        <div className="setup-panel card">
          <label className="field setup-field">
            <span className="setup-label">Your name</span>
            <input className="input" value={name} maxLength={24} autoComplete="nickname" placeholder="You play as well" data-autofocus onChange={(e) => setName(e.target.value)} />
          </label>
          <AvatarPicker name={name} value={avatar} onChange={setAvatar} />

          <div className="setup-field">
            <span className="setup-label">
              Turn order · {list.length} of {maxPlayers}
            </span>
            {list.length === 0 ? (
              <p className="meta">Nobody has joined yet.</p>
            ) : (
              <ol className="hb-circle">
                {list.map((p, i) => (
                  <li key={p.id} className="hb-circle-row">
                    <span className="team-index">{i + 1}</span>
                    <span className="hb-circle-who">
                      <Avatar name={p.name} avatar={p.avatar} size={28} />
                      <strong>{p.name}</strong>
                      {p.id === me && (
                        <span className="meta">
                          {" "}
                          <Crown size={14} strokeWidth={1.5} aria-label="Host" /> you
                        </span>
                      )}
                    </span>
                    <span className="hb-circle-tools">
                      <span className={`hb-circle-status${p.ready || p.id === me ? " is-done" : ""}`}>{p.id === me ? "Host" : p.ready ? "Ready" : "Not ready"}</span>
                      <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => reorder(p.id, -1)}>
                        <ArrowUp size={16} strokeWidth={1.5} />
                      </button>
                      <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${p.name} down`} disabled={i === list.length - 1} onClick={() => reorder(p.id, 1)}>
                        <ArrowDown size={16} strokeWidth={1.5} />
                      </button>
                      <button type="button" className="icon-btn icon-btn-sm" aria-label={`Remove ${p.name}`} disabled={p.id === me} onClick={() => code && void leaveRpgLobby(code, p.id)}>
                        <UserMinus size={16} strokeWidth={1.5} />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="setup-field">
            <label className="setup-label" htmlFor="rpg-money">
              Starting money
            </label>
            <input
              id="rpg-money"
              className="input"
              inputMode="numeric"
              value={Number.isFinite(money) ? String(money) : ""}
              aria-invalid={!validMoney}
              onChange={(e) => setMoney(Number(e.target.value.replace(/[^0-9]/g, "")))}
            />
            <div className="rpg-presets" role="group" aria-label="Starting money presets">
              {MONEY_PRESETS.map((m) => (
                <button key={m} type="button" className={`chip${money === m ? " is-picked" : ""}`} aria-pressed={money === m} onClick={() => setMoney(m)}>
                  {formatCoins(m)}
                </button>
              ))}
            </div>
            {!validMoney && (
              <p className="field-hint rpg-problem">
                Choose {formatCoins(RPG_LIMITS.minMoney)} to {formatCoins(RPG_LIMITS.maxMoney)}.
              </p>
            )}
          </div>
          <div className="setup-field rpg-items-setup">
            <label className="rpg-switch">
              <input type="checkbox" checked={itemsOn} onChange={(e) => setItemsOn(e.target.checked)} />
              <span className="setup-label">Items</span>
            </label>
            <p className="meta">Players can buy bombs, nukes, landmines and interceptors between duels.</p>
            {itemsOn && (
              <ul className="rpg-item-costs">
                {ITEM_IDS.map((id) => {
                  const { min, max } = ITEM_COST_LIMITS[id];
                  const bad = !(Number.isInteger(costs[id]) && costs[id] >= min && costs[id] <= max);
                  return (
                    <li key={id}>
                      <span className="rpg-grow">
                        <strong>{itemInfo(id, costs).name}</strong> <ItemInfoTip id={id} costs={costs} />
                        <span className="meta rpg-status">{itemInfo(id, costs).short}</span>
                      </span>
                      <input
                        className="input rpg-cost-input"
                        inputMode="numeric"
                        aria-label={`${itemInfo(id, costs).name} cost`}
                        aria-invalid={bad}
                        value={Number.isFinite(costs[id]) ? String(costs[id]) : ""}
                        onChange={(e) => setCosts({ ...costs, [id]: Number(e.target.value.replace(/[^0-9]/g, "")) })}
                      />
                      {bad && (
                        <span className="field-hint rpg-problem">
                          {formatCoins(min)} to {formatCoins(max)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <dl className="rpg-config meta">
            <div>
              <dt>Duel</dt>
              <dd>First to 3 round wins</dd>
            </div>
            <div>
              <dt>Timers</dt>
              <dd>
                {file.settings.selectSeconds}s pick · {file.settings.bettingSeconds}s bets · {file.settings.roundSeconds}s per round
              </dd>
            </div>
          </dl>

          {dupes && (
            <div className="notice notice-error">
              <CircleAlert size={18} strokeWidth={1.5} />
              <p>Two players share a name. One of them needs to rejoin with a different name.</p>
            </div>
          )}
          <div className="setup-actions">
            <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => void start()}>
              <Play size={18} strokeWidth={1.5} />
              {ready ? "Start match" : notReady > 0 ? `Waiting for ${notReady} to ready up` : "Start match"}
            </button>
          </div>
          {list.length < RPG_LIMITS.minPlayers && <p className="field-hint">At least {RPG_LIMITS.minPlayers} players, you included, need to join.</p>}
        </div>
      </div>
      {confirmLeave && (
        <ConfirmDialog
          title="Close the room?"
          text="Everyone in it is disconnected."
          confirmLabel="Close room"
          danger
          onConfirm={() => {
            if (code) void closeRpgLobby(code);
            onBack();
          }}
          onClose={() => setConfirmLeave(false)}
        />
      )}
    </main>
  );
}
