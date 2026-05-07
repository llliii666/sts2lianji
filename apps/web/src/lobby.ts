import type { GameBranch, ModMode, Room, RoomInput, RoomStatus } from "@spire-lobby/shared";

export interface LobbyFilters {
  branch: "all" | GameBranch;
  modMode: "all" | ModMode;
  status: "recruiting" | "playing" | "all";
  difficultyMode: "all" | "n" | "ascension";
  minDifficulty: number;
  maxDifficulty: number;
  query: string;
}

export const defaultFilters: LobbyFilters = {
  branch: "all",
  modMode: "all",
  status: "recruiting",
  difficultyMode: "all",
  minDifficulty: 0,
  maxDifficulty: 20,
  query: "",
};

export const defaultRoomInput: RoomInput = {
  title: "N10 招募",
  branch: "stable",
  modMode: "none",
  modTags: [],
  difficultyMode: "n",
  difficultyLevel: 10,
  currentPlayers: 1,
  maxPlayers: 4,
  voiceLink: "",
  notes: "",
};

export function filterRooms(rooms: Room[], filters: LobbyFilters): Room[] {
  const query = filters.query.trim().toLowerCase();
  return rooms.filter((room) => {
    if (filters.status !== "all" && room.status !== filters.status) return false;
    if (filters.branch !== "all" && room.branch !== filters.branch) return false;
    if (filters.modMode !== "all" && room.modMode !== filters.modMode) return false;
    if (filters.difficultyMode !== "all" && room.difficultyMode !== filters.difficultyMode) return false;
    if (room.difficultyLevel < filters.minDifficulty || room.difficultyLevel > filters.maxDifficulty) return false;
    if (!query) return true;
    const searchable = [
      room.title,
      room.notes,
      room.host.displayName,
      room.host.steamFriendCode,
      ...room.modTags,
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });
}

export function getStatusLabel(status: RoomStatus): string {
  return {
    draft: "草稿",
    recruiting: "招募中",
    playing: "游戏中",
    ended: "已结束",
  }[status];
}

export function getBranchLabel(branch: GameBranch): string {
  return branch === "stable" ? "正式版" : "Beta版";
}

export function getModModeLabel(mode: ModMode): string {
  return mode === "none" ? "无Mod" : "有Mod";
}

export function getDifficultyLabel(room: Pick<Room, "difficultyMode" | "difficultyLevel">): string {
  return room.difficultyMode === "n" ? `N${room.difficultyLevel}` : `进阶${room.difficultyLevel}`;
}

export function getCountdownTarget(room: Room): string | null {
  if (room.status === "recruiting") return room.recruitingUntil;
  if (room.status === "playing") return room.destroyAt;
  return null;
}

export function formatRemaining(targetIso: string | null, nowMs: number): string {
  if (!targetIso) return "--:--";
  const remaining = Math.max(0, new Date(targetIso).getTime() - nowMs);
  const minutes = Math.floor(remaining / 60_000)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor((remaining % 60_000) / 1_000)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function roomToInput(room: Room): RoomInput {
  return {
    title: room.title,
    branch: room.branch,
    modMode: room.modMode,
    modTags: room.modTags,
    difficultyMode: room.difficultyMode,
    difficultyLevel: room.difficultyLevel,
    currentPlayers: room.currentPlayers,
    maxPlayers: room.maxPlayers,
    voiceLink: room.voiceLink,
    notes: room.notes,
  };
}
