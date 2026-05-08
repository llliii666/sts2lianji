import { describe, expect, it } from "vitest";
import type { Room } from "@spire-lobby/shared";
import {
  defaultFilters,
  defaultRoomInput,
  filterRooms,
  formatRemaining,
  getDifficultyLabel,
  getRoomSaveReminder,
  tutorialSections,
} from "./lobby.js";

const baseRoom: Room = {
  id: "room-1",
  hostVisitorId: "visitor-1",
  host: { displayName: "阿鲸", steamFriendCode: "123456" },
  title: "a10 有mod",
  branch: "beta",
  modMode: "modded",
  modTags: ["Together"],
  difficultyLevel: 10,
  currentPlayers: 3,
  maxPlayers: 4,
  voiceLink: "https://example.com/voice",
  notes: "三缺一",
  status: "recruiting",
  createdAt: "2026-05-08T00:00:00.000Z",
  updatedAt: "2026-05-08T00:00:00.000Z",
  lastPublishedAt: "2026-05-08T00:00:00.000Z",
  recruitingUntil: "2026-05-08T00:05:00.000Z",
  destroyAt: "2026-05-08T00:10:00.000Z",
};

describe("lobby view helpers", () => {
  it("defaults to recruiting rooms", () => {
    const rooms = [baseRoom, { ...baseRoom, id: "room-2", status: "playing" as const }];
    expect(filterRooms(rooms, defaultFilters).map((room) => room.id)).toEqual(["room-1"]);
  });

  it("filters by mod tag query", () => {
    expect(filterRooms([baseRoom], { ...defaultFilters, query: "together" })).toHaveLength(1);
    expect(filterRooms([baseRoom], { ...defaultFilters, query: "downfall" })).toHaveLength(0);
  });

  it("filters by ascension shorthand level", () => {
    expect(filterRooms([baseRoom], { ...defaultFilters, difficultyLevel: 10 })).toHaveLength(1);
    expect(filterRooms([baseRoom], { ...defaultFilters, difficultyLevel: 5 })).toHaveLength(0);
  });

  it("labels ascension with the lowercase a shorthand", () => {
    expect(getDifficultyLabel(baseRoom)).toBe("a10");
  });

  it("starts new rooms with a blank title", () => {
    expect(defaultRoomInput.title).toBe("");
  });

  it("explains visible save reminders near the save action", () => {
    const reminder = getRoomSaveReminder({ modMode: "modded", voiceLink: "https://example.com/voice" }, "created");

    expect(reminder).toContain("草稿不会出现在公共大厅");
    expect(reminder).toContain("可直接加入且仍然有效");
    expect(reminder).toContain("所有玩家安装相同 Mod");
  });

  it("keeps tutorial content available for the first-login modal", () => {
    expect(tutorialSections.map((section) => section.body).join(" ")).toContain("左下角");
    expect(tutorialSections.map((section) => section.body).join(" ")).toContain("语音");
  });

  it("formats countdown as mm:ss", () => {
    expect(formatRemaining("2026-05-08T00:02:09.000Z", Date.parse("2026-05-08T00:00:00.000Z"))).toBe("02:09");
  });
});
