export const RECRUITING_TTL_MS = 5 * 60 * 1000;
export const PLAYING_TTL_MS = 5 * 60 * 1000;
export const VISITOR_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export const DISPLAY_NAME_MAX_LENGTH = 32;
export const STEAM_FRIEND_CODE_MAX_LENGTH = 40;
export const ROOM_TITLE_MAX_LENGTH = 48;
export const ROOM_NOTES_MAX_LENGTH = 240;
export const VOICE_LINK_MAX_LENGTH = 200;
export const MOD_TAG_MAX_LENGTH = 32;
export const MOD_TAG_LIMIT = 8;
export const MAX_ACTIVE_ROOMS_PER_VISITOR = 1;
export const ASCENSION_LEVEL_MIN = 0;
export const ASCENSION_LEVEL_MAX = 10;

export type GameBranch = "stable" | "beta";
export type ModMode = "none" | "modded";
export type RoomStatus = "draft" | "recruiting" | "playing" | "ended";

export interface Visitor {
  id: string;
  token: string;
  displayName: string;
  steamFriendCode: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface PublicVisitor {
  displayName: string;
  steamFriendCode: string;
}

export interface VisitorInput {
  displayName: string;
  steamFriendCode: string;
  token?: string;
}

export interface RoomInput {
  title: string;
  branch: GameBranch;
  modMode: ModMode;
  modTags: string[];
  difficultyLevel: number;
  currentPlayers: number;
  maxPlayers: number;
  voiceLink: string;
  notes: string;
}

export interface Room extends RoomInput {
  id: string;
  hostVisitorId: string;
  host: PublicVisitor;
  status: RoomStatus;
  createdAt: string;
  updatedAt: string;
  lastPublishedAt: string | null;
  recruitingUntil: string | null;
  destroyAt: string | null;
}

export interface ApiError {
  error: {
    message: string;
    code?: string;
  };
}

export interface SessionResponse {
  visitor: Visitor;
}

export interface RoomResponse {
  room: Room;
}

export interface RoomsResponse {
  rooms: Room[];
}

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainValidationError("请求内容必须是对象。");
  }
  return input as Record<string, unknown>;
}

function cleanString(value: unknown, fieldName: string, maxLength: number, required = true): string {
  if (typeof value !== "string") {
    if (!required && value == null) return "";
    throw new DomainValidationError(`${fieldName} 必须是文本。`);
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (required && normalized.length === 0) {
    throw new DomainValidationError(`${fieldName} 不能为空。`);
  }
  if (normalized.length > maxLength) {
    throw new DomainValidationError(`${fieldName} 最多 ${maxLength} 个字符。`);
  }
  return normalized;
}

function cleanNumber(value: unknown, fieldName: string, min: number, max: number): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    throw new DomainValidationError(`${fieldName} 必须是 ${min}-${max} 的整数。`);
  }
  return numberValue;
}

function cleanEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new DomainValidationError(`${fieldName} 的值无效。`);
  }
  return value as T;
}

export function normalizeVisitorInput(input: unknown): VisitorInput {
  const data = asObject(input);
  const token = typeof data.token === "string" && data.token.trim() ? data.token.trim() : undefined;

  return {
    displayName: cleanString(data.displayName, "显示名", DISPLAY_NAME_MAX_LENGTH),
    steamFriendCode: cleanString(data.steamFriendCode, "Steam 好友码", STEAM_FRIEND_CODE_MAX_LENGTH),
    token,
  };
}

export function normalizeRoomInput(input: unknown): RoomInput {
  const data = asObject(input);
  const currentPlayers = cleanNumber(data.currentPlayers, "当前人数", 1, 16);
  const maxPlayers = cleanNumber(data.maxPlayers, "目标人数", 1, 16);
  if (currentPlayers > maxPlayers) {
    throw new DomainValidationError("当前人数不能超过目标人数。");
  }

  const modTagsInput = Array.isArray(data.modTags)
    ? data.modTags
    : typeof data.modTags === "string"
      ? data.modTags.split(",")
      : [];

  const seenTags = new Set<string>();
  const modTags = modTagsInput
    .map((tag) => cleanString(tag, "Mod 标签", MOD_TAG_MAX_LENGTH, false))
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seenTags.has(key)) return false;
      seenTags.add(key);
      return true;
    })
    .slice(0, MOD_TAG_LIMIT);

  const voiceLink = cleanString(data.voiceLink ?? "", "语音链接", VOICE_LINK_MAX_LENGTH, false);
  if (voiceLink) {
    let parsed: URL;
    try {
      parsed = new URL(voiceLink);
    } catch {
      throw new DomainValidationError("语音链接必须是有效网址。");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new DomainValidationError("语音链接只允许 http:// 或 https://。");
    }
  }

  const modMode = cleanEnum(data.modMode, "Mod 模式", ["none", "modded"] as const);
  if (modMode === "none" && modTags.length > 0) {
    throw new DomainValidationError("无 Mod 房间不能填写 Mod 标签。");
  }

  return {
    title: cleanString(data.title, "房间名", ROOM_TITLE_MAX_LENGTH),
    branch: cleanEnum(data.branch, "版本", ["stable", "beta"] as const),
    modMode,
    modTags,
    difficultyLevel: cleanNumber(data.difficultyLevel, "难度等级", ASCENSION_LEVEL_MIN, ASCENSION_LEVEL_MAX),
    currentPlayers,
    maxPlayers,
    voiceLink,
    notes: cleanString(data.notes ?? "", "备注", ROOM_NOTES_MAX_LENGTH, false),
  };
}

export function getPublicDisplayName(visitor: Pick<Visitor, "displayName" | "steamFriendCode">): string {
  return `${visitor.displayName}(${visitor.steamFriendCode})`;
}

export function isRoomPublic(status: RoomStatus): boolean {
  return status === "recruiting" || status === "playing";
}
