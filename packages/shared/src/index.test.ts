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
        title: "a10 有 mod",
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
        title: "a11",
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

  it("allows a blank room title", () => {
    expect(
      normalizeRoomInput({
        title: "",
        branch: "stable",
        modMode: "none",
        modTags: [],
        difficultyLevel: 10,
        currentPlayers: 1,
        maxPlayers: 4,
        voiceLink: "",
        notes: "",
      }).title,
    ).toBe("");
  });

  it("rejects player counts above four", () => {
    expect(() =>
      normalizeRoomInput({
        title: "",
        branch: "stable",
        modMode: "none",
        modTags: [],
        difficultyLevel: 10,
        currentPlayers: 5,
        maxPlayers: 5,
        voiceLink: "",
        notes: "",
      }),
    ).toThrow(DomainValidationError);
  });
});
