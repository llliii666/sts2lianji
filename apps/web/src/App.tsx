import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleHelp,
  Copy,
  Edit3,
  LogOut,
  Plus,
  Radio,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { io } from "socket.io-client";
import { ASCENSION_LEVEL_MAX, ASCENSION_LEVEL_MIN, ROOM_PLAYER_COUNT_MAX, ROOM_PLAYER_COUNT_MIN } from "@spire-lobby/shared";
import type { Room, RoomInput, RoomsResponse, Visitor } from "@spire-lobby/shared";
import { api, getSocketUrl } from "./api.js";
import {
  defaultFilters,
  defaultRoomInput,
  filterRooms,
  formatRemaining,
  getBranchLabel,
  getCountdownTarget,
  getDifficultyLabel,
  getModModeLabel,
  getRoomSaveReminder,
  getStatusLabel,
  roomToInput,
  tutorialSections,
  type LobbyFilters,
} from "./lobby.js";

const STORAGE_KEY = "spire-lobby-session";
const TUTORIAL_STORAGE_KEY = "spire-lobby-tutorial-seen-v1";

type ToastTone = "success" | "info" | "warning" | "error";

interface ToastMessage {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface StoredSession {
  token: string;
  displayName: string;
  steamFriendCode: string;
}

function readStoredSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

function writeStoredSession(visitor: Visitor): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: visitor.token,
      displayName: visitor.displayName,
      steamFriendCode: visitor.steamFriendCode,
    }),
  );
}

function hasSeenTutorial(): boolean {
  return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "1";
}

function markTutorialSeen(): void {
  localStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
}

function ToastNotice({ toast, leaving, onClose }: { toast: ToastMessage; leaving: boolean; onClose: () => void }) {
  return (
    <div className={`toast toast-${toast.tone} ${leaving ? "toast-leaving" : ""}`} role="status" aria-live="polite">
      <div>
        <strong>{toast.title}</strong>
        {toast.body && <p>{toast.body}</p>}
      </div>
      <button className="toast-close" type="button" onClick={onClose} aria-label="关闭提醒">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

interface ProfileDialogProps {
  initial?: Partial<StoredSession>;
  saving?: boolean;
  onSubmit: (input: { displayName: string; steamFriendCode: string }) => void;
}

export function ProfileDialog({ initial, saving = false, onSubmit }: ProfileDialogProps) {
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [steamFriendCode, setSteamFriendCode] = useState(initial?.steamFriendCode ?? "");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <form
        className="modal profile-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ displayName, steamFriendCode });
        }}
      >
        <div className="modal-header">
          <div>
            <h2 id="profile-title">临时资料</h2>
            <p>资料会展示给大厅里的其他玩家。</p>
          </div>
          <UserRound aria-hidden="true" />
        </div>
        <label>
          显示名
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoFocus />
        </label>
        <label>
          Steam 好友码
          <input value={steamFriendCode} onChange={(event) => setSteamFriendCode(event.target.value)} />
        </label>
        <button className="primary-button" type="submit" disabled={saving}>
          <Check size={16} aria-hidden="true" />
          保存
        </button>
      </form>
    </div>
  );
}

