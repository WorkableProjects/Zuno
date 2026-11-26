/**
 * Security audit for profiles, cosmetics, achievements and the admin, run against the
 * Realtime Database emulator with the real database.rules.json:
 *
 *   npm run test:rules
 *
 * Skipped when no emulator is running (plain `npm test`).
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { get, ref, set, update } from "firebase/database";
import { ADMIN_EMAIL, idsFor } from "../src/lib/cosmetics";

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const RULES = readFileSync(new URL("../database.rules.json", import.meta.url), "utf8");

describe("rules file matches the cosmetics catalog", () => {
  it("lists every free and achievement item in the equip regexes", () => {
    for (const kind of ["decoration", "nameStyle"] as const) {
      expect(RULES).toContain(`matches(/^(${idsFor(kind, "free").join("|")})$/)`);
      expect(RULES).toContain(`matches(/^(${idsFor(kind, "achievement").join("|")})$/)`);
    }
    expect(RULES).toContain(`auth.token.email.toLowerCase() === '${ADMIN_EMAIL}'`);
  });
});

describe.skipIf(!HOST)("database rules: profiles, cosmetics and admin", () => {
  let env: RulesTestEnvironment;
  const [host, port] = (HOST ?? "127.0.0.1:9000").split(":");
  const admin = () => env.authenticatedContext("admin1", { email: ADMIN_EMAIL, email_verified: true }).database();
  const alice = () => env.authenticatedContext("alice", { email: "alice@example.com", email_verified: true }).database();
  const bob = () => env.authenticatedContext("bob", { email: "bob@example.com", email_verified: true }).database();

  beforeAll(async () => {
    env = await initializeTestEnvironment({ projectId: "demo-zuno-rules", database: { host, port: Number(port), rules: RULES } });
  });
  afterAll(async () => env?.cleanup());
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database();
      await set(ref(db, "usernames/alice"), "alice");
      await set(ref(db, "profiles/alice"), { username: "alice", avatar: JSON.stringify({ color: "#112233" }), createdAt: 1, email: "alice@example.com" });
      await set(ref(db, "usernames/bob"), "bob");
      await set(ref(db, "profiles/bob"), { username: "bob", createdAt: 2 });
      await set(ref(db, "hb/ABCDE"), { phase: "lobby", mode: "text", createdAt: 1, players: { p1: { name: "Al", joinedAt: 1 } } });
    });
  });

  describe("admin identity", () => {
    it("only the verified admin may list every profile or grant", async () => {
      await assertSucceeds(get(ref(admin(), "profiles")));
      await assertSucceeds(get(ref(admin(), "grants")));
      await assertFails(get(ref(alice(), "profiles")));
      await assertFails(get(ref(alice(), "grants")));
      await assertFails(get(ref(env.unauthenticatedContext().database(), "profiles")));
    });
    it("rejects the admin email when it isn't verified", async () => {
      const db = env.authenticatedContext("fake", { email: ADMIN_EMAIL, email_verified: false }).database();
      await assertFails(get(ref(db, "profiles")));
      await assertFails(set(ref(db, "grants/alice/decorations/neon"), true));
    });
    it("normalises the admin email's case", async () => {
      const db = env.authenticatedContext("admin2", { email: "ItzDutchs@Gmail.com", email_verified: true }).database();
      await assertSucceeds(get(ref(db, "profiles")));
    });
    it("a look-alike address is not the admin", async () => {
      const db = env.authenticatedContext("evil", { email: "itzdutchs@gmail.com.evil.io", email_verified: true }).database();
      await assertFails(get(ref(db, "profiles")));
    });
  });

  describe("grants (admin grant/revoke endpoints)", () => {
    it("only the admin may grant or revoke", async () => {
      await assertFails(set(ref(alice(), "grants/alice/decorations/neon"), true));
      await assertFails(set(ref(bob(), "grants/alice/nameStyles/sunset"), true));
      await assertSucceeds(set(ref(admin(), "grants/alice/decorations/neon"), true));
      await assertFails(set(ref(alice(), "grants/alice/decorations/neon"), null));
      await assertSucceeds(set(ref(admin(), "grants/alice/decorations/neon"), null));
    });
    it("a player can read their own grants, not someone else's", async () => {
      await assertSucceeds(get(ref(alice(), "grants/alice")));
      await assertFails(get(ref(alice(), "grants/bob")));
    });
    it("the exclusive Zuno items can't be granted to anyone but the admin", async () => {
      await assertFails(set(ref(admin(), "grants/alice/decorations/zuno"), true));
      await assertFails(set(ref(admin(), "grants/alice/nameStyles/zuno"), true));
      await assertSucceeds(update(ref(admin(), "grants/admin1"), { "decorations/zuno": true, "nameStyles/zuno": true }));
    });
  });

  describe("equipping", () => {
    it("free items equip for anyone, unknown ids never", async () => {
      await assertSucceeds(set(ref(alice(), "profiles/alice/equippedDecoration"), "ring"));
      await assertSucceeds(set(ref(alice(), "profiles/alice/equippedNameStyle"), "accent"));
      await assertFails(set(ref(alice(), "profiles/alice/equippedDecoration"), "made-up"));
      await assertFails(set(ref(alice(), "profiles/alice/equippedDecoration"), 7));
    });
    it("gift items need a grant; revoking stops new equips", async () => {
      await assertFails(set(ref(alice(), "profiles/alice/equippedDecoration"), "neon"));
      await set(ref(admin(), "grants/alice/decorations/neon"), true);
      await assertSucceeds(set(ref(alice(), "profiles/alice/equippedDecoration"), "neon"));
      await set(ref(admin(), "grants/alice/decorations/neon"), null);
      await assertSucceeds(set(ref(alice(), "profiles/alice/equippedDecoration"), null));
      await assertFails(set(ref(alice(), "profiles/alice/equippedDecoration"), "neon"));
    });
    it("achievement items need the achievement", async () => {
      await assertFails(set(ref(alice(), "profiles/alice/equippedDecoration"), "first-game"));
      await assertSucceeds(set(ref(alice(), "profiles/alice/achievements/first-game"), { count: 1, at: 123 }));
      await assertSucceeds(set(ref(alice(), "profiles/alice/equippedDecoration"), "first-game"));
    });
    it("non-admins can never equip the Zuno decoration or name style", async () => {
      await assertFails(set(ref(alice(), "profiles/alice/equippedDecoration"), "zuno"));
      await assertFails(set(ref(alice(), "profiles/alice/equippedNameStyle"), "zuno"));
      await assertSucceeds(set(ref(admin(), "profiles/admin1/equippedDecoration"), "zuno"));
      await assertSucceeds(set(ref(admin(), "profiles/admin1/equippedNameStyle"), "zuno"));
      // Not even the admin can put it on someone else.
      await assertFails(set(ref(admin(), "profiles/alice/equippedDecoration"), "zuno"));
    });
    it("players can't change each other's items; the admin can only take them off", async () => {
      await set(ref(alice(), "profiles/alice/equippedDecoration"), "ring");
      await assertFails(set(ref(bob(), "profiles/alice/equippedDecoration"), null));
      await assertSucceeds(set(ref(admin(), "profiles/alice/equippedDecoration"), null));
      await assertFails(set(ref(admin(), "profiles/alice/username"), "hacked"));
    });
  });

  describe("profile privacy", () => {
    it("public children are readable by players, private ones aren't", async () => {
      await assertSucceeds(get(ref(bob(), "profiles/alice/username")));
      await assertSucceeds(get(ref(bob(), "profiles/alice/achievements")));
      await assertFails(get(ref(bob(), "profiles/alice/email")));
      await assertFails(get(ref(bob(), "profiles/alice")));
      await assertFails(get(ref(env.unauthenticatedContext().database(), "profiles/alice/username")));
    });
    it("the stored email must be the account's own", async () => {
      await assertSucceeds(set(ref(alice(), "profiles/alice/email"), "alice@example.com"));
      await assertFails(set(ref(alice(), "profiles/alice/email"), ADMIN_EMAIL));
    });
    it("sidebar placement is one of the four edges", async () => {
      await assertSucceeds(set(ref(alice(), "profiles/alice/sidebar"), "top"));
      await assertFails(set(ref(alice(), "profiles/alice/sidebar"), "diagonal"));
    });
  });

  describe("cosmetics in game rooms", () => {
    const av = (extra: Record<string, unknown>) => JSON.stringify({ color: "#112233", emoji: null, photo: null, ...extra });
    it("ordinary cosmetics travel with the avatar", async () => {
      await assertSucceeds(set(ref(alice(), "hb/ABCDE/players/p1/avatar"), av({ deco: "ring", style: "accent" })));
    });
    it("only the admin's avatar may carry Zuno items, and escapes can't smuggle them in", async () => {
      await assertFails(set(ref(alice(), "hb/ABCDE/players/p1/avatar"), av({ deco: "zuno" })));
      await assertFails(set(ref(alice(), "hb/ABCDE/players/p1/avatar"), av({ style: "zuno" })));
      await assertFails(set(ref(alice(), "hb/ABCDE/players/p1/avatar"), '{"color":"#112233","deco":"\\u007auno"}'));
      await assertSucceeds(set(ref(admin(), "hb/ABCDE/players/p1/avatar"), av({ deco: "zuno", style: "zuno" })));
    });
    it("chat carries a name style, but not the Zuno one for non-admins", async () => {
      await assertSucceeds(set(ref(alice(), "hb/ABCDE/chat/m1"), { n: "Al", t: "hi", at: 1, s: "accent" }));
      await assertFails(set(ref(alice(), "hb/ABCDE/chat/m2"), { n: "Al", t: "hi", at: 1, s: "zuno" }));
      await assertSucceeds(set(ref(admin(), "hb/ABCDE/chat/m3"), { n: "Dutch", t: "hi", at: 1, s: "zuno" }));
    });
  });
});
