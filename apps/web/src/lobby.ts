import {
  ASCENSION_LEVEL_MAX,
  ASCENSION_LEVEL_MIN,
  ROOM_PLAYER_COUNT_MAX,
  ROOM_PLAYER_COUNT_MIN,
} from "@spire-lobby/shared";
import type { GameBranch, ModMode, Room, RoomInput, RoomStatus } from "@spire-lobby/shared";

export interface LobbyFilters {
  branch: "all" | GameBranch;
  modMode: "all" | ModMode;
  status: "recruiting" | "playing" | "all";
  difficultyLevel: "all" | number;
  minDifficulty: number;
  maxDifficulty: number;
  query: string;
}

export const defaultFilters: LobbyFilters = {
  branch: "all",
  modMode: "all",
  status: "recruiting",
  difficultyLevel: "all",
  minDifficulty: ASCENSION_LEVEL_MIN,
  maxDifficulty: ASCENSION_LEVEL_MAX,
  query: "",
};

export const defaultRoomInput: RoomInput = {
  title: "",
  branch: "stable",
  modMode: "none",
  modTags: [],
  difficultyLevel: 10,
  currentPlayers: ROOM_PLAYER_COUNT_MIN,
  maxPlayers: ROOM_PLAYER_COUNT_MAX,
  voiceLink: "",
  notes: "",
};

export const tutorialSections = [
  {
    title: "1. 先保存临时资料",
    body: "填写显示名和 Steam 好友码后才能创建房间。这里不做注册和密码，本机保存 token，过期或清除浏览器数据后重新填写即可。",
  },
  {
    title: "2. 创建房间后再发布",
    body: "新建房间先是草稿，不会出现在公共大厅。点击“发布信息”后进入招募中，修改房间会自动重新发布并重置 5 分钟倒计时。",
  },
  {
    title: "3. 看懂房间信息",
    body: "版本、Mod、进阶和人数必须和实际联机一致。进阶简称使用 a，例如 a10 表示进阶 10；当前人数和目标人数都限制在 1-4。",
  },
  {
    title: "4. 加好友和进语音",
    body: "房间左下角的房主按钮会直接复制 Steam 好友码；右下角的“语音”会直接打开房主填写的语音频道外链。",
  },
  {
    title: "5. 房间会自动过期",
    body: "发布后 5 分钟内不续期会转为游戏中，再过 5 分钟自动删除。人满或不再招募时，房主可以一键结束。",
  },
] as const;

export function getRoomSaveReminder(input: Pick<RoomInput, "modMode" | "voiceLink">, mode: "created" | "updated" | "published"): string {
  const reminders: string[] = [];

  if (mode === "created") {
    reminders.push("草稿不会出现在公共大厅，点击“发布信息”后其他玩家才能看到。");
  }
  if (mode === "updated") {
    reminders.push("修改已自动发布，并重置 5 分钟招募倒计时。");
  }
  if (mode === "published") {
    reminders.push("发布后 5 分钟内需要再次发布或修改来续期。");
  }

  reminders.push(
    input.voiceLink
      ? "语音频道会作为外链展示，请确认它是可直接加入且仍然有效的 http/https 链接。"
      : "未填写语音频道时，公共列表会显示“无语音”。",
  );

  if (input.modMode === "modded") {
    reminders.push("有 Mod 房间需要所有玩家安装相同 Mod。");
  }

  return reminders.join(" ");
}

export function filterRooms(rooms: Room[], filters: LobbyFilters): Room[] {
  const query = filters.query.trim().toLowerCase();
  return rooms.filter((room) => {
    if (filters.status !== "all" && room.status !== filters.status) return false;
    if (filters.branch !== "all" && room.branch !== filters.branch) return false;
    if (filters.modMode !== "all" && room.modMode !== filters.modMode) return false;
    if (filters.difficultyLevel !== "all" && room.difficultyLevel !== filters.difficultyLevel) return false;
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

export function getDifficultyLabel(room: Pick<Room, "difficultyLevel">): string {
  return `a${room.difficultyLevel}`;
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
    difficultyLevel: room.difficultyLevel,
    currentPlayers: room.currentPlayers,
    maxPlayers: room.maxPlayers,
    voiceLink: room.voiceLink,
    notes: room.notes,
  };
}
