import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Annoyed, Bell, Drum, LayoutGrid, Megaphone, MessageCircle, Music2, PartyPopper, Send, ThumbsDown, Trophy, Volume, Volume1, Volume2, VolumeX, type LucideIcon } from "lucide-react";
import { preloadBoardClips, sendBoardSound, useSoundboardListener, type BoardId } from "../../lib/soundboard";
import { useRoom } from "../../lib/room";
import { CHAT_MAX, useChat } from "../../lib/chat";
import { isSfxEnabled, playSfx, subscribeSfx } from "../../lib/sfx";
import { getVolume, isMuted, setMuted, setVolume, subscribeMuted } from "../../lib/audio";

const BOARD: { id: BoardId; label: string; Icon: LucideIcon }[] = [
  { id: "airhorn", label: "Air horn", Icon: Megaphone },
  { id: "drumroll", label: "Drum roll", Icon: Drum },
  { id: "sadTrombone", label: "Sad trombone", Icon: ThumbsDown },
  { id: "applause", label: "Applause", Icon: PartyPopper },
  { id: "boing", label: "Boing", Icon: Annoyed },
  { id: "rimshot", label: "Rimshot", Icon: Bell },
  { id: "win", label: "Fanfare", Icon: Trophy },
  { id: "wrong", label: "Buzzer", Icon: Music2 },
];

type Panel = "volume" | "board" | "chat";

/**
 * Bottom-right multi-button. One main button expands (hover, focus or click)
 * into volume, soundboard and chat buttons, each with its own popover. Recent
 * chat messages also surface in a small feed in the bottom-left.
 */