export function TutorialDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <section className="modal tutorial-modal">
        <div className="modal-header">
          <div>
            <h2 id="tutorial-title">快速使用教程</h2>
            <p>第一次登录自动显示，之后可从右上角“教程”重新打开。</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭教程">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="tutorial-list">
          {tutorialSections.map((section) => (
            <article className="tutorial-item" key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
        <div className="modal-actions">
          <button className="primary-button" type="button" onClick={onClose}>
            <Check size={16} aria-hidden="true" />
            我知道了
          </button>
        </div>
      </section>
    </div>
  );
}

interface RoomFormProps {
  initial?: RoomInput;
  title: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (input: RoomInput) => void;
}

function RoomForm({ initial = defaultRoomInput, title, submitLabel, onCancel, onSubmit }: RoomFormProps) {
  const [value, setValue] = useState<RoomInput>(initial);
  const [modTagsText, setModTagsText] = useState(initial.modTags.join(", "));
  const [voiceMode, setVoiceMode] = useState<"none" | "link">(initial.voiceLink ? "link" : "none");

  function update<K extends keyof RoomInput>(key: K, nextValue: RoomInput[K]) {
    setValue((current) => ({ ...current, [key]: nextValue }));
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="room-form-title">
      <form
        className="modal room-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            ...value,
            modTags: value.modMode === "modded" ? modTagsText.split(",").map((tag) => tag.trim()) : [],
            voiceLink: voiceMode === "link" ? value.voiceLink : "",
          });
        }}
      >
        <div className="modal-header">
          <h2 id="room-form-title">{title}</h2>
          <button className="icon-button" type="button" onClick={onCancel} aria-label="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="form-grid">
          <label className="span-2">
            房间名
            <input value={value.title} onChange={(event) => update("title", event.target.value)} placeholder="可留空" />
          </label>
          <label>
            版本
            <select value={value.branch} onChange={(event) => update("branch", event.target.value as RoomInput["branch"])}>
              <option value="stable">正式版</option>
              <option value="beta">Beta版</option>
            </select>
          </label>
          <label>
            Mod
            <select value={value.modMode} onChange={(event) => update("modMode", event.target.value as RoomInput["modMode"])}>
              <option value="none">无Mod</option>
              <option value="modded">有Mod</option>
            </select>
          </label>
          <label className="span-2">
            Mod 标签
            <input
              value={modTagsText}
              onChange={(event) => setModTagsText(event.target.value)}
              disabled={value.modMode === "none"}
              placeholder="Downfall, Together"
            />
          </label>
          <label>
            进阶等级(a)
            <input
              type="number"
              min={ASCENSION_LEVEL_MIN}
              max={ASCENSION_LEVEL_MAX}
              value={value.difficultyLevel}
              onChange={(event) => update("difficultyLevel", Number(event.target.value))}
            />
          </label>
          <label>
            当前人数
            <input
              type="number"
              min={ROOM_PLAYER_COUNT_MIN}
              max={ROOM_PLAYER_COUNT_MAX}
              value={value.currentPlayers}
              onChange={(event) => update("currentPlayers", Number(event.target.value))}
            />
          </label>
          <label>
            目标人数
            <input
              type="number"
              min={ROOM_PLAYER_COUNT_MIN}
              max={ROOM_PLAYER_COUNT_MAX}
              value={value.maxPlayers}
              onChange={(event) => update("maxPlayers", Number(event.target.value))}
            />
          </label>
          <label>
            语音频道
            <select
              value={voiceMode}
              onChange={(event) => {
                const nextMode = event.target.value as "none" | "link";
                setVoiceMode(nextMode);
                if (nextMode === "none") update("voiceLink", "");
              }}
            >
              <option value="none">无</option>
              <option value="link">有链接</option>
            </select>
          </label>
          {voiceMode === "link" && (
            <label>
              语音链接
              <input value={value.voiceLink} onChange={(event) => update("voiceLink", event.target.value)} />
            </label>
          )}
          <label className="span-2">
            备注
            <textarea value={value.notes} onChange={(event) => update("notes", event.target.value)} rows={3} />
          </label>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-button" type="submit">
            <Save size={16} aria-hidden="true" />
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function Countdown({ room, now }: { room: Room; now: number }) {
  const target = getCountdownTarget(room);
  if (!target) return <span className="countdown muted">--:--</span>;
  return <span className="countdown">{formatRemaining(target, now)}</span>;
}

