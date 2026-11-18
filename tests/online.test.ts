import { describe, expect, it } from "vitest";
import { parseAvatar } from "../src/components/avatar/avatarData";
import { createSessionWith, liarReducer, type LiarState, type Turn } from "../src/games/liar/liarEngine";
import { liarCodeFromHash, liarMoveToAction, readLiarLobby, toLiarOnline } from "../src/games/liar/liarLobby";
import { codeFromHash } from "../src/games/headbands/lobby";

const turn: Turn = {
  lieIndex: 2,
  statements: [0, 1, 2].map((i) => ({ text: `S${i}`, questions: [`Q${i}`] })),
};
const start = () => createSessionWith([{ id: "a", name: "Ana" }, { id: "b", name: "Ben" }, { id: "c", name: "Cy" }], { rounds: 1, scoring: true, allowAbstain: false });

describe("avatars", () => {
  it("accepts good avatars, as objects or JSON", () => {
    expect(parseAvatar({ color: "#E85D75", emoji: "🦊", photo: null })).toEqual({ color: "#E85D75", emoji: "🦊", photo: null });
    expect(parseAvatar(JSON.stringify({ color: "#112233" }))).toEqual({ color: "#112233", emoji: null, photo: null });
  });
  it("rejects bad colours and drops unsafe photos", () => {
    expect(parseAvatar({ color: "red" })).toBeNull();
    expect(parseAvatar("{not json")).toBeNull();
    expect(parseAvatar({ color: "#112233", photo: "javascript:alert(1)" })?.photo).toBeNull();
    expect(parseAvatar({ color: "#112233", photo: "data:image/jpeg;base64," + "A".repeat(30000) })?.photo).toBeNull();
  });
});

describe("online LIAR", () => {
  it("only lets the storyteller submit a turn", () => {
    const s = start();
    const move = { type: "submit" as const, turn: JSON.stringify(turn) };
    expect(liarMoveToAction(move, "b", s)).toBeNull();
    const action = liarMoveToAction(move, "a", s);
    expect(action?.type).toBe("submitTurn");
    expect(liarMoveToAction({ type: "submit", turn: "{bad" }, "a", s)).toBeNull();
  });

  it("keeps the lie and individual votes hidden until the reveal", () => {
    let s: LiarState = liarReducer(start(), { type: "submitTurn", turn });
    s = liarReducer(s, { type: "startVoting" });
    s = liarReducer(s, liarMoveToAction({ type: "vote", vote: "2" }, "b", s)!);
    const during = toLiarOnline(s);
    expect(during.lieIndex).toBeNull();
    expect(during.votes).toBeNull();
    expect(during.voted).toEqual(["b"]);
    expect(JSON.stringify(during)).not.toContain('"lieIndex":2');

    s = liarReducer(s, { type: "closeVoting" });
    const after = toLiarOnline(s);
    expect(after.lieIndex).toBe(2);
    expect(after.votes).toEqual({ b: 2 });
    expect(after.scores.b).toBe(1);
  });

  it("ignores votes from the storyteller and outsiders", () => {
    let s = liarReducer(liarReducer(start(), { type: "submitTurn", turn }), { type: "startVoting" });
    s = liarReducer(s, liarMoveToAction({ type: "vote", vote: "1" }, "a", s)!);
    s = liarReducer(s, liarMoveToAction({ type: "vote", vote: "1" }, "zz", s)!);
    expect(s.votes).toEqual({});
  });

  it("reads lobby data defensively", () => {
    expect(readLiarLobby(null)).toBeNull();
    expect(readLiarLobby({ phase: "party" })).toBeNull();
    const l = readLiarLobby({ phase: "lobby", players: { a: { name: "Ana", joinedAt: 3, avatar: "x" }, b: { nope: 1 } }, game: "{bad" });
    expect(l?.players).toEqual({ a: { name: "Ana", joinedAt: 3, avatar: null } });
    expect(l?.game).toBeNull();
  });

  it("tells LIAR links apart from Headbands links", () => {
    expect(liarCodeFromHash("#liar=abcde")).toBe("ABCDE");
    expect(liarCodeFromHash("#join=ABCDE")).toBeNull();
    expect(codeFromHash("#liar=ABCDE")).toBeNull();
    expect(codeFromHash("#join=ABCDE")).toBe("ABCDE");
  });
});
