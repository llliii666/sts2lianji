import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  ASCENSION_LEVEL_MAX,
  MAX_ACTIVE_ROOMS_PER_VISITOR,
  PLAYING_TTL_MS,
  RECRUITING_TTL_MS,
  ROOM_PLAYER_COUNT_MAX,
  ROOM_PLAYER_COUNT_MIN,
  Room,
  RoomInput,
  RoomStatus,
  VISITOR_TTL_MS,
  Visitor,
} from "@spire-lobby/shared";
import { HttpError } from "./errors.js";

type SqlValue = string | number | null;

interface VisitorRow {
  id: string;
  token: string;
  display_name: string;
  steam_friend_code: string;
  created_at: number;
  updated_at: number;
  expires_at: number;
}

interface RoomRow {
  id: string;
  host_visitor_id: string;
  display_name: string;
  steam_friend_code: string;
  title: string;
  branch: "stable" | "beta";
  mod_mode: "none" | "modded";
  mod_tags: string;
  difficulty_mode: "n" | "ascension";
  difficulty_level: number;
  current_players: number;
  max_players: number;
  voice_link: string;
  notes: string;
  status: RoomStatus;
  created_at: number;
  updated_at: number;
  last_published_at: number | null;
  recruiting_until: number | null;
  destroy_at: number | null;
}

export interface LifecycleSweepResult {
  statusChanged: Room[];
  deletedRoomIds: string[];
}

function toIso(value: number | null): string | null {
  return value == null ? null : new Date(value).toISOString();
}