function RoomCard({
  room,
  now,
  owned = false,
  onCopy,
  onVoiceOpen,
}: {
  room: Room;
  now: number;
  owned?: boolean;
  onCopy: () => void;
  onVoiceOpen?: () => void;
}) {
  return (
    <article className={`room-card status-${room.status}`}>
      <div className="room-card-top">
        <div>
          <h3>{room.title || "未命名房间"}</h3>
          <div className="room-meta">
            <span>{getBranchLabel(room.branch)}</span>
            <span>{getModModeLabel(room.modMode)}</span>
            <span>{getDifficultyLabel(room)}</span>
            <span>
              {room.currentPlayers}/{room.maxPlayers}
            </span>
          </div>
        </div>
        <div className="status-stack">
          <span className={`status-pill ${room.status}`}>{getStatusLabel(room.status)}</span>
          <Countdown room={room} now={now} />
        </div>
      </div>

      {room.modTags.length > 0 && (
        <div className="tag-row">
          {room.modTags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {room.notes && <p className="notes">{room.notes}</p>}

      <div className="room-footer">
        <div className="room-footer-left">
          <button className="copy-button" type="button" onClick={onCopy} title="复制房主 Steam 好友码">
            <Copy size={15} aria-hidden="true" />
            {room.host.displayName}({room.host.steamFriendCode})
          </button>
        </div>
        <div className="room-footer-right">
          {room.voiceLink && (
            <a
              href={room.voiceLink}
              target="_blank"
              rel="noreferrer"
              className="voice-link"
              onClick={onVoiceOpen}
              title="打开语音频道外链"
            >
              <Radio size={15} aria-hidden="true" />
              语音
            </a>
          )}
          {!room.voiceLink && (
            <span className="voice-none">
              <Radio size={15} aria-hidden="true" />
              无语音
            </span>
          )}
          {owned && <span className="owner-mark">我的房间</span>}
        </div>
      </div>
    </article>
  );
}

function Filters({ filters, onChange }: { filters: LobbyFilters; onChange: (filters: LobbyFilters) => void }) {
  const set = <K extends keyof LobbyFilters>(key: K, value: LobbyFilters[K]) => onChange({ ...filters, [key]: value });

  return (
    <section className="filters" aria-label="房间筛选">
      <label className="search-field">
        <Search size={16} aria-hidden="true" />
        <input value={filters.query} onChange={(event) => set("query", event.target.value)} placeholder="搜索房名、备注、Mod" />
      </label>
      <select value={filters.status} onChange={(event) => set("status", event.target.value as LobbyFilters["status"])}>
        <option value="recruiting">招募中</option>
        <option value="playing">游戏中</option>
        <option value="all">全部状态</option>
      </select>
      <select value={filters.branch} onChange={(event) => set("branch", event.target.value as LobbyFilters["branch"])}>
        <option value="all">全部版本</option>
        <option value="stable">正式版</option>
        <option value="beta">Beta版</option>
      </select>
      <select value={filters.modMode} onChange={(event) => set("modMode", event.target.value as LobbyFilters["modMode"])}>
        <option value="all">全部Mod</option>
        <option value="none">无Mod</option>
        <option value="modded">有Mod</option>
      </select>
      <select
        value={filters.difficultyLevel}
        onChange={(event) => {
          const nextValue = event.target.value;
          set("difficultyLevel", nextValue === "all" ? "all" : Number(nextValue));
        }}
      >
        <option value="all">全部进阶</option>
        {Array.from({ length: ASCENSION_LEVEL_MAX - ASCENSION_LEVEL_MIN + 1 }, (_, offset) => {
          const index = ASCENSION_LEVEL_MIN + offset;
          return (
            <option value={index} key={index}>
              a{index}
            </option>
          );
        })}
      </select>
    </section>
  );
}

export function App() {
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [myRoom, setMyRoom] = useState<Room | null>(null);
  const [filters, setFilters] = useState<LobbyFilters>(defaultFilters);
  const [profileOpen, setProfileOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [roomFormMode, setRoomFormMode] = useState<"create" | "edit" | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  const token = visitor?.token;
  const visibleRooms = useMemo(() => filterRooms(rooms, filters), [rooms, filters]);

  async function refreshMine(activeToken = token) {
    if (!activeToken) return;
    const response = await api.getMyRoom(activeToken);
    setMyRoom(response.room);
  }

  async function refreshRooms() {
    const response = await api.listRooms();
    setRooms(response.rooms);
  }

  function showToast(tone: ToastTone, title: string, body?: string) {
    setToastLeaving(false);
    setToast({ id: Date.now(), tone, title, body });
  }

  function dismissToast() {
    setToastLeaving(true);
    window.setTimeout(() => setToast(null), 240);
  }

  function openTutorialIfNeeded() {
    if (!hasSeenTutorial()) setTutorialOpen(true);
  }

  function closeTutorial() {
    markTutorialSeen();
    setTutorialOpen(false);
  }

  useEffect(() => {
    if (!toast) return;
    setToastLeaving(false);
    const fadeTimer = window.setTimeout(() => setToastLeaving(true), 4_800);
    const removeTimer = window.setTimeout(() => setToast(null), 5_100);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [toast?.id]);

  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) {
      setProfileOpen(true);
      void refreshRooms();
      return;
    }

    api
      .restoreSession(stored.token)
      .then(async (response) => {
        setVisitor(response.visitor);
        writeStoredSession(response.visitor);
        await Promise.all([refreshRooms(), refreshMine(response.visitor.token)]);
        openTutorialIfNeeded();
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setProfileOpen(true);
        return refreshRooms();
      });
  }, []);

  useEffect(() => {
    const socket = io(getSocketUrl(), { transports: ["websocket", "polling"] });
    socket.on("rooms:snapshot", (payload: RoomsResponse) => setRooms(payload.rooms));
    socket.on("room:published", () => void refreshMine());
    socket.on("room:updated", () => void refreshMine());
    socket.on("room:statusChanged", () => void refreshMine());
    socket.on("room:deleted", () => void refreshMine());
    return () => {
      socket.close();
    };
  }, [token]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  async function handleProfileSave(input: { displayName: string; steamFriendCode: string }) {
    setBusy(true);
    try {
      const response = await api.saveSession({ ...input, token: visitor?.token ?? readStoredSession()?.token });
      setVisitor(response.visitor);
      writeStoredSession(response.visitor);
      setProfileOpen(false);
      await refreshMine(response.visitor.token);
      showToast("success", "临时资料已保存", "房间左下角复制按钮可复制房主 Steam 好友码。");
      openTutorialIfNeeded();
    } catch (error) {
      showToast("error", "保存失败", error instanceof Error ? error.message : "请检查显示名和 Steam 好友码。");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateRoom(input: RoomInput) {
    if (!token) return setProfileOpen(true);
    setBusy(true);
    try {
      const response = await api.createRoom(token, input);
      setMyRoom(response.room);
      setRoomFormMode(null);
      showToast("success", "草稿已保存", getRoomSaveReminder(input, "created"));
    } catch (error) {
      showToast("error", "创建失败", error instanceof Error ? error.message : "请检查房间信息。");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateRoom(input: RoomInput) {
    if (!token || !myRoom) return;
    setBusy(true);
    try {
      const response = await api.updateRoom(token, myRoom.id, input);
      setMyRoom(response.room);
      setRoomFormMode(null);
      showToast("success", "房间已更新并发布", getRoomSaveReminder(input, "updated"));
    } catch (error) {
      showToast("error", "更新失败", error instanceof Error ? error.message : "请检查房间信息。");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishRoom() {
    if (!token || !myRoom) return;
    setBusy(true);
    try {
      const response = await api.publishRoom(token, myRoom.id);
      setMyRoom(response.room);
      showToast("success", "房间已发布", getRoomSaveReminder(response.room, "published"));
    } catch (error) {
      showToast("error", "发布失败", error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function handleEndRoom() {
    if (!token || !myRoom) return;
    setBusy(true);
    try {
      await api.endRoom(token, myRoom.id);
      setMyRoom(null);
      showToast("success", "房间已结束", "公共大厅中的房间信息已同步删除。");
    } catch (error) {
      showToast("error", "结束失败", error instanceof Error ? error.message : "请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function copyFriendCode(room: Room) {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(room.host.steamFriendCode);
      showToast("success", "已复制 Steam 好友码", `${room.host.displayName}: ${room.host.steamFriendCode}`);
    } catch {
      showToast("error", "复制失败", "浏览器未允许剪贴板访问，请手动复制房主好友码。");
    }
  }

  function handleVoiceOpen(room: Room) {
    showToast("info", "正在打开语音频道", "语音频道是房主提供的外部链接，请确认来源可信。");
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setVisitor(null);
    setMyRoom(null);
    setProfileOpen(true);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>杀戮尖塔2 联机大厅</h1>
          <p>实时房间 · 版本/Mod/难度筛选 · 房主续期</p>
        </div>
        <div className="topbar-actions">
          <button className="secondary-button" type="button" onClick={() => setTutorialOpen(true)}>
            <CircleHelp size={16} aria-hidden="true" />
            教程
          </button>
          {visitor && (
            <button className="secondary-button" type="button" onClick={() => setProfileOpen(true)}>
              <UserRound size={16} aria-hidden="true" />
              {visitor.displayName}
            </button>
          )}
          {visitor && (
            <button className="icon-button" type="button" onClick={logout} aria-label="清除本机临时身份">
              <LogOut size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {toast && <ToastNotice toast={toast} leaving={toastLeaving} onClose={dismissToast} />}

      <section className="owner-panel">
        <div className="owner-panel-head">
          <div>
            <h2>房主控制</h2>
            <p>{visitor ? `${visitor.displayName}(${visitor.steamFriendCode})` : "未填写资料"}</p>
          </div>
          <button className="primary-button" type="button" disabled={!visitor || !!myRoom || busy} onClick={() => setRoomFormMode("create")}>
            <Plus size={16} aria-hidden="true" />
            创建房间
          </button>
        </div>

        {myRoom ? (
          <div className="owner-room-grid">
            <RoomCard
              room={myRoom}
              now={now}
              owned
              onCopy={() => void copyFriendCode(myRoom)}
              onVoiceOpen={() => handleVoiceOpen(myRoom)}
            />
            <div className="owner-actions">
              <button className="primary-button" type="button" disabled={busy} onClick={handlePublishRoom}>
                <Send size={16} aria-hidden="true" />
                发布信息
              </button>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => setRoomFormMode("edit")}>
                <Edit3 size={16} aria-hidden="true" />
                修改
              </button>
              <button className="danger-button" type="button" disabled={busy} onClick={handleEndRoom}>
                <Trash2 size={16} aria-hidden="true" />
                结束
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-owner">
            <span>当前没有活跃房间。</span>
          </div>
        )}
      </section>

      <Filters filters={filters} onChange={setFilters} />

      <section className="lobby-head">
        <div>
          <h2>公共大厅</h2>
          <p>{visibleRooms.length} 个匹配房间</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void refreshRooms()}>
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
      </section>

      <section className="room-list" aria-live="polite">
        {visibleRooms.length > 0 ? (
          visibleRooms.map((room) => (
            <RoomCard
              room={room}
              now={now}
              key={room.id}
              onCopy={() => void copyFriendCode(room)}
              onVoiceOpen={() => handleVoiceOpen(room)}
            />
          ))
        ) : (
          <div className="empty-list">没有匹配房间。</div>
        )}
      </section>

      {tutorialOpen && <TutorialDialog onClose={closeTutorial} />}
      {profileOpen && <ProfileDialog initial={readStoredSession() ?? undefined} saving={busy} onSubmit={handleProfileSave} />}
      {roomFormMode === "create" && (
        <RoomForm title="创建房间" submitLabel="保存草稿" onCancel={() => setRoomFormMode(null)} onSubmit={handleCreateRoom} />
      )}
      {roomFormMode === "edit" && myRoom && (
        <RoomForm
          title="修改房间"
          submitLabel="保存并发布"
          initial={roomToInput(myRoom)}
          onCancel={() => setRoomFormMode(null)}
          onSubmit={handleUpdateRoom}
        />
      )}
    </main>
  );
}
