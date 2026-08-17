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
const DISMISSED_KEY = "blake_command_dismissed";

const commandData = {
  weather: null, // null until loaded; render code treats that as "unavailable"
  tasks: [],
  links: [],
  calendar: { status: "not_connected", events: [] }, // status: "not_connected" | "loading" | "connected" | "error"
  gmail: { status: "not_connected", unreadCount: null, importantUnreadCount: null, messages: [] },
  accounts: [], // connected Google accounts, e.g. [{ email, label }]
  accountErrors: [], // emails whose fetch failed this round (token revoked, etc.)
  tomorrow: null, // { title, displayTime, account } | null — first event tomorrow
  sports: [], // [{ team, line }] — line is null if that team's fetch failed
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

function getTasksCompletedThisWeek() {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return commandData.tasks.filter((t) => t.done && t.completedAt && t.completedAt >= weekAgo).length;
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

// ---------- dismissed Gmail attention items ----------
//
// "Dismiss" is deliberately simple: hide this one until Gmail's own state
// for it changes (read, archived, etc. — at which point it drops out of
// the fetch on its own). Not time-based snoozing, just "stop showing me
// this specific message." Capped so years of use can't grow this key
// without bound.
const MAX_DISMISSED = 300;

function loadDismissed() {
  return SharedStorage.read(DISMISSED_KEY, []);
}

function isDismissed(id) {
  return loadDismissed().includes(id);
}

function dismissMessage(id) {
  const dismissed = loadDismissed();
  if (dismissed.includes(id)) return;
  dismissed.push(id);
  while (dismissed.length > MAX_DISMISSED) dismissed.shift();
  SharedStorage.write(DISMISSED_KEY, dismissed);
  commandData.gmail.messages = commandData.gmail.messages.filter((m) => m.id !== id);
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
    const freeTime = getFreeTimeToday();
    if (freeTime) items.push({ text: freeTime, tone: "info" });
  } else if (commandData.calendar.status === "not_connected") {
    items.push({ text: "Calendar not connected", tone: "muted" });
  } else if (commandData.calendar.status === "error") {
    items.push({ text: "Calendar unavailable right now", tone: "muted" });
  }

  if (commandData.gmail.status === "connected") {
    // Neither raw count belongs here: total unread is noise on a real
    // inbox, and even the "important/starred" estimate compounds over
    // years of never-cleared mail into a number too big to act on. What's
    // actually actionable is the short, curated list the Gmail panel
    // already shows — so Now reflects that list's size, not a live count.
    if (commandData.gmail.messages.length) {
      const n = commandData.gmail.messages.length;
      items.push({ text: `${n} message${n === 1 ? "" : "s"} need a look in Gmail`, tone: "action" });
    }
  } else if (commandData.gmail.status === "not_connected") {
    items.push({ text: "Gmail not connected", tone: "muted" });
  }

  if (!items.length) {
    items.push({ text: "Nothing pressing.", tone: "muted" });
  }

  return items;
}

// Sums open gaps between meetings during a 9am-6pm window — a genuinely
// different signal than "here's the event list," costs nothing extra to
// compute since the calendar data is already fetched.
function getFreeTimeToday() {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(9, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(18, 0, 0, 0);
  if (now >= dayEnd) return null; // day's done — nothing meaningful left to report

  const windowStart = now > dayStart ? now : dayStart;
  const busyBlocks = commandData.calendar.events
    .filter((e) => !e.isAllDay)
    .map((e) => ({ start: new Date(e.start), end: new Date(e.end) }))
    .filter((b) => b.end > windowStart && b.start < dayEnd)
    .sort((a, b) => a.start - b.start);

  let cursor = windowStart;
  let freeMs = 0;
  busyBlocks.forEach((block) => {
    const blockStart = block.start < cursor ? cursor : block.start;
    if (blockStart > cursor) freeMs += blockStart - cursor;
    if (block.end > cursor) cursor = block.end;
  });
  if (cursor < dayEnd) freeMs += dayEnd - cursor;

  const totalMinutes = Math.round(freeMs / 60000);
  if (totalMinutes < 15) return null; // not worth a line for a few stray minutes

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const duration = hours === 0 ? `${minutes}m` : minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  return `${duration} free today`;
}

function getDayPeriodCommand(hour) {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
