(function () {
  "use strict";

  const SUPABASE_URL = "https://pftwellkloafqbpnhpyt.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmdHdlbGxrbG9hZnFicG5ocHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAyMTMwOTAsImV4cCI6MjA1NTc4OTA5MH0.Gu5F-2uRQ6Bi43M858-wVp4xiS6YKRasCnWO-nr5nQc";
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------- Google OAuth config ----------
  // GOOGLE_CLIENT_ID is intentionally blank until it's provided — the
  // Client ID itself is not secret (it's the public half of an OAuth
  // client, same as any "Sign in with Google" button on the web), but the
  // Client Secret must never live here. That stays server-side as a
  // Supabase Edge Function secret, used only by blake-google-oauth.
  // Public half of the OAuth client — safe to embed client-side, same as
  // any "Sign in with Google" button. The Client Secret never appears
  // here; it's a Supabase Edge Function secret used only server-side by
  // blake-google-oauth.
  const GOOGLE_CLIENT_ID = "921973644869-b87gk6jtlngdhc3ev823uaqfe5snf9pp.apps.googleusercontent.com";
  const GOOGLE_REDIRECT_URI = `${SUPABASE_URL}/functions/v1/blake-google-oauth/callback`;
  const GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
    "email",
  ].join(" ");
  const GOOGLE_DATA_ENDPOINT = `${SUPABASE_URL}/functions/v1/blake-google-data`;

  function el(id) {
    return document.getElementById(id);
  }

  const authGate = el("authGate");
  const authError = el("authError");
  const googleSignInBtn = el("googleSignInBtn");
  const devBypassBanner = el("devBypassBanner");
  const appEl = el("app");
  const signOutBtn = el("signOutBtn");
  const fullscreenBtn = el("fullscreenBtn");

  // ---------- auth gate ----------
  //
  // Lightweight, deliberately not enterprise-grade: on successful OAuth,
  // blake-google-oauth mints a random opaque session token, stores its
  // hash server-side, and redirects back here as `?session=<token>`. We
  // stash that in localStorage and send it as a bearer token on every
  // later call to blake-google-data. No cookies, no session middleware —
  // appropriate for a single-user personal dashboard.
  //
  // IMPORTANT: while GOOGLE_CLIENT_ID is blank (OAuth not set up yet),
  // the gate is bypassed with a visible warning banner so the rest of the
  // dashboard can be built and tested. This route is NOT actually private
  // until a Client ID/Secret are configured — see README.
  function consumeSessionFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("session");
    if (token) {
      setSessionToken(token);
      params.delete("session");
      const rest = params.toString();
      history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
    const authFailed = params.get("auth_error");
    if (authFailed) {
      showAuthError(decodeURIComponent(authFailed));
    }
  }

  function showAuthError(message) {
    authError.textContent = message;
    authError.hidden = false;
  }

  function buildGoogleAuthUrl() {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: GOOGLE_SCOPES,
      access_type: "offline",
      // select_account forces Google's account chooser rather than
      // silently reusing whichever Google account this browser last
      // used — necessary so "connect another account" actually lets you
      // pick a different one instead of re-adding the same account.
      prompt: "consent select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  function startGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
      showAuthError("Google sign-in isn't configured yet — add a Client ID in command/app.js first.");
      return;
    }
    window.location.href = buildGoogleAuthUrl();
  }

  googleSignInBtn.addEventListener("click", startGoogleSignIn);

  if (signOutBtn) {
    signOutBtn.addEventListener("click", () => {
      clearSessionToken();
      window.location.reload();
    });
  }

  function initAuthGate() {
    consumeSessionFromUrl();

    if (!GOOGLE_CLIENT_ID) {
      // Dev bypass — see comment above.
      authGate.hidden = true;
      appEl.hidden = false;
      if (devBypassBanner) devBypassBanner.hidden = false;
      return true;
    }

    const token = getSessionToken();
    if (!token) {
      authGate.hidden = false;
      appEl.hidden = true;
      return false;
    }

    authGate.hidden = true;
    appEl.hidden = false;
    return true;
  }

  // ---------- clock / greeting ----------

  function renderClock() {
    const now = new Date();
    const clockEl = el("headerClock");
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    const dateLine = el("dateLine");
    if (dateLine) {
      dateLine.textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    }
  }

  function renderGreeting() {
    const hour = new Date().getHours();
    const period = getDayPeriodCommand(hour);
    const label = period.charAt(0).toUpperCase() + period.slice(1);
    const greetingEl = el("greetingText");
    if (greetingEl) greetingEl.textContent = `Good ${period}, Blake.`;
  }

  // ---------- Now section ----------

  function renderNow() {
    const list = el("nowList");
    if (!list) return;
    list.innerHTML = "";
    getNowItems().forEach((item) => {
      const li = document.createElement("li");
      li.className = `now-item now-item-${item.tone}`;
      li.textContent = item.text;
      list.appendChild(li);
    });
  }

  // ---------- todos ----------

  function renderTodos() {
    const openList = el("openTodoList");
    const completedList = el("completedTodoList");
    const summary = el("todoSummary");
    if (!openList || !completedList || !summary) return;

    const open = getOpenTasks();
    const completed = getCompletedTasks();
    summary.textContent = `${open.length} open · ${completed.length} completed`;

    openList.innerHTML = "";
    if (!open.length) {
      const li = document.createElement("li");
      li.className = "todo-empty";
      li.textContent = "Nothing on your list.";
      openList.appendChild(li);
    } else {
      open.forEach((task) => openList.appendChild(renderTodoRow(task)));
    }

    completedList.innerHTML = "";
    completed.forEach((task) => completedList.appendChild(renderTodoRow(task)));

    const completedDetails = el("completedDetails");
    if (completedDetails) completedDetails.hidden = completed.length === 0;
  }

  function renderTodoRow(task) {
    const li = document.createElement("li");
    li.className = `todo-row${task.done ? " todo-row-done" : ""}`;
    li.innerHTML = `
      <button class="todo-check" data-task-id="${task.id}" role="checkbox" aria-checked="${task.done}" aria-label="${task.done ? "Mark incomplete" : "Mark complete"}">
        <span class="todo-check-mark"></span>
      </button>
      <span class="todo-title">${escapeHtmlCmd(task.title)}</span>
      <button class="todo-delete" data-delete-task-id="${task.id}" aria-label="Delete task">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>`;
    return li;
  }

  function escapeHtmlCmd(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  const newTodoInput = el("newTodoInput");
  const addTodoBtn = el("addTodoBtn");

  function submitNewTodo() {
    if (!newTodoInput.value.trim()) return;
    addTask(newTodoInput.value);
    newTodoInput.value = "";
    renderTodos();
    renderNow();
  }

  if (addTodoBtn) addTodoBtn.addEventListener("click", submitNewTodo);
  if (newTodoInput) {
    newTodoInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitNewTodo();
    });
  }

  document.addEventListener("click", (e) => {
    const checkBtn = e.target.closest("[data-task-id]");
    if (checkBtn) {
      toggleTask(checkBtn.dataset.taskId);
      renderTodos();
      renderNow();
      return;
    }
    const delBtn = e.target.closest("[data-delete-task-id]");
    if (delBtn) {
      deleteTask(delBtn.dataset.deleteTaskId);
      renderTodos();
      renderNow();
    }
  });

  // ---------- quick launch ----------

  const editLinksBtn = el("editLinksBtn");
  const quickLaunchAddRow = el("quickLaunchAddRow");
  let editingLinks = false;

  function renderQuickLaunch() {
    const grid = el("quickLaunchGrid");
    if (!grid) return;
    grid.innerHTML = "";
    commandData.links.forEach((link) => {
      const item = document.createElement("div");
      item.className = "quicklaunch-item";
      item.innerHTML = `
        <a href="${escapeHtmlCmd(link.url)}" target="_blank" rel="noopener noreferrer" class="quicklaunch-link">
          <span class="quicklaunch-emoji">${escapeHtmlCmd(link.emoji)}</span>
          <span class="quicklaunch-label">${escapeHtmlCmd(link.label)}</span>
        </a>
        ${editingLinks ? `<button class="quicklaunch-remove" data-remove-link-id="${link.id}" aria-label="Remove ${escapeHtmlCmd(link.label)}">&times;</button>` : ""}`;
      grid.appendChild(item);
    });
  }

  if (editLinksBtn) {
    editLinksBtn.addEventListener("click", () => {
      editingLinks = !editingLinks;
      editLinksBtn.textContent = editingLinks ? "Done" : "Edit";
      quickLaunchAddRow.hidden = !editingLinks;
      renderQuickLaunch();
    });
  }

  document.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-link-id]");
    if (removeBtn) {
      deleteLink(removeBtn.dataset.removeLinkId);
      renderQuickLaunch();
    }
  });

  const addLinkBtn = el("addLinkBtn");
  if (addLinkBtn) {
    addLinkBtn.addEventListener("click", () => {
      addLink({
        label: el("newLinkLabel").value,
        url: el("newLinkUrl").value,
        emoji: el("newLinkEmoji").value,
      });
      el("newLinkLabel").value = "";
      el("newLinkUrl").value = "";
      el("newLinkEmoji").value = "";
      renderQuickLaunch();
    });
  }

  // ---------- weather ----------

  function renderWeather() {
    const body = el("weatherBody");
    if (!body) return;
    const w = commandData.weather;
    if (!w) {
      body.innerHTML = `<div class="card-placeholder">Weather unavailable right now.</div>`;
      return;
    }
    body.innerHTML = `
      <div class="weather-main">
        <span class="weather-temp">${w.currentTemp}°</span>
        <span class="weather-cond">${escapeHtmlCmd(w.condition)}</span>
      </div>
      <div class="weather-sub">High ${w.high}° · Low ${w.low}°${w.rainChance >= 20 ? ` · ${w.rainChance}% rain` : ""}</div>`;
  }

  async function loadWeather() {
    commandData.weather = await fetchSharedWeather(db);
    renderWeather();
  }

  // ---------- calendar (Google) ----------

  function renderCalendar() {
    const body = el("calendarBody");
    if (!body) return;
    const cal = commandData.calendar;

    if (cal.status === "not_connected") {
      body.innerHTML = `<div class="card-placeholder">Not connected. <button class="text-link" id="connectCalendarBtn">Sign in with Google</button> to see today's agenda.</div>`;
      const btn = el("connectCalendarBtn");
      if (btn) btn.addEventListener("click", () => googleSignInBtn.click());
      return;
    }
    if (cal.status === "loading") {
      body.innerHTML = `<div class="card-placeholder">Loading…</div>`;
      return;
    }
    if (cal.status === "error") {
      body.innerHTML = `<div class="card-placeholder">Couldn't load your calendar right now.</div>`;
      return;
    }
    if (!cal.events.length) {
      body.innerHTML = `<div class="card-placeholder">Nothing on your calendar today.</div>`;
      return;
    }

    const multiAccount = commandData.accounts.length > 1;

    body.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "agenda-list";
    cal.events.forEach((ev) => {
      const li = document.createElement("li");
      li.className = `agenda-row${ev.isPast ? " agenda-row-past" : ""}${ev.overlaps ? " agenda-row-overlap" : ""}${ev.isNext ? " agenda-row-next" : ""}`;
      const dot = multiAccount && ev.account
        ? `<span class="account-dot" style="background:${accountColor(ev.account)}" title="${escapeHtmlCmd(accountLabel(ev.account))}"></span>`
        : "";
      li.innerHTML = `
        <span class="agenda-time">${escapeHtmlCmd(ev.displayTime)}</span>
        <span class="agenda-body">
          <span class="agenda-title">${ev.isNext ? '<span class="agenda-next-badge">Next</span> ' : ""}${dot}${escapeHtmlCmd(ev.title)}</span>
          ${ev.location ? `<div class="agenda-loc">${escapeHtmlCmd(ev.location)}</div>` : ""}
        </span>
        ${ev.meetingLink && !ev.isPast ? `<a class="pill-btn-sm" href="${escapeHtmlCmd(ev.meetingLink)}" target="_blank" rel="noopener noreferrer">Join</a>` : ""}`;
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  // ---------- gmail ----------

  function renderGmail() {
    const body = el("gmailBody");
    if (!body) return;
    const gmail = commandData.gmail;

    if (gmail.status === "not_connected") {
      body.innerHTML = `<div class="card-placeholder">Not connected. <button class="text-link" id="connectGmailBtn">Sign in with Google</button> to see what needs a look.</div>`;
      const btn = el("connectGmailBtn");
      if (btn) btn.addEventListener("click", () => googleSignInBtn.click());
      return;
    }
    if (gmail.status === "loading") {
      body.innerHTML = `<div class="card-placeholder">Loading…</div>`;
      return;
    }
    if (gmail.status === "error") {
      body.innerHTML = `<div class="card-placeholder">Couldn't load Gmail right now.</div>`;
      return;
    }
    if (!gmail.messages.length) {
      body.innerHTML = `<div class="card-placeholder">Inbox is clear.</div>`;
      return;
    }

    const multiAccount = commandData.accounts.length > 1;

    body.innerHTML = "";
    const unreadLine = document.createElement("div");
    unreadLine.className = "gmail-unread-count";
    // Raw context only, deliberately not the headline — see Now/Attention
    // for why: these numbers compound over years of unread mail and
    // aren't a "do this now" signal on their own.
    unreadLine.textContent = `${gmail.unreadCount.toLocaleString()} unread total · ${gmail.importantUnreadCount.toLocaleString()} flagged all-time`;
    body.appendChild(unreadLine);

    const ul = document.createElement("ul");
    ul.className = "gmail-list";
    gmail.messages.forEach((msg) => {
      const li = document.createElement("li");
      li.className = "gmail-row";
      const dot = multiAccount && msg.account
        ? `<span class="account-dot" style="background:${accountColor(msg.account)}" title="${escapeHtmlCmd(accountLabel(msg.account))}"></span>`
        : "";
      li.innerHTML = `
        <span class="gmail-body">
          <span class="gmail-sender">${dot}${escapeHtmlCmd(msg.sender)}</span>
          <span class="gmail-subject">${escapeHtmlCmd(msg.subject)}</span>
        </span>
        <a class="text-link" href="${escapeHtmlCmd(msg.link)}" target="_blank" rel="noopener noreferrer">Open</a>
        <button class="gmail-dismiss" data-dismiss-message-id="${escapeHtmlCmd(msg.id)}" aria-label="Dismiss">&times;</button>`;
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  document.addEventListener("click", (e) => {
    const dismissBtn = e.target.closest("[data-dismiss-message-id]");
    if (!dismissBtn) return;
    dismissMessage(dismissBtn.dataset.dismissMessageId);
    renderGmail();
    renderAttention();
    renderNow();
  });

  // ---------- connected accounts ----------

  function renderAccounts() {
    const row = el("accountsRow");
    if (!row) return;

    if (!commandData.accounts.length) {
      row.innerHTML = `<button class="text-link" id="connectAccountBtn">+ Connect a Google account</button>`;
      el("connectAccountBtn").addEventListener("click", startGoogleSignIn);
      return;
    }

    row.innerHTML = "";
    commandData.accounts.forEach((account) => {
      const chip = document.createElement("span");
      chip.className = "account-chip";
      const failed = commandData.accountErrors.includes(account.email);
      chip.innerHTML = `
        <span class="account-dot" style="background:${accountColor(account.email)}"></span>
        <span>${escapeHtmlCmd(accountLabel(account.email))}</span>
        ${failed ? '<span class="account-chip-error" title="Couldn\'t load this account">!</span>' : ""}
        <button class="account-chip-remove" data-disconnect-email="${escapeHtmlCmd(account.email)}" aria-label="Disconnect ${escapeHtmlCmd(account.email)}">&times;</button>`;
      row.appendChild(chip);
    });

    const addBtn = document.createElement("button");
    addBtn.className = "text-link account-add-btn";
    addBtn.id = "connectAccountBtn";
    addBtn.textContent = "+ Add account";
    addBtn.addEventListener("click", startGoogleSignIn);
    row.appendChild(addBtn);
  }

  document.addEventListener("click", async (e) => {
    const removeBtn = e.target.closest("[data-disconnect-email]");
    if (!removeBtn) return;
    const email = removeBtn.dataset.disconnectEmail;
    const token = getSessionToken();
    if (!token) return;
    removeBtn.disabled = true;
    try {
      await fetch(`${GOOGLE_DATA_ENDPOINT}?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.warn("Blake Command Center: couldn't disconnect account.", err);
    }
    await loadGoogleData();
    renderAccounts();
  });

  async function loadGoogleData() {
    const token = getSessionToken();
    if (!token) return; // not signed in — placeholders already showing

    commandData.calendar.status = "loading";
    commandData.gmail.status = "loading";
    renderCalendar();
    renderGmail();
    renderNow();

    try {
      const res = await fetch(GOOGLE_DATA_ENDPOINT, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        // session expired or revoked — drop back to the sign-in gate
        clearSessionToken();
        window.location.reload();
        return;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const payload = await res.json();

      commandData.accounts = payload.accounts || [];
      commandData.accountErrors = payload.accountErrors || [];
      commandData.calendar = { status: "connected", events: payload.calendar || [] };
      commandData.gmail = {
        status: "connected",
        unreadCount: payload.gmail ? payload.gmail.unreadCount : 0,
        importantUnreadCount: payload.gmail ? payload.gmail.importantUnreadCount : 0,
        messages: (payload.gmail ? payload.gmail.messages : []).filter((m) => !isDismissed(m.id)),
      };
      commandData.tomorrow = payload.tomorrow || null;
    } catch (err) {
      console.warn("Blake Command Center: couldn't load Google data.", err);
      commandData.calendar.status = "error";
      commandData.gmail.status = "error";
    }

    renderAccounts();
    renderCalendar();
    renderGmail();
    renderNow();
  }

  // ---------- needs attention / briefing (collapsible, placeholder-aware) ----------

  function renderAttention() {
    const body = el("attentionBody");
    if (!body) return;
    const rows = [];

    if (commandData.gmail.status === "connected" && commandData.gmail.messages.length) {
      const n = commandData.gmail.messages.length;
      rows.push({ label: `${n} Gmail message${n === 1 ? "" : "s"} worth a look`, kind: "live" });
    }

    if (!rows.length) {
      body.innerHTML = `<div class="card-placeholder">Nothing flagged.</div>`;
      return;
    }

    body.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "attention-list";
    rows.forEach((row) => {
      const li = document.createElement("li");
      li.className = "attention-row";
      li.innerHTML = `<span>${escapeHtmlCmd(row.label)}</span><span class="badge badge-${row.kind}">${row.kind}</span>`;
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  function renderBriefing() {
    const body = el("briefingBody");
    if (!body) return;
    const w = commandData.weather;
    const t = commandData.tomorrow;
    body.innerHTML = `
      ${t ? `<div class="briefing-row">
        <span>Tomorrow</span>
        <span>${escapeHtmlCmd(t.title)} at ${escapeHtmlCmd(t.displayTime)}</span>
      </div>` : ""}
      <div class="briefing-row">
        <span>Weather</span>
        <span>${w ? `${w.currentTemp}° · ${escapeHtmlCmd(w.condition)}` : "Unavailable"}</span>
      </div>
      <div class="briefing-row briefing-row-placeholder">
        <span>Sports</span>
        <span class="badge badge-placeholder">not connected</span>
      </div>
      <div class="briefing-row briefing-row-placeholder">
        <span>News</span>
        <span class="badge badge-placeholder">not connected</span>
      </div>`;
  }

  // ---------- fullscreen ----------

  if (fullscreenBtn) {
    if (!document.documentElement.requestFullscreen) {
      fullscreenBtn.hidden = true;
    } else {
      fullscreenBtn.addEventListener("click", () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
      });
    }
  }

  // ---------- init ----------

  function renderAll() {
    renderClock();
    renderGreeting();
    renderTodos();
    renderQuickLaunch();
    renderWeather();
    renderAccounts();
    renderCalendar();
    renderGmail();
    renderAttention();
    renderBriefing();
    renderNow();
  }

  async function init() {
    loadTasks();
    loadLinks();

    const signedIn = initAuthGate();
    renderAll();

    if (signedIn) {
      await loadWeather();
      await loadGoogleData();
      renderAttention();
      renderBriefing();
    }

    setInterval(renderClock, 15000);
  }

  init();
})();
