import { describe, expect, it } from "vitest";
import { DomainValidationError, normalizeRoomInput, normalizeVisitorInput } from "./index.js";

describe("shared validation", () => {
  it("normalizes visitor input", () => {
    expect(normalizeVisitorInput({ displayName: "  阿鲸  ", steamFriendCode: " 123 456 " })).toEqual({
      displayName: "阿鲸",
      steamFriendCode: "123 456",
      token: undefined,
    });
  });

  it("rejects unsafe voice links", () => {
    expect(() =>
      normalizeRoomInput({
        title: "N10 有 mod",
        branch: "beta",
        modMode: "modded",
        modTags: ["Together"],
        difficultyLevel: 10,
        currentPlayers: 2,
        maxPlayers: 4,
        voiceLink: "javascript:alert(1)",
        notes: "",
      }),
    ).toThrow(DomainValidationError);
  });

  it("rejects ascension levels above the current game cap", () => {
    expect(() =>
      normalizeRoomInput({
        title: "N11",
        branch: "stable",
        modMode: "none",
        modTags: [],
        difficultyLevel: 11,
        currentPlayers: 1,
        maxPlayers: 4,
        voiceLink: "",
        notes: "",
      }),
    ).toThrow(DomainValidationError);
  });
});
