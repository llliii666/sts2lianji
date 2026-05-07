import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PLAYING_TTL_MS, RECRUITING_TTL_MS, RoomInput, SessionResponse, VISITOR_TTL_MS } from "@spire-lobby/shared";
import { createApp } from "../src/app.js";

const baseRoomInput: RoomInput = {
  title: "N10 三缺一",
  branch: "beta",
  modMode: "modded",
  modTags: ["Together"],
  difficultyMode: "n",
  difficultyLevel: 10,
  currentPlayers: 3,
  maxPlayers: 4,
  voiceLink: "https://example.com/voice",
  notes: "需要同 Mod",
};

describe("server room lifecycle", () => {
  let now = Date.parse("2026-05-08T00:00:00.000Z");
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeEach(async () => {
    now = Date.parse("2026-05-08T00:00:00.000Z");
    app = await createApp({
      databasePath: ":memory:",
      now: () => now,
      lifecycleIntervalMs: null,
      webDistDir: undefined,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createVisitor(name = "阿鲸") {
    const response = await app.inject({
      method: "POST",
      url: "/api/visitors/session",
      payload: { displayName: name, steamFriendCode: `${name}-123456` },
    });
    expect(response.statusCode).toBe(200);
    return response.json<SessionResponse>().visitor;
  }

  async function createDraft(token: string, input = baseRoomInput) {
    const response = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { "x-visitor-token": token },
      payload: input,
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ room: { id: string; status: string } }>().room;
  }

  async function publish(token: string, roomId: string) {
    const response = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/publish`,
      headers: { "x-visitor-token": token },
    });
    expect(response.statusCode).toBe(200);
    return response.json<{ room: { status: string; recruitingUntil: string; destroyAt: string } }>().room;
  }

  it("creates visitors with a three-day expiry", async () => {
    const visitor = await createVisitor();
    expect(Date.parse(visitor.expiresAt) - now).toBe(VISITOR_TTL_MS);
  });

  it("keeps draft rooms out of the public lobby", async () => {
    const visitor = await createVisitor();
    await createDraft(visitor.token);

    const response = await app.inject({ method: "GET", url: "/api/rooms" });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ rooms: unknown[] }>().rooms).toEqual([]);
  });

  it("moves rooms from recruiting to playing, then deletes them", async () => {
    const visitor = await createVisitor();
    const draft = await createDraft(visitor.token);
    await publish(visitor.token, draft.id);

    let publicRooms = (await app.inject({ method: "GET", url: "/api/rooms" })).json<{ rooms: { status: string }[] }>().rooms;
    expect(publicRooms).toHaveLength(1);
    expect(publicRooms[0].status).toBe("recruiting");

    now += RECRUITING_TTL_MS + 1;
    app.lobby.runLifecycleSweep();
    publicRooms = (await app.inject({ method: "GET", url: "/api/rooms" })).json<{ rooms: { status: string }[] }>().rooms;
    expect(publicRooms).toHaveLength(1);
    expect(publicRooms[0].status).toBe("playing");

    now += PLAYING_TTL_MS + 1;
    app.lobby.runLifecycleSweep();
    publicRooms = (await app.inject({ method: "GET", url: "/api/rooms" })).json<{ rooms: { status: string }[] }>().rooms;
    expect(publicRooms).toEqual([]);
  });

  it("auto-publishes edits and resets the recruiting timer", async () => {
    const visitor = await createVisitor();
    const draft = await createDraft(visitor.token);
    const published = await publish(visitor.token, draft.id);

    now += 120_000;
    const response = await app.inject({
      method: "PATCH",
      url: `/api/rooms/${draft.id}`,
      headers: { "x-visitor-token": visitor.token },
      payload: { ...baseRoomInput, currentPlayers: 4 },
    });

    expect(response.statusCode).toBe(200);
    const updated = response.json<{ room: { status: string; currentPlayers: number; recruitingUntil: string } }>().room;
    expect(updated.status).toBe("recruiting");
    expect(updated.currentPlayers).toBe(4);
    expect(Date.parse(updated.recruitingUntil)).toBeGreaterThan(Date.parse(published.recruitingUntil));
  });

  it("rejects updates from non-host visitors", async () => {
    const host = await createVisitor("房主");
    const stranger = await createVisitor("路人");
    const draft = await createDraft(host.token);

    const response = await app.inject({
      method: "PATCH",
      url: `/api/rooms/${draft.id}`,
      headers: { "x-visitor-token": stranger.token },
      payload: baseRoomInput,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: { code: string } }>().error.code).toBe("ROOM_NOT_OWNED");
  });
});