function ensureParentDirectory(dbPath: string): void {
  if (dbPath === ":memory:") return;
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toVisitor(row: VisitorRow): Visitor {
  return {
    id: row.id,
    token: row.token,
    displayName: row.display_name,
    steamFriendCode: row.steam_friend_code,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    hostVisitorId: row.host_visitor_id,
    host: {
      displayName: row.display_name,
      steamFriendCode: row.steam_friend_code,
    },
    title: row.title,
    branch: row.branch,
    modMode: row.mod_mode,
    modTags: parseTags(row.mod_tags),
    difficultyLevel: row.difficulty_level,
    currentPlayers: row.current_players,
    maxPlayers: row.max_players,
    voiceLink: row.voice_link,
    notes: row.notes,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    lastPublishedAt: toIso(row.last_published_at),
    recruitingUntil: toIso(row.recruiting_until),
    destroyAt: toIso(row.destroy_at),
  };
}

export class LobbyRepository {
  private readonly db: DatabaseSync;

  constructor(
    dbPath: string,
    private readonly now: () => number,
  ) {
    ensureParentDirectory(dbPath);
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  createOrUpdateVisitor(input: { token?: string; displayName: string; steamFriendCode: string }): Visitor {
    const now = this.now();
    const expiresAt = now + VISITOR_TTL_MS;
    const existing = input.token ? this.getVisitorByToken(input.token) : null;

    if (existing) {
      this.db
        .prepare(
          `UPDATE visitors
             SET display_name = ?, steam_friend_code = ?, updated_at = ?, expires_at = ?
           WHERE id = ?`,
        )
        .run(input.displayName, input.steamFriendCode, now, expiresAt, existing.id);
      return this.requireVisitorById(existing.id);
    }

    const id = randomUUID();
    const token = randomUUID();
    this.db
      .prepare(
        `INSERT INTO visitors
          (id, token, display_name, steam_friend_code, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, token, input.displayName, input.steamFriendCode, now, now, expiresAt);
    return this.requireVisitorById(id);
  }

  getVisitorByToken(token: string): Visitor | null {
    const row = this.db
      .prepare("SELECT * FROM visitors WHERE token = ?")
      .get(token) as VisitorRow | undefined;
    if (!row) return null;
    if (row.expires_at <= this.now()) return null;
    return toVisitor(row);
  }

  requireVisitorByToken(token: string): Visitor {
    const visitor = this.getVisitorByToken(token);
    if (!visitor) {
      throw new HttpError(401, "登录已过期，请重新填写资料。", "SESSION_EXPIRED");
    }
    return visitor;
  }

  createRoom(hostVisitorId: string, input: RoomInput): Room {
    const activeCount = this.db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM rooms
          WHERE host_visitor_id = ?
            AND status IN ('draft', 'recruiting', 'playing')`,
      )
      .get(hostVisitorId) as { count: number };

    if (activeCount.count >= MAX_ACTIVE_ROOMS_PER_VISITOR) {
      throw new HttpError(409, "每个用户同时只能保留一个活跃房间。", "ACTIVE_ROOM_EXISTS");
    }

    const now = this.now();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO rooms
          (id, host_visitor_id, title, branch, mod_mode, mod_tags, difficulty_mode,
           difficulty_level, current_players, max_players, voice_link, notes, status,
           created_at, updated_at, last_published_at, recruiting_until, destroy_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL, NULL, NULL)`,
      )
      .run(...this.roomInsertValues(id, hostVisitorId, input, now));

    return this.requireRoomById(id);
  }

  updateRoom(roomId: string, hostVisitorId: string, input: RoomInput): Room {
    this.requireOwnedRoom(roomId, hostVisitorId);
    const now = this.now();
    const recruitingUntil = now + RECRUITING_TTL_MS;
    const destroyAt = recruitingUntil + PLAYING_TTL_MS;

    this.db
      .prepare(
        `UPDATE rooms
            SET title = ?, branch = ?, mod_mode = ?, mod_tags = ?, difficulty_mode = ?,
                difficulty_level = ?, current_players = ?, max_players = ?, voice_link = ?,
                notes = ?, status = 'recruiting', updated_at = ?, last_published_at = ?,
                recruiting_until = ?, destroy_at = ?
          WHERE id = ? AND host_visitor_id = ?`,
      )
      .run(...this.roomUpdateValues(input, now), now, recruitingUntil, destroyAt, roomId, hostVisitorId);

    return this.requireRoomById(roomId);
  }

  publishRoom(roomId: string, hostVisitorId: string): Room {
    this.requireOwnedRoom(roomId, hostVisitorId);
    const now = this.now();
    const recruitingUntil = now + RECRUITING_TTL_MS;
    const destroyAt = recruitingUntil + PLAYING_TTL_MS;

    this.db
      .prepare(
        `UPDATE rooms
            SET status = 'recruiting',
                updated_at = ?,
                last_published_at = ?,
                recruiting_until = ?,
                destroy_at = ?
          WHERE id = ? AND host_visitor_id = ?`,
      )
      .run(now, now, recruitingUntil, destroyAt, roomId, hostVisitorId);

    return this.requireRoomById(roomId);
  }

  deleteOwnedRoom(roomId: string, hostVisitorId: string): void {
    this.requireOwnedRoom(roomId, hostVisitorId);
    this.db.prepare("DELETE FROM rooms WHERE id = ? AND host_visitor_id = ?").run(roomId, hostVisitorId);
  }

  getOwnedRoom(hostVisitorId: string): Room | null {
    const row = this.db
      .prepare(`${this.roomSelectSql()} WHERE r.host_visitor_id = ? ORDER BY r.created_at DESC LIMIT 1`)
      .get(hostVisitorId) as RoomRow | undefined;
    return row ? toRoom(row) : null;
  }

  listPublicRooms(): Room[] {
    const rows = this.db
      .prepare(
        `${this.roomSelectSql()}
          WHERE r.status IN ('recruiting', 'playing')
          ORDER BY
            CASE r.status WHEN 'recruiting' THEN 0 ELSE 1 END,
            r.updated_at DESC`,
      )
      .all() as unknown as RoomRow[];
    return rows.map(toRoom);
  }

  requireRoomById(roomId: string): Room {
    const row = this.db.prepare(`${this.roomSelectSql()} WHERE r.id = ?`).get(roomId) as RoomRow | undefined;
    if (!row) throw new HttpError(404, "房间不存在。", "ROOM_NOT_FOUND");
    return toRoom(row);
  }

  sweepLifecycle(): LifecycleSweepResult {
    const now = this.now();
    const expiredRecruitingRows = this.db
      .prepare(
        `${this.roomSelectSql()}
          WHERE r.status = 'recruiting'
            AND r.recruiting_until IS NOT NULL
            AND r.recruiting_until <= ?`,
      )
      .all(now) as unknown as RoomRow[];

    this.db
      .prepare(
        `UPDATE rooms
            SET status = 'playing', updated_at = ?
          WHERE status = 'recruiting'
            AND recruiting_until IS NOT NULL
            AND recruiting_until <= ?`,
      )
      .run(now, now);

    const statusChanged = expiredRecruitingRows.map((row) => this.requireRoomById(row.id));

    const expiredPlayingRows = this.db
      .prepare(
        "SELECT id FROM rooms WHERE status = 'playing' AND destroy_at IS NOT NULL AND destroy_at <= ?",
      )
      .all(now) as { id: string }[];
    const visitorExpiredRoomRows = this.db
      .prepare(
        `SELECT r.id
           FROM rooms r
           JOIN visitors v ON v.id = r.host_visitor_id
          WHERE v.expires_at <= ?`,
      )
      .all(now) as { id: string }[];

    const deletedRoomIds = [...expiredPlayingRows, ...visitorExpiredRoomRows].map((row) => row.id);
    if (expiredPlayingRows.length > 0) {
      this.db
        .prepare("DELETE FROM rooms WHERE status = 'playing' AND destroy_at IS NOT NULL AND destroy_at <= ?")
        .run(now);
    }
    this.db.prepare("DELETE FROM visitors WHERE expires_at <= ?").run(now);

    return {
      statusChanged,
      deletedRoomIds: [...new Set(deletedRoomIds)],
    };
  }

  private requireVisitorById(visitorId: string): Visitor {
    const row = this.db.prepare("SELECT * FROM visitors WHERE id = ?").get(visitorId) as VisitorRow | undefined;
    if (!row) throw new HttpError(404, "用户不存在。", "VISITOR_NOT_FOUND");
    return toVisitor(row);
  }

  private requireOwnedRoom(roomId: string, hostVisitorId: string): Room {
    const row = this.db
      .prepare(`${this.roomSelectSql()} WHERE r.id = ? AND r.host_visitor_id = ?`)
      .get(roomId, hostVisitorId) as RoomRow | undefined;
    if (!row) {
      throw new HttpError(404, "房间不存在，或你不是房主。", "ROOM_NOT_OWNED");
    }
    return toRoom(row);
  }

  private roomInsertValues(id: string, hostVisitorId: string, input: RoomInput, now: number): SqlValue[] {
    return [
      id,
      hostVisitorId,
      input.title,
      input.branch,
      input.modMode,
      JSON.stringify(input.modTags),
      "ascension",
      input.difficultyLevel,
      input.currentPlayers,
      input.maxPlayers,
      input.voiceLink,
      input.notes,
      now,
      now,
    ];
  }

  private roomUpdateValues(input: RoomInput, now: number): SqlValue[] {
    return [
      input.title,
      input.branch,
      input.modMode,
      JSON.stringify(input.modTags),
      "ascension",
      input.difficultyLevel,
      input.currentPlayers,
      input.maxPlayers,
      input.voiceLink,
      input.notes,
      now,
    ];
  }

  private roomSelectSql(): string {
    return `SELECT
        r.id,
        r.host_visitor_id,
        v.display_name,
        v.steam_friend_code,
        r.title,
        r.branch,
        r.mod_mode,
        r.mod_tags,
        r.difficulty_mode,
        r.difficulty_level,
        r.current_players,
        r.max_players,
        r.voice_link,
        r.notes,
        r.status,
        r.created_at,
        r.updated_at,
        r.last_published_at,
        r.recruiting_until,
        r.destroy_at
      FROM rooms r
      JOIN visitors v ON v.id = r.host_visitor_id`;
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS visitors (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        steam_friend_code TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        host_visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        branch TEXT NOT NULL,
        mod_mode TEXT NOT NULL,
        mod_tags TEXT NOT NULL,
        difficulty_mode TEXT NOT NULL,
        difficulty_level INTEGER NOT NULL,
        current_players INTEGER NOT NULL,
        max_players INTEGER NOT NULL,
        voice_link TEXT NOT NULL,
        notes TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_published_at INTEGER,
        recruiting_until INTEGER,
        destroy_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_visitors_token ON visitors(token);
      CREATE INDEX IF NOT EXISTS idx_visitors_expires_at ON visitors(expires_at);
      CREATE INDEX IF NOT EXISTS idx_rooms_host ON rooms(host_visitor_id);
      CREATE INDEX IF NOT EXISTS idx_rooms_public_status ON rooms(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_rooms_lifecycle ON rooms(status, recruiting_until, destroy_at);
    `);
    this.db
      .prepare("UPDATE rooms SET difficulty_level = ? WHERE difficulty_level > ?")
      .run(ASCENSION_LEVEL_MAX, ASCENSION_LEVEL_MAX);
    this.db
      .prepare("UPDATE rooms SET max_players = ? WHERE max_players > ?")
      .run(ROOM_PLAYER_COUNT_MAX, ROOM_PLAYER_COUNT_MAX);
    this.db
      .prepare("UPDATE rooms SET max_players = ? WHERE max_players < ?")
      .run(ROOM_PLAYER_COUNT_MIN, ROOM_PLAYER_COUNT_MIN);
    this.db
      .prepare("UPDATE rooms SET current_players = max_players WHERE current_players > max_players")
      .run();
    this.db
      .prepare("UPDATE rooms SET current_players = ? WHERE current_players < ?")
      .run(ROOM_PLAYER_COUNT_MIN, ROOM_PLAYER_COUNT_MIN);
  }
}
