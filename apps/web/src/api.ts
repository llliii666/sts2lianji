import type { Room, RoomInput, RoomResponse, RoomsResponse, SessionResponse, VisitorInput } from "@spire-lobby/shared";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(options.token ? { "x-visitor-token": options.token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string" ? payload.error.message : `请求失败：${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export const api = {
  restoreSession(token: string): Promise<SessionResponse> {
    return requestJson<SessionResponse>("/api/visitors/session", { token });
  },
  saveSession(input: VisitorInput): Promise<SessionResponse> {
    return requestJson<SessionResponse>("/api/visitors/session", { method: "POST", body: input });
  },
  listRooms(): Promise<RoomsResponse> {
    return requestJson<RoomsResponse>("/api/rooms");
  },
  getMyRoom(token: string): Promise<{ room: Room | null }> {
    return requestJson<{ room: Room | null }>("/api/rooms/mine", { token });
  },
  createRoom(token: string, input: RoomInput): Promise<RoomResponse> {
    return requestJson<RoomResponse>("/api/rooms", { method: "POST", token, body: input });
  },
  updateRoom(token: string, roomId: string, input: RoomInput): Promise<RoomResponse> {
    return requestJson<RoomResponse>(`/api/rooms/${roomId}`, { method: "PATCH", token, body: input });
  },
  publishRoom(token: string, roomId: string): Promise<RoomResponse> {
    return requestJson<RoomResponse>(`/api/rooms/${roomId}/publish`, { method: "POST", token, body: {} });
  },
  endRoom(token: string, roomId: string): Promise<{ ok: true }> {
    return requestJson<{ ok: true }>(`/api/rooms/${roomId}/end`, { method: "POST", token, body: {} });
  },
};

export function getSocketUrl(): string | undefined {
  return API_BASE || undefined;
}
