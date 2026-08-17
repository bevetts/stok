/*
 * Blake Command Center — data layer
 *
 * Same pattern as solace/data.js: a plain object holding whatever's been
 * loaded, plus pure functions that derive what the UI shows. All local
 * (non-Google) state lives under the `blake_command_*` localStorage
 * namespace — see shared/storage.js — so it can never collide with
 * Solace's `solace.*` keys or Solace's Supabase rows.
 */

const TASKS_KEY = "blake_command_tasks";
const LINKS_KEY = "blake_command_links";
const SESSION_KEY = "blake_command_session";

const commandData = {
  weather: null, // null until loaded; render code treats that as "unavailable"
  tasks: [],
  links: [],
  calendar: { status: "not_connected", events: [] }, // status: "not_connected" | "loading" | "connected" | "error"
  gmail: { status: "not_connected", unreadCount: null, importantUnreadCount: null, messages: [] },
  accounts: [], // connected Google accounts, e.g. [{ email, label }]
  accountErrors: [], // emails whose fetch failed this round (token revoked, etc.)
};

// Small fixed palette, cycled by connection order — good enough to tell
// two or three accounts apart at a glance without needing per-account
// color customization.
const ACCOUNT_COLORS = ["#a397e0", "#7fd8a0", "#e0a05a", "#e08a8a", "#8fb4e0"];

function accountColor(email) {
  const idx = commandData.accounts.findIndex((a) => a.email === email);
  return ACCOUNT_COLORS[idx >= 0 ? idx % ACCOUNT_COLORS.length : 0];
}

function accountLabel(email) {
  const account = commandData.accounts.find((a) => a.email === email);
  if (!account) return email || "";
  return account.label || (email || "").split("@")[0];
}

// ---------- tasks ----------

function loadTasks() {
  commandData.tasks = SharedStorage.read(TASKS_KEY, []);
}

function saveTasks() {
  SharedStorage.write(TASKS_KEY, commandData.tasks);
}

function addTask(title) {
  const trimmed = title.trim();
  if (!trimmed) return;
  commandData.tasks.unshift({
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: trimmed,
    done: false,
    createdAt: Date.now(),
  });
  saveTasks();
}

function toggleTask(id) {
  const task = commandData.tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? Date.now() : undefined;
  saveTasks();
}

function deleteTask(id) {
  commandData.tasks = commandData.tasks.filter((t) => t.id !== id);
  saveTasks();
}

function getOpenTasks() {
  return commandData.tasks.filter((t) => !t.done).sort((a, b) => b.createdAt - a.createdAt);
}

function getCompletedTasks() {
  return commandData.tasks
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
}

// ---------- quick launch links ----------

const DEFAULT_LINKS = [
  { id: "l_gmail", label: "Gmail", url: "https://mail.google.com/", emoji: "📧" },
  { id: "l_gcal", label: "Calendar", url: "https://calendar.google.com/", emoji: "📅" },
  { id: "l_github", label: "GitHub", url: "https://github.com/", emoji: "🐙" },
  { id: "l_supabase", label: "Supabase", url: "https://supabase.com/dashboard", emoji: "🟢" },
];

function loadLinks() {
  commandData.links = SharedStorage.read(LINKS_KEY, DEFAULT_LINKS);
}

function saveLinks() {
  SharedStorage.write(LINKS_KEY, commandData.links);
}

function addLink({ label, url, emoji }) {
  const trimmedLabel = (label || "").trim();
  const trimmedUrl = (url || "").trim();
  if (!trimmedLabel || !trimmedUrl) return;
  commandData.links.push({
    id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: trimmedLabel,
    url: /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`,
    emoji: (emoji || "").trim() || "🔗",
  });
  saveLinks();
}

function deleteLink(id) {
  commandData.links = commandData.links.filter((l) => l.id !== id);
  saveLinks();
}

// ---------- session (Google sign-in gate) ----------

function getSessionToken() {
  return SharedStorage.read(SESSION_KEY, null);
}

function setSessionToken(token) {
  SharedStorage.write(SESSION_KEY, token);
}

function clearSessionToken() {
  SharedStorage.remove(SESSION_KEY);
}

// ---------- derived: "Now" section ----------

// Only what Blake would actually need to act on — never a metric for its
// own sake. Each entry is { text, tone } where tone drives styling
// ("action" | "info" | "muted").
function getNowItems() {
  const items = [];

  const openTasks = getOpenTasks();
  if (openTasks.length) {
    items.push({ text: `${openTasks.length} open task${openTasks.length === 1 ? "" : "s"}`, tone: "action" });
  }

  if (commandData.calendar.status === "connected") {
    const next = commandData.calendar.events.find((e) => !e.isPast);
    if (next) {
      items.push({ text: `Next: ${next.title} at ${next.displayTime}`, tone: "action" });
    }
  } else if (commandData.calendar.status === "not_connected") {
    items.push({ text: "Calendar not connected", tone: "muted" });
  } else if (commandData.calendar.status === "error") {
    items.push({ text: "Calendar unavailable right now", tone: "muted" });
  }

  if (commandData.gmail.status === "connected") {
    // Raw unread count is noise on a real inbox (years of unread marketing
    // mail) — the starred/important count is the actual "needs a look"
    // signal, so that's what Now shows. The raw total still appears in the
    // Gmail panel itself for context.
    if (commandData.gmail.importantUnreadCount) {
      const n = commandData.gmail.importantUnreadCount;
      items.push({ text: `${n} flagged message${n === 1 ? "" : "s"} in Gmail`, tone: "action" });
    }
  } else if (commandData.gmail.status === "not_connected") {
    items.push({ text: "Gmail not connected", tone: "muted" });
  }

  if (!items.length) {
    items.push({ text: "Nothing pressing.", tone: "muted" });
  }

  return items;
}

function getDayPeriodCommand(hour) {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
