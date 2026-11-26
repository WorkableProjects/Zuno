import { useCallback, useEffect, useRef, useState } from "react";
import { backend } from "./soundboard";
import { cleanCosmeticId } from "./cosmetics";
import { loadAvatar } from "../components/avatar/avatarData";
import type { Room } from "./room";

/**
 * In-room text chat. Messages are pushed to `{room}/chat` as `{ n, t, at }`
 * and everything received is untrusted: it is validated here and only ever
 * rendered as plain text.
 */
export const CHAT_MAX = 200;
export const CHAT_NAME_MAX = 24;
export const CHAT_COOLDOWN_MS = 1000;
export const CHAT_HISTORY = 50;
export const CHAT_FEED_MAX = 4;
export const CHAT_FEED_MS = 8000;

/** `s` is the sender's equipped name style, when they have one. */
export type ChatMessage = { key: string; n: string; t: string; at: number; own: boolean; s?: string };

/**
 * Takes whole code points while the UTF-16 length stays within `max` units,
 * so a surrogate pair is never split. Limits are counted in UTF-16 units.
 */
function clampCodePoints(s: string, max: number): string {
  let out = "";
  for (const ch of Array.from(s)) {
    if (out.length + ch.length > max) break;
    out += ch;
  }
  return out;
}

/** Trims, drops control characters and clamps to the length limit. */
export function sanitizeChatText(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return clampCodePoints(raw.replace(/[\u0000-\u001f\u007f]+/g, " ").trim(), CHAT_MAX).trim();
}

export const isValidChatText = (t: unknown): t is string => typeof t === "string" && t.length >= 1 && t.length <= CHAT_MAX && t === t.trim();

export const sanitizeChatName = (raw: string): string => clampCodePoints(raw.replace(/[\u0000-\u001f\u007f]+/g, " ").trim(), CHAT_NAME_MAX).trim() || "Player";

/** Pure cooldown check: true when enough time has passed since the last send. */
export function chatCooldownReady(lastAt: number, now: number, ms = CHAT_COOLDOWN_MS): boolean {
  return now - lastAt >= ms || now < lastAt;
}

/** Validates a database value; anything malformed is dropped. */
export function parseChatMessage(key: string, v: unknown): Omit<ChatMessage, "own"> | null {
  if (!v || typeof v !== "object") return null;
  const { n, t, at, s } = v as Record<string, unknown>;
  if (typeof n !== "string" || n.length < 1 || n.length > CHAT_NAME_MAX) return null;
  if (typeof t !== "string" || t.length < 1 || t.length > CHAT_MAX) return null;
  const style = cleanCosmeticId(s);
  return { key, n, t, at: typeof at === "number" ? at : 0, ...(style ? { s: style } : {}) };
}

export type SendResult = "ok" | "empty" | "cooldown" | "error";

export function useChat(room: Room | null, panelOpen: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [feed, setFeed] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const open = useRef(panelOpen);
  const sent = useRef(new Set<string>());
  const last = useRef(-Infinity);
  const roomRef = useRef(room);
  const path = room?.path ?? null;

  useEffect(() => {
    open.current = panelOpen;
    roomRef.current = room;
    if (panelOpen) {
      setUnread((u) => (u === 0 ? u : 0));
      setFeed((f) => (f.length === 0 ? f : []));
    }
  });

  useEffect(() => {
    setMessages([]);
    setFeed([]);
    setUnread(0);
    sent.current.clear();
    if (!path) return;
    let off: (() => void) | null = null;
    let cancelled = false;
    const timers = new Set<number>();
    void backend()
      .then((b) => {
        if (!b || cancelled) return;
        const { ref, query, orderByKey, limitToLast, onChildAdded, onChildRemoved, onValue } = b.db;
        const q = query(ref(b.d, `${path}/chat`), orderByKey(), limitToLast(CHAT_HISTORY));
        let ready = false;
        const unChild = onChildAdded(
          q,
          (snap) => {
            const m = parseChatMessage(snap.key ?? "", snap.val());
            if (!m || !snap.key) return;
            const msg: ChatMessage = { ...m, own: sent.current.has(snap.key) };
            setMessages((prev) => (prev.some((p) => p.key === msg.key) ? prev : [...prev, msg].slice(-CHAT_HISTORY)));
            // The first batch is history: only later messages notify.
            if (!ready || msg.own || open.current) return;
            setUnread((u) => u + 1);
            // Each pop-up times itself out (and pauses while read): see ChatFeedItem.
            setFeed((f) => [...f, msg].slice(-CHAT_FEED_MAX));
          },
          () => undefined,
        );
        const unRemoved = onChildRemoved(q, (snap) => setMessages((p) => p.filter((m) => m.key !== snap.key)));
        const unValue = onValue(q, () => void (ready = true), () => undefined, { onlyOnce: true });
        off = () => {
          unChild();
          unRemoved();
          unValue();
        };
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      off?.();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [path]);

  const send = useCallback(async (raw: string): Promise<SendResult> => {
    const r = roomRef.current;
    const text = sanitizeChatText(raw);
    if (!r || !text) return "empty";
    const now = Date.now();
    if (!chatCooldownReady(last.current, now)) return "cooldown";
    last.current = now;
    try {
      const b = await backend();
      if (!b) {
        last.current = -Infinity;
        return "error";
      }
      const { ref, push, set, serverTimestamp } = b.db;
      const item = push(ref(b.d, `${r.path}/chat`));
      // Mark as ours before the write so the optimistic local event is recognised.
      if (item.key) sent.current.add(item.key);
      const style = loadAvatar().style;
      await set(item, { n: sanitizeChatName(r.name), t: text, at: serverTimestamp(), ...(style ? { s: style } : {}) });
      return "ok";
    } catch {
      // A failed write should not hold the cooldown, so a retry goes straight through.
      last.current = -Infinity;
      return "error";
    }
  }, []);

  const dismiss = useCallback((key: string) => setFeed((f) => f.filter((x) => x.key !== key)), []);
  return { messages, feed, unread, send, dismiss };
}
