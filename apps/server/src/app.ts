import fs from "node:fs";
import path from "node:path";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Server as SocketServer } from "socket.io";
import {
  normalizeRoomInput,
  normalizeVisitorInput,
  Room,
  RoomsResponse,
  SessionResponse,
} from "@spire-lobby/shared";
import { HttpError, toHttpError } from "./errors.js";
import { MemoryRateLimiter } from "./rateLimit.js";
import { LobbyRepository } from "./repository.js";

export interface CreateAppOptions {
  databasePath: string;
  publicOrigin?: string;
  webDistDir?: string;
  now?: () => number;
  lifecycleIntervalMs?: number | null;
  logger?: boolean;
}

type AppWithInternals = FastifyInstance & {
  lobby: {
    repo: LobbyRepository;
    runLifecycleSweep: () => void;
  };
};

function getToken(request: FastifyRequest): string {
  const raw = request.headers["x-visitor-token"];
  if (typeof raw !== "string" || !raw.trim()) {
    throw new HttpError(401, "缺少访客 token。", "TOKEN_REQUIRED");
  }
  return raw.trim();
}

function sendError(reply: FastifyReply, error: unknown): void {
  const httpError = toHttpError(error);
  reply.code(httpError.statusCode).send({
    error: {
      message: httpError.message,
      code: httpError.code,
    },
  });
}

export async function createApp(options: CreateAppOptions): Promise<AppWithInternals> {
  const now = options.now ?? Date.now;
  const app = Fastify({ logger: options.logger ?? false }) as unknown as AppWithInternals;
  const repo = new LobbyRepository(options.databasePath, now);
  const limiter = new MemoryRateLimiter(now);
  const publicOrigin = options.publicOrigin ?? "http://localhost:5173";
  const io = new SocketServer(app.server, {
    cors: {
      origin: publicOrigin === "*" ? "*" : [publicOrigin],
    },
  });

  await app.register(cors, {
    origin: true,
  });

  function broadcastSnapshot(): void {
    const payload: RoomsResponse = { rooms: repo.listPublicRooms() };
    io.emit("rooms:snapshot", payload);
  }

  function emitRoomEvent(event: string, room: Room): void {
    io.emit(event, { room });
    broadcastSnapshot();
  }

  function runLifecycleSweep(): void {
    const result = repo.sweepLifecycle();
    for (const room of result.statusChanged) {
      io.emit("room:statusChanged", { room });
    }
    for (const roomId of result.deletedRoomIds) {
      io.emit("room:deleted", { roomId });
    }
    if (result.statusChanged.length > 0 || result.deletedRoomIds.length > 0) {
      broadcastSnapshot();
    }
    limiter.prune();
  }

  const lifecycleTimer =
    options.lifecycleIntervalMs === null
      ? null
      : setInterval(runLifecycleSweep, options.lifecycleIntervalMs ?? 30_000);

  app.decorate("lobby", {
    repo,
    runLifecycleSweep,
  });

  app.addHook("onClose", async () => {
    if (lifecycleTimer) clearInterval(lifecycleTimer);
    await io.close();
    repo.close();
  });

  io.on("connection", (socket) => {
    socket.emit("rooms:snapshot", { rooms: repo.listPublicRooms() } satisfies RoomsResponse);
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/visitors/session", async (request, reply) => {
    try {
      const visitor = repo.requireVisitorByToken(getToken(request));
      return { visitor } satisfies SessionResponse;
    } catch (error) {
      sendError(reply, error);
    }
  });

  app.post("/api/visitors/session", async (request, reply) => {
    try {
      limiter.hit(`session:${request.ip}`, 20, 60_000);
      const input = normalizeVisitorInput(request.body);
      const visitor = repo.createOrUpdateVisitor(input);
      return { visitor } satisfies SessionResponse;
    } catch (error) {
      sendError(reply, error);
    }
  });

  app.get("/api/rooms", async () => {
    runLifecycleSweep();
    return { rooms: repo.listPublicRooms() } satisfies RoomsResponse;
  });

  app.get("/api/rooms/mine", async (request, reply) => {
    try {
      runLifecycleSweep();
      const visitor = repo.requireVisitorByToken(getToken(request));
      return { room: repo.getOwnedRoom(visitor.id) };
    } catch (error) {
      sendError(reply, error);
    }
  });

  app.post("/api/rooms", async (request, reply) => {
    try {
      limiter.hit(`room:create:${request.ip}`, 8, 60_000);
      const visitor = repo.requireVisitorByToken(getToken(request));
      const input = normalizeRoomInput(request.body);
      const room = repo.createRoom(visitor.id, input);
      reply.code(201);
      return { room };
    } catch (error) {
      sendError(reply, error);
    }
  });

  app.patch("/api/rooms/:id", async (request, reply) => {
    try {
      limiter.hit(`room:update:${request.ip}`, 30, 60_000);
      const visitor = repo.requireVisitorByToken(getToken(request));
      const input = normalizeRoomInput(request.body);
      const room = repo.updateRoom((request.params as { id: string }).id, visitor.id, input);
      emitRoomEvent("room:updated", room);
      return { room };
    } catch (error) {
      sendError(reply, error);
    }
  });

  app.post("/api/rooms/:id/publish", async (request, reply) => {
    try {
      limiter.hit(`room:publish:${request.ip}`, 30, 60_000);
      const visitor = repo.requireVisitorByToken(getToken(request));
      const room = repo.publishRoom((request.params as { id: string }).id, visitor.id);
      emitRoomEvent("room:published", room);
      return { room };
    } catch (error) {
      sendError(reply, error);
    }
  });

  app.post("/api/rooms/:id/end", async (request, reply) => {
    try {
      const visitor = repo.requireVisitorByToken(getToken(request));
      const roomId = (request.params as { id: string }).id;
      repo.deleteOwnedRoom(roomId, visitor.id);
      io.emit("room:deleted", { roomId });
      broadcastSnapshot();
      return { ok: true };
    } catch (error) {
      sendError(reply, error);
    }
  });

  if (options.webDistDir && fs.existsSync(options.webDistDir)) {
    await app.register(fastifyStatic, {
      root: options.webDistDir,
      prefix: "/",
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.code(404).send({ error: { message: "接口不存在。", code: "NOT_FOUND" } });
        return;
      }
      reply.sendFile("index.html");
    });
  } else {
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        reply.code(404).send({ error: { message: "接口不存在。", code: "NOT_FOUND" } });
        return;
      }
      reply.code(404).send({
        error: {
          message: `前端构建目录不存在：${path.resolve(options.webDistDir ?? "")}`,
          code: "WEB_DIST_NOT_FOUND",
        },
      });
    });
  }

  return app;
}
