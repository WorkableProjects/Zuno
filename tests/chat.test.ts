import { describe, expect, it } from "vitest";
import { CHAT_COOLDOWN_MS, CHAT_MAX, CHAT_NAME_MAX, chatCooldownReady, isValidChatText, parseChatMessage, sanitizeChatName, sanitizeChatText } from "../src/lib/chat";
import rules from "../database.rules.json";

describe("chat helpers", () => {
  it("trims and clamps text", () => {
    expect(sanitizeChatText("  hi  ")).toBe("hi");
    expect(sanitizeChatText("a\u0000b\nc")).toBe("a b c");
    expect(sanitizeChatText("x".repeat(500))).toHaveLength(CHAT_MAX);
    expect(sanitizeChatText("   ")).toBe("");
  });

  it("checks text length", () => {
    expect(isValidChatText("")).toBe(false);
    expect(isValidChatText(" a")).toBe(false);
    expect(isValidChatText("a")).toBe(true);
    expect(isValidChatText("a".repeat(CHAT_MAX))).toBe(true);
    expect(isValidChatText("a".repeat(CHAT_MAX + 1))).toBe(false);
    expect(isValidChatText(5)).toBe(false);
  });

  it("clamps names", () => {
    expect(sanitizeChatName("  ")).toBe("Player");
    expect(sanitizeChatName("n".repeat(40))).toHaveLength(CHAT_NAME_MAX);
  });

  it("never splits a surrogate pair when clamping", () => {
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    // Each emoji is two UTF-16 units. 199 units plus one emoji would be 201, so the emoji is dropped.
    const text = sanitizeChatText("a".repeat(199) + "😀");
    expect(text).toBe("a".repeat(199));
    expect(text).toHaveLength(199);
    expect(loneSurrogate.test(text)).toBe(false);

    const longText = sanitizeChatText("😀".repeat(150));
    expect(longText).toBe("😀".repeat(100));
    expect(longText).toHaveLength(CHAT_MAX);
    expect(loneSurrogate.test(longText)).toBe(false);

    const name = sanitizeChatName("😀".repeat(20));
    expect(name).toBe("😀".repeat(12));
    expect(name).toHaveLength(CHAT_NAME_MAX);
    expect(loneSurrogate.test(name)).toBe(false);
  });

  it("drops malformed database messages", () => {
    expect(parseChatMessage("k", { n: "A", t: "hello", at: 5 })).toEqual({ key: "k", n: "A", t: "hello", at: 5 });
    for (const bad of [null, "x", {}, { n: "", t: "x", at: 1 }, { n: "A", t: "", at: 1 }, { n: "A", t: "x".repeat(CHAT_MAX + 1), at: 1 }, { n: "A".repeat(25), t: "x", at: 1 }, { n: 1, t: "x" }]) {
      expect(parseChatMessage("k", bad)).toBeNull();
    }
  });

  it("enforces the send cooldown", () => {
    expect(chatCooldownReady(-Infinity, 0)).toBe(true);
    expect(chatCooldownReady(1000, 1000 + CHAT_COOLDOWN_MS - 1)).toBe(false);
    expect(chatCooldownReady(1000, 1000 + CHAT_COOLDOWN_MS)).toBe(true);
  });
});

describe("chat rules", () => {
  it("exist under every room with the same limits", () => {
    for (const room of ["hb", "liar", "rpg"] as const) {
      const c = (rules.rules[room].$code as Record<string, any>).chat.$id;
      expect(c[".validate"]).toContain("hasChildren(['n', 't', 'at'])");
      expect(c.n[".validate"]).toContain("<= 24");
      expect(c.n[".validate"]).toContain(">= 1");
      expect(c.t[".validate"]).toContain("<= 200");
      expect(c.t[".validate"]).toContain(">= 1");
      expect(c.at[".validate"]).toContain("isNumber");
      expect(c.$other[".validate"]).toBe(false);
    }
  });
});