export function CornerControls({ docked = false }: { docked?: boolean }) {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  const volume = useSyncExternalStore(subscribeMuted, getVolume, () => 0.7);
  const percent = Math.round(volume * 100);
  const sfxOn = useSyncExternalStore(subscribeSfx, isSfxEnabled, () => true);
  const silent = muted || percent === 0;
  const heardOff = silent || !sfxOn;
  const VolIcon = silent ? VolumeX : percent < 34 ? Volume : percent < 67 ? Volume1 : Volume2;
  const room = useRoom();
  useSoundboardListener();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [pinned, setPinned] = useState(false);
  // Kept here, not in ChatPanel, so an unsent draft survives closing the chat.
  const [draft, setDraft] = useState("");
  const active: Panel | null = panel === "chat" && !room ? null : panel;
  const chatOpen = active === "chat";
  const { messages, feed, unread, send, dismiss } = useChat(room, chatOpen);
  useEffect(() => {
    if (!room) setPanel((p) => (p === "chat" ? null : p));
  }, [room]);
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});
  const showBadge = !!room && !chatOpen && unread > 0;
  // A new message pops up on screen with a soft chime.
  const lastFeed = useRef<string | null>(null);
  useEffect(() => {
    const top = feed[feed.length - 1]?.key ?? null;
    if (top && top !== lastFeed.current) playSfx("open");
    lastFeed.current = top;
  }, [feed]);

  useEffect(() => {
    if (active === "board") void preloadBoardClips();
    if (!active && !pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Keep the screen underneath from also reacting to this Escape.
      e.preventDefault();
      if (active) {
        buttons.current[active]?.focus();
        setPanel(null);
      } else setPinned(false);
    };
    const onDown = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return;
      setPanel(null);
      setPinned(false);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [active, pinned]);

  // On phones the on-screen keyboard shrinks the visual viewport but not fixed
  // elements: lift the controls so the chat input stays visible above it.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = root.current;
    if (!vv || !el) return;
    const apply = () => {
      const covered = chatOpen ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      el.style.setProperty("--kb", `${Math.round(covered)}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      el.style.removeProperty("--kb");
    };
  }, [chatOpen]);

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const stackBtn = (p: Panel) => (el: HTMLButtonElement | null) => void (buttons.current[p] = el);
  const open = pinned || active !== null;

  return (
    <>
      <div className={`corner${docked ? " is-docked" : ""}`} ref={root} data-open={open}>
        <button
          type="button"
          className="icon-btn corner-main"
          aria-expanded={open}
          aria-controls="corner-stack"
          aria-label={showBadge ? `Sound and chat controls, ${unread} unread message${unread === 1 ? "" : "s"}` : "Sound and chat controls"}
          title="Sound and chat"
          onClick={(e) => {
            if (open) {
              setPanel(null);
              setPinned(false);
              e.currentTarget.blur();
            } else setPinned(true);
          }}
        >
          <LayoutGrid size={20} strokeWidth={1.5} />
          {showBadge && <span className="corner-badge" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
        </button>
        <div className="corner-stack" id="corner-stack" role="group" aria-label="Sound and chat">
          {room && (
            <button
              ref={stackBtn("chat")}
              type="button"
              className="icon-btn corner-sub"
              aria-expanded={chatOpen}
              aria-controls="corner-chat"
              aria-label={showBadge ? `Chat, ${unread} unread` : "Chat"}
              title="Chat"
              onClick={() => toggle("chat")}
            >
              <MessageCircle size={18} strokeWidth={1.5} />
              {showBadge && <span className="corner-badge corner-badge-sub" aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
            </button>
          )}
          <button ref={stackBtn("board")} type="button" className="icon-btn corner-sub" aria-expanded={active === "board"} aria-controls="corner-board" aria-label="Soundboard" title="Soundboard" onClick={() => toggle("board")}>
            <Music2 size={18} strokeWidth={1.5} />
          </button>
          <button ref={stackBtn("volume")} type="button" className="icon-btn corner-sub" aria-expanded={active === "volume"} aria-controls="corner-volume" aria-label="Volume" title={silent ? "Sound off" : `Volume ${percent}%`} onClick={() => toggle("volume")}>
            <VolIcon size={18} strokeWidth={1.5} />
          </button>
        </div>

        {active === "volume" && (
          <div className="corner-panel corner-volume" id="corner-volume" role="group" aria-label="Volume">
            <span className="corner-level" aria-hidden="true">{silent ? "Off" : `${percent}%`}</span>
            <input
              type="range"
              className="corner-slider"
              min={0}
              max={100}
              step={1}
              value={muted ? 0 : percent}
              aria-label="Volume"
              aria-valuetext={silent ? "Off" : `${percent} percent`}
              style={{ "--level": `${muted ? 0 : percent}%` } as React.CSSProperties}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
            />
            <button
              type="button"
              className="icon-btn corner-sub"
              aria-pressed={muted}
              aria-label={muted ? "Sound is off. Turn sound on" : "Sound is on. Turn sound off"}
              title={muted ? "Turn sound on" : "Turn sound off"}
              onClick={() => {
                // Unmuting at 0% would still be silent, so bring the level back up.
                if (muted && percent === 0) setVolume(0.7);
                setMuted(!muted);
              }}
            >
              <VolIcon size={18} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {active === "board" && (
          <div className="corner-panel corner-board" id="corner-board" role="group" aria-label="Soundboard">
            <div className="corner-board-grid">
              {BOARD.map(({ id, label, Icon }) => (
                <button key={id} type="button" className="icon-btn corner-board-sound" title={label} aria-label={label} onClick={() => sendBoardSound(id)}>
                  <Icon size={18} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <p className="corner-hint">{room ? "Plays for everyone in this room" : "Plays on this device"}</p>
            {heardOff && <p className="corner-hint corner-warn" role="status">{!sfxOn && !silent ? "Sound effects are off in Settings, so you will not hear the board." : "Sound is off, so you will not hear the board."}</p>}
          </div>
        )}

        {chatOpen && <ChatPanel messages={messages} send={send} value={draft} onChange={setDraft} />}
      </div>

      {room && !chatOpen && feed.length > 0 && (
        <ul className="chat-feed" aria-label="New chat messages">
          {feed.map((m) => (
            <li key={m.key} className="chat-feed-item">
              <button
                type="button"
                className="chat-feed-btn"
                aria-label={`${m.n} says: ${m.t}. Open chat`}
                onClick={() => {
                  dismiss(m.key);
                  setPanel("chat");
                }}
              >
                <span className="chat-feed-avatar" aria-hidden="true">
                  {m.n.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <span className="chat-feed-body">
                  <strong className="chat-name">{m.n}</strong>
                  <span className="chat-text">{m.t}</span>
                </span>
                <span className="chat-feed-hint" aria-hidden="true">
                  <MessageCircle size={14} strokeWidth={2} />
                </span>
                <span className="chat-feed-timer" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ChatPanel({
  messages,
  send,
  value,
  onChange,
}: {
  messages: ReturnType<typeof useChat>["messages"];
  send: ReturnType<typeof useChat>["send"];
  value: string;
  onChange: (text: string) => void;
}) {
  const [note, setNote] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const submit = async () => {
    if (!value.trim()) return;
    const r = await send(value);
    if (r === "ok") {
      onChange("");
      setNote("");
    } else if (r === "cooldown") setNote("One message per second.");
    else if (r === "error") setNote("Could not send. Try again.");
    input.current?.focus();
  };
  return (
    <div className="corner-panel corner-chat" id="corner-chat" role="group" aria-label="Chat">
      <div className="chat-list" ref={list} role="log" aria-live="polite" aria-label="Messages" tabIndex={0}>
        {messages.length === 0 && <p className="corner-hint">No messages yet.</p>}
        {messages.map((m) => (
          <p key={m.key} className={`chat-msg${m.own ? " chat-own" : ""}`}>
            <strong className="chat-name">{m.n}</strong>
            <span className="chat-text">{m.t}</span>
          </p>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          ref={input}
          className="chat-input"
          value={value}
          maxLength={CHAT_MAX}
          autoComplete="off"
          placeholder="Message"
          aria-label="Message"
          onChange={(e) => {
            onChange(e.target.value);
            setNote("");
          }}
        />
        <button type="submit" className="icon-btn chat-send" aria-label="Send message" title="Send" disabled={!value.trim()}>
          <Send size={16} strokeWidth={1.5} />
        </button>
      </form>
      {(note || value.length >= CHAT_MAX - 40) && (
        <div className="chat-foot" aria-live="polite">
          <span className="chat-note">{note}</span>
          {value.length >= CHAT_MAX - 40 && <span className="chat-count">{value.length}/{CHAT_MAX}</span>}
        </div>
      )}
    </div>
  );
}
