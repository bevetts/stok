/*
 * Solace OS — app behavior
 * Vanilla JS, no build step. Talks to the DOM directly and reads
 * everything it needs to say/show through data.js's helper functions.
 * Live data comes straight from Supabase via the anon key (protected by
 * Row Level Security, not secrecy — that's the normal Supabase model).
 */

(() => {
  "use strict";

  const SUPABASE_URL = "https://pftwellkloafqbpnhpyt.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmdHdlbGxrbG9hZnFicG5ocHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAyMTMwOTAsImV4cCI6MjA1NTc4OTA5MH0.Gu5F-2uRQ6Bi43M858-wVp4xiS6YKRasCnWO-nr5nQc";
  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const STORAGE_KEY = "solace.settings";
  const WALLPAPER_KEY = "solace.wallpaper";
  const SLIDESHOW_KEY = "solace.slideshow";
  const ROUTINE_KEY = "solace.routine";
  const AUTOSTART_KEY = "solace.lastAutoStart";
  const IDLE_MS = 30000;
  const IDLE_MS_AMBIENT = 15000;
  const SLIDESHOW_INTERVAL_MS = 8000;

  const defaultSettings = {
    name: "Chayla",
    deviceName: "Solace",
    voiceURI: "",
    voiceEnabled: true,
    autoStart: false,
    startTime: "07:00",
    spotifyUrl: "",
    displayMode: "standard",
    idleSlideshow: false,
    morningClose: true,
  };

  let settings = loadSettings();

  // ---------- element refs ----------

  const el = (id) => document.getElementById(id);

  const appEl = el("app");
  const wallpaperEl = el("wallpaper");
  const clockEl = el("clock");
  const clockAmpmEl = el("clockAmpm");
  const dateLineEl = el("dateLine");
  const greetingEl = el("greeting");
  const contextLineEl = el("contextLine");
  const glanceLineEl = el("glanceLine");
  const leaveByPill = el("leaveByPill");
  const leaveByPillText = el("leaveByPillText");
  const vanityStartBtn = el("vanityStartBtn");
  const quoteLineEl = el("quoteLine");
  const statusTempEl = el("statusTemp");
  const avatarInitialEl = el("avatarInitial");
  const profileNameEl = el("profileName");

  const weatherTempPreview = el("weatherTempPreview");
  const weatherCondPreview = el("weatherCondPreview");
  const weatherHighLowPreview = el("weatherHighLowPreview");
  const weatherWidget = el("weatherWidget");
  const calendarWidget = el("calendarWidget");
  const nextEventTime = el("nextEventTime");
  const nextEventTitle = el("nextEventTitle");
  const nextEventLeaveBy = el("nextEventLeaveBy");

  const dock = el("dock");
  const panels = {
    weather: el("panel-weather"),
    calendar: el("panel-calendar"),
    music: el("panel-music"),
    watch: el("panel-watch"),
    timer: el("panel-timer"),
  };

  const startMorningCard = el("startMorningCard");
  const briefingOverlay = el("briefingOverlay");
  const briefingText = el("briefingText");
  const briefingChoices = el("briefingChoices");
  const briefingClose = el("briefingClose");
  const briefingProgressBar = el("briefingProgressBar");
  const briefingProgressLabel = el("briefingProgressLabel");

  const timerBadge = el("timerBadge");
  const timerBadgeText = el("timerBadgeText");
  const timerSetup = el("timerSetup");
  const timerDisplay = el("timerDisplay");
  const timerCountdown = el("timerCountdown");
  const timerPauseBtn = el("timerPauseBtn");
  const timerCancelBtn = el("timerCancelBtn");
  const timerStartBtn = el("timerStartBtn");
  const timerCustomMinutes = el("timerCustomMinutes");
  const alarmList = el("alarmList");
  const newAlarmTime = el("newAlarmTime");
  const newAlarmLabel = el("newAlarmLabel");
  const addAlarmBtn = el("addAlarmBtn");
  const alertOverlay = el("alertOverlay");
  const alertText = el("alertText");
  const alertSnoozeBtn = el("alertSnoozeBtn");
  const alertDismissBtn = el("alertDismissBtn");

  const settingsBtn = el("settingsBtn");
  const settingsOverlay = el("settingsOverlay");
  const settingsClose = el("settingsClose");
  const settingName = el("settingName");
  const settingDevice = el("settingDevice");
  const settingSpotifyUrl = el("settingSpotifyUrl");
  const calendarFeedList = el("calendarFeedList");
  const newFeedLabel = el("newFeedLabel");
  const newFeedUrl = el("newFeedUrl");
  const addFeedBtn = el("addFeedBtn");
  const feedHint = el("feedHint");
  const settingVoice = el("settingVoice");
  const settingStartTime = el("settingStartTime");
  const toggleVoice = el("toggleVoice");
  const toggleAutoStart = el("toggleAutoStart");
  const settingsSaveBtn = el("settingsSaveBtn");
  const wallpaperUploadBtn = el("wallpaperUploadBtn");
  const wallpaperResetBtn = el("wallpaperResetBtn");
  const wallpaperInput = el("wallpaperInput");
  const wallpaperHint = el("wallpaperHint");

  const nightModeBtn = el("nightModeBtn");
  const musicPlayBtn = el("musicPlayBtn");
  const spotifyEmbedWrap = el("spotifyEmbedWrap");
  const spotifyEmbed = el("spotifyEmbed");
  const spotifyEmptyState = el("spotifyEmptyState");

  const routineList = el("routineList");
  const routineProgress = el("routineProgress");
  const routineSettingsList = el("routineSettingsList");
  const newRoutineItem = el("newRoutineItem");
  const addRoutineBtn = el("addRoutineBtn");

  const settingDisplayMode = el("settingDisplayMode");
  const toggleSlideshow = el("toggleSlideshow");
  const toggleMorningClose = el("toggleMorningClose");
  const slideshowUploadBtn = el("slideshowUploadBtn");
  const slideshowClearBtn = el("slideshowClearBtn");
  const slideshowInput = el("slideshowInput");
  const slideshowHint = el("slideshowHint");

  // ---------- settings persistence ----------

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
    } catch {
      return { ...defaultSettings };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable — settings just won't persist across reloads */
    }
  }

  function applyWallpaperFromStorage() {
    let dataUrl = null;
    try {
      dataUrl = localStorage.getItem(WALLPAPER_KEY);
    } catch {
      dataUrl = null;
    }
    if (dataUrl) {
      applyWallpaper(dataUrl);
    } else {
      wallpaperEl.classList.remove("custom");
      wallpaperEl.style.removeProperty("--custom-wallpaper");
    }
  }

  function applyWallpaper(dataUrl) {
    wallpaperEl.style.setProperty("--custom-wallpaper", `url("${dataUrl}")`);
    wallpaperEl.classList.add("custom");
  }

  function hasSavedWallpaper() {
    try {
      return !!localStorage.getItem(WALLPAPER_KEY);
    } catch {
      return false;
    }
  }

  function updateWallpaperHint() {
    if (!wallpaperHint) return;
    if (hasSavedWallpaper()) {
      wallpaperHint.textContent = "Custom wallpaper saved on this device.";
    } else {
      wallpaperHint.textContent = "Upload a photo — it will be resized to fit local storage.";
    }
  }

  /**
   * Camera photos as raw data URLs routinely blow past localStorage's ~5 MB
   * per-origin cap. Resize + JPEG compress so a typical wallpaper lands around
   * 200–600 KB and actually survives a reload.
   */
  function compressWallpaperFile(file, { maxEdge = 1920, quality = 0.82 } = {}) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (!dataUrl || dataUrl.length < 32) {
          reject(new Error("Compression failed"));
          return;
        }
        resolve(dataUrl);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Couldn't decode image"));
      };

      img.src = objectUrl;
    });
  }

  function persistWallpaper(dataUrl) {
    try {
      localStorage.setItem(WALLPAPER_KEY, dataUrl);
      return localStorage.getItem(WALLPAPER_KEY) === dataUrl;
    } catch {
      return false;
    }
  }

  // ---------- display presets ----------

  function applyDisplayMode() {
    document.body.classList.remove("mode-standard", "mode-vanity", "mode-ambient");
    const mode = settings.displayMode || "standard";
    document.body.classList.add(`mode-${mode}`);
  }

  function getIdleMs() {
    return settings.displayMode === "ambient" ? IDLE_MS_AMBIENT : IDLE_MS;
  }

  // ---------- morning routine ----------

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadRoutineState() {
    try {
      const raw = localStorage.getItem(ROUTINE_KEY);
      if (!raw) {
        return {
          date: todayKey(),
          items: DEFAULT_ROUTINE.map((label) => ({
            id: crypto.randomUUID(),
            label,
            done: false,
          })),
        };
      }
      const parsed = JSON.parse(raw);
      if (parsed.date !== todayKey()) {
        parsed.date = todayKey();
        parsed.items = (parsed.items || []).map((item) => ({ ...item, done: false }));
        saveRoutineState(parsed);
      }
      return parsed;
    } catch {
      return {
        date: todayKey(),
        items: DEFAULT_ROUTINE.map((label) => ({
          id: crypto.randomUUID(),
          label,
          done: false,
        })),
      };
    }
  }

  function saveRoutineState(state) {
    try {
      localStorage.setItem(ROUTINE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }

  let routineState = loadRoutineState();

  function renderRoutineList() {
    if (!routineList) return;
    routineList.innerHTML = "";
    const items = routineState.items || [];
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "feed-list-empty";
      li.textContent = "Add items in Settings.";
      routineList.appendChild(li);
      if (routineProgress) routineProgress.textContent = "0/0";
      return;
    }

    const doneCount = items.filter((i) => i.done).length;
    if (routineProgress) routineProgress.textContent = `${doneCount}/${items.length}`;

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = `routine-item${item.done ? " done" : ""}`;
      li.dataset.routineId = item.id;
      li.innerHTML = `
        <span class="routine-check" aria-hidden="true">${item.done ? "✓" : ""}</span>
        <span>${item.label}</span>`;
      routineList.appendChild(li);
    });
  }

  function renderRoutineSettingsList() {
    if (!routineSettingsList) return;
    routineSettingsList.innerHTML = "";
    const items = routineState.items || [];
    if (!items.length) {
      const li = document.createElement("li");
      li.className = "feed-list-empty";
      li.textContent = "No routine items yet.";
      routineSettingsList.appendChild(li);
      return;
    }
    items.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="feed-info"><span class="feed-label">${item.label}</span></span>
        <button class="feed-remove-btn" data-routine-remove="${item.id}" aria-label="Remove ${item.label}">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>`;
      routineSettingsList.appendChild(li);
    });
  }

  routineList.addEventListener("click", (e) => {
    const row = e.target.closest("[data-routine-id]");
    if (!row) return;
    registerInteraction();
    const item = routineState.items.find((i) => i.id === row.dataset.routineId);
    if (!item) return;
    item.done = !item.done;
    saveRoutineState(routineState);
    renderRoutineList();
  });

  addRoutineBtn.addEventListener("click", () => {
    const label = newRoutineItem.value.trim();
    if (!label) return;
    registerInteraction();
    routineState.items.push({ id: crypto.randomUUID(), label, done: false });
    saveRoutineState(routineState);
    newRoutineItem.value = "";
    renderRoutineList();
    renderRoutineSettingsList();
  });

  routineSettingsList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-routine-remove]");
    if (!btn) return;
    registerInteraction();
    routineState.items = routineState.items.filter((i) => i.id !== btn.dataset.routineRemove);
    saveRoutineState(routineState);
    renderRoutineList();
    renderRoutineSettingsList();
  });

  // ---------- idle slideshow ----------

  let slideshowIndex = 0;
  let slideshowIntervalId = null;
  let savedWallpaperBeforeSlideshow = null;

  function loadSlideshow() {
    try {
      const raw = localStorage.getItem(SLIDESHOW_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveSlideshow(images) {
    try {
      localStorage.setItem(SLIDESHOW_KEY, JSON.stringify(images));
    } catch {
      /* ignore */
    }
  }

  let slideshowImages = loadSlideshow();

  function updateSlideshowHint() {
    if (!slideshowHint) return;
    const n = slideshowImages.length;
    slideshowHint.textContent = n
      ? `${n} photo${n === 1 ? "" : "s"} in idle rotation.`
      : "Add photos to cycle when idle (if slideshow is on).";
  }

  function stopSlideshow() {
    if (slideshowIntervalId) {
      clearInterval(slideshowIntervalId);
      slideshowIntervalId = null;
    }
    if (savedWallpaperBeforeSlideshow !== null) {
      if (savedWallpaperBeforeSlideshow) {
        applyWallpaper(savedWallpaperBeforeSlideshow);
      } else {
        wallpaperEl.classList.remove("custom");
        wallpaperEl.style.removeProperty("--custom-wallpaper");
      }
      savedWallpaperBeforeSlideshow = null;
    }
  }

  function startSlideshow() {
    if (!settings.idleSlideshow || slideshowImages.length < 1) return;
    stopSlideshow();
    try {
      savedWallpaperBeforeSlideshow = localStorage.getItem(WALLPAPER_KEY);
    } catch {
      savedWallpaperBeforeSlideshow = null;
    }
    slideshowIndex = 0;
    applyWallpaper(slideshowImages[slideshowIndex]);
    slideshowIntervalId = setInterval(() => {
      slideshowIndex = (slideshowIndex + 1) % slideshowImages.length;
      applyWallpaper(slideshowImages[slideshowIndex]);
    }, SLIDESHOW_INTERVAL_MS);
  }

  // ---------- Supabase (live data) ----------

  let supabaseStatus = "unknown"; // "connected" | "partial" | "unavailable"

  async function loadFromSupabase() {
    let anySucceeded = false;
    let anyFailed = false;

    const { data: settingsRow, error: settingsErr } = await db
      .from("solace_settings")
      .select("name, device_name, voice_enabled, auto_start, start_time, spotify_url")
      .eq("id", 1)
      .maybeSingle();
    if (settingsErr) {
      anyFailed = true;
      console.warn("Solace: couldn't load settings from Supabase.", settingsErr);
    } else {
      anySucceeded = true;
      if (settingsRow) {
        settings = {
          ...settings,
          name: settingsRow.name,
          deviceName: settingsRow.device_name,
          voiceEnabled: settingsRow.voice_enabled,
          autoStart: settingsRow.auto_start,
          startTime: settingsRow.start_time,
          spotifyUrl: settingsRow.spotify_url || "",
        };
        saveSettings();
      }
    }

    const { data: weatherRow, error: weatherErr } = await db
      .from("solace_weather")
      .select("current_temp, condition, high, low, rain_chance")
      .eq("id", 1)
      .maybeSingle();
    if (weatherErr) {
      anyFailed = true;
      console.warn("Solace: couldn't load weather from Supabase.", weatherErr);
    } else {
      anySucceeded = true;
      if (weatherRow) {
        solaceData.weather = {
          currentTemp: weatherRow.current_temp,
          condition: weatherRow.condition,
          high: weatherRow.high,
          low: weatherRow.low,
          rainChance: weatherRow.rain_chance,
        };
      }
    }

    const { data: eventRows, error: eventsErr } = await db.rpc("get_todays_events");
    if (eventsErr) {
      anyFailed = true;
      console.warn("Solace: couldn't load today's events from Supabase.", eventsErr);
    } else {
      anySucceeded = true;
      // Unconditional: a genuinely empty day is real data, not a reason
      // to keep whatever was there before.
      solaceData.calendar = (eventRows || []).map((e) => ({
        time: e.display_time,
        title: e.title.trim(),
        location: (e.location || "").trim(),
        leaveBy: e.leave_by || undefined,
      }));
    }

    if (!anyFailed) supabaseStatus = "connected";
    else if (anySucceeded) supabaseStatus = "partial";
    else supabaseStatus = "unavailable";
  }

  async function persistSettingsToSupabase() {
    const { error } = await db
      .from("solace_settings")
      .update({
        name: settings.name,
        device_name: settings.deviceName,
        voice_enabled: settings.voiceEnabled,
        auto_start: settings.autoStart,
        start_time: settings.startTime,
        spotify_url: settings.spotifyUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) console.warn("Solace: couldn't save settings to Supabase — kept locally only.", error);
  }

  // ---------- calendar feeds (onboarding: add/remove without a migration) ----------

  async function loadCalendarFeeds() {
    const result = await withTimeout(
      db
        .from("solace_calendar_feeds")
        .select("id, label, ics_url, enabled, last_synced_at, last_sync_error")
        .order("created_at", { ascending: true }),
      8000
    );
    if (!result) {
      console.warn("Solace: loading calendar feeds timed out.");
      return;
    }
    if (result.error) {
      console.warn("Solace: couldn't load calendar feeds.", result.error);
      return;
    }
    renderFeedList(result.data || []);
  }

  function feedStatusText(feed) {
    if (feed.last_sync_error) return { text: `Error: ${feed.last_sync_error}`, isError: true };
    if (!feed.last_synced_at) return { text: "Not synced yet", isError: false };
    const mins = Math.round((Date.now() - new Date(feed.last_synced_at).getTime()) / 60000);
    const when = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} hr ago`;
    return { text: `Synced ${when}`, isError: false };
  }

  function renderFeedList(feeds) {
    calendarFeedList.innerHTML = "";
    if (!feeds.length) {
      const li = document.createElement("li");
      li.className = "feed-list-empty";
      li.textContent = "No calendars added yet.";
      calendarFeedList.appendChild(li);
      return;
    }
    feeds.forEach((feed) => {
      const status = feedStatusText(feed);
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="feed-info">
          <span class="feed-label">${feed.label}</span>
          <span class="feed-status${status.isError ? " feed-status-error" : ""}">${status.text}</span>
        </span>
        <button class="feed-remove-btn" data-feed-id="${feed.id}" aria-label="Remove ${feed.label}">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>`;
      calendarFeedList.appendChild(li);
    });
  }

  calendarFeedList.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-feed-id]");
    if (!btn) return;
    registerInteraction();
    const result = await withTimeout(db.from("solace_calendar_feeds").delete().eq("id", btn.dataset.feedId), 8000);
    if (!result || result.error) {
      feedHint.textContent = "Couldn't remove that calendar — try again.";
      return;
    }
    await loadCalendarFeeds();
    feedHint.textContent = "Removed. Refreshing today's events…";
    await triggerCalendarSync();
    await loadFromSupabase();
    renderStaticContent({ animateWidgets: true });
  });

  addFeedBtn.addEventListener("click", async () => {
    registerInteraction();
    const label = newFeedLabel.value.trim();
    const url = newFeedUrl.value.trim();
    if (!label || !url) {
      feedHint.textContent = "Add a label and a calendar link first.";
      return;
    }
    if (!/^(https?|webcal):\/\//i.test(url)) {
      feedHint.textContent = "That doesn't look like a calendar link — should start with webcal:// or https://";
      return;
    }
    addFeedBtn.textContent = "Adding…";
    const result = await withTimeout(
      db.from("solace_calendar_feeds").insert({ label, ics_url: url, enabled: true }),
      8000
    );
    addFeedBtn.textContent = "Add";
    if (!result || result.error) {
      feedHint.textContent = "Couldn't add that calendar — try again.";
      return;
    }
    newFeedLabel.value = "";
    newFeedUrl.value = "";
    await loadCalendarFeeds();
    feedHint.textContent = "Added — syncing now…";
    await triggerCalendarSync();
    await loadCalendarFeeds();
    await loadFromSupabase();
    renderStaticContent({ animateWidgets: true });
    feedHint.textContent = "From the Calendar app: calendar name → Share Calendar → Public Calendar, then copy the link.";
  });

  async function triggerCalendarSync() {
    try {
      await withTimeout(
        fetch(`${SUPABASE_URL}/functions/v1/solace-calendar-sync`, {
          method: "POST",
          headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        }),
        8000
      );
    } catch (err) {
      console.warn("Solace: calendar sync trigger failed — it'll still run on the next scheduled sync.", err);
    }
  }

  function updateDataSourceHint() {
    const hintEl = document.getElementById("dataSourceHint");
    if (!hintEl) return;
    const copy = {
      connected: "Getting live weather, calendar, and settings from Supabase.",
      partial: "Some info updated from Supabase — the rest is showing saved data.",
      unavailable: "Showing saved info — couldn't reach Supabase just now.",
      unknown: "Checking for live updates…",
    };
    hintEl.textContent = copy[supabaseStatus] || copy.unavailable;
  }

  // ---------- clock / date / greeting ----------

  function dayPeriodGreeting(hour) {
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }

  function renderClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    clockEl.firstChild.textContent = `${hours}:${minutes}`;
    clockAmpmEl.textContent = ampm;

    dateLineEl.textContent = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    greetingEl.textContent = `${dayPeriodGreeting(now.getHours())}, ${settings.name}.`;
    return now;
  }

  function markDataLoading() {
    statusTempEl.classList.add("skeleton");
    weatherTempPreview.classList.add("skeleton");
    weatherCondPreview.classList.add("skeleton");
    weatherHighLowPreview.classList.add("skeleton");
    nextEventTime.classList.add("skeleton");
    nextEventTitle.classList.add("skeleton");
    nextEventLeaveBy.classList.add("skeleton");
  }

  function clearDataLoading() {
    [statusTempEl, weatherTempPreview, weatherCondPreview, weatherHighLowPreview,
     nextEventTime, nextEventTitle, nextEventLeaveBy].forEach((node) => {
      node.classList.remove("skeleton");
    });
  }

  function pulseWidgets() {
    [weatherWidget, calendarWidget].forEach((widget) => {
      if (!widget) return;
      widget.classList.remove("data-refresh");
      void widget.offsetWidth; // reflow so the animation can replay
      widget.classList.add("data-refresh");
      widget.addEventListener("animationend", () => widget.classList.remove("data-refresh"), { once: true });
    });
  }

  function renderStaticContent({ animateWidgets = false } = {}) {
    profileNameEl.textContent = settings.name;
    avatarInitialEl.textContent = settings.name.charAt(0).toUpperCase() || "S";
    document.title = settings.deviceName || "Solace";

    renderSpotifyEmbed();

    contextLineEl.textContent = getContextualSentence();
    if (quoteLineEl) quoteLineEl.textContent = getQuoteLine();
    if (glanceLineEl) glanceLineEl.textContent = getGlanceLine();

    const next = getNextEvent();
    if (leaveByPill && leaveByPillText) {
      if (next && next.leaveBy) {
        leaveByPillText.textContent = `Leave by ${next.leaveBy}`;
        leaveByPill.hidden = false;
      } else {
        leaveByPill.hidden = true;
      }
    }

    clearDataLoading();

    const weather = getWeatherSummary();
    statusTempEl.textContent = `${weather.currentTemp}°`;
    weatherTempPreview.textContent = `${weather.currentTemp}°`;
    weatherCondPreview.textContent = weather.condition;
    weatherHighLowPreview.textContent = `High ${weather.high}° · Low ${weather.low}°`;

    if (next) {
      nextEventTime.textContent = next.time;
      nextEventTitle.textContent = next.title;
      nextEventLeaveBy.textContent = next.leaveBy ? `Leave by ${next.leaveBy}` : "No leave time needed";
    } else {
      nextEventTime.textContent = "—";
      nextEventTitle.textContent = "Nothing scheduled";
      nextEventLeaveBy.textContent = "";
    }

    // Weather panel
    el("panelWeatherTemp").textContent = `${weather.currentTemp}°`;
    el("panelWeatherCond").textContent = weather.condition;
    el("panelWeatherRange").textContent = `High ${weather.high}° · Low ${weather.low}° · ${weather.rainChance}% chance of rain`;
    el("panelWeatherNote").textContent = weather.spoken;

    // Calendar panel
    const eventList = el("eventList");
    eventList.innerHTML = "";
    if (!solaceData.calendar.length) {
      const li = document.createElement("li");
      li.className = "event-empty";
      li.textContent = "Nothing scheduled today.";
      eventList.appendChild(li);
    } else {
      solaceData.calendar.forEach((ev) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <span class="event-time">${ev.time}</span>
          <span class="event-body">
            <span class="event-title">${ev.title}</span>
            ${ev.leaveBy ? `<div class="event-leave">Leave by ${ev.leaveBy}</div>` : ""}
            ${ev.location ? `<div class="event-loc">${ev.location}</div>` : ""}
          </span>`;
        eventList.appendChild(li);
      });
    }

    if (animateWidgets) pulseWidgets();
    renderRoutineList();
  }

  // ---------- view / dock navigation ----------

  function showView(view) {
    Object.entries(panels).forEach(([name, panel]) => {
      panel.hidden = name !== view;
    });
    document.querySelectorAll(".dock-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
  }

  dock.addEventListener("click", (e) => {
    const btn = e.target.closest(".dock-item");
    if (!btn) return;
    registerInteraction();
    showView(btn.dataset.view);
  });

  // Close button on each content panel, plus click-on-the-dimmed-backdrop
  // to dismiss — previously the only way out was clicking a different
  // dock item, which wasn't discoverable and left people feeling stuck.
  document.querySelectorAll("[data-close-panel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      registerInteraction();
      showView("morning");
    });
  });
  Object.values(panels).forEach((panel) => {
    panel.addEventListener("click", (e) => {
      if (e.target === panel) {
        registerInteraction();
        showView("morning");
      }
    });
  });

  document.querySelectorAll(".watch-tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      window.open(tile.dataset.url, "_blank", "noopener");
    });
  });

  function parseSpotifyEmbedUrl(input) {
    if (!input) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    // spotify:playlist:<id> URI form
    let m = trimmed.match(/^spotify:(playlist|album|track|artist|show|episode):([a-zA-Z0-9]+)/i);
    if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
    // open.spotify.com/[embed/]<type>/<id>[?...] — covers regular share
    // links, embed links, and links with a trailing ?si=... token.
    m = trimmed.match(/open\.spotify\.com\/(?:embed\/)?(playlist|album|track|artist|show|episode)\/([a-zA-Z0-9]+)/i);
    if (m) return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
    return null;
  }

  function renderSpotifyEmbed() {
    const embedUrl = parseSpotifyEmbedUrl(settings.spotifyUrl);
    if (embedUrl) {
      if (spotifyEmbed.src !== embedUrl) spotifyEmbed.src = embedUrl;
      spotifyEmbedWrap.hidden = false;
      spotifyEmptyState.hidden = true;
    } else {
      spotifyEmbed.removeAttribute("src");
      spotifyEmbedWrap.hidden = true;
      spotifyEmptyState.hidden = false;
    }
  }

  function openSpotify() {
    const url = settings.spotifyUrl && settings.spotifyUrl.trim()
      ? settings.spotifyUrl.trim()
      : "https://open.spotify.com";
    window.open(url, "_blank", "noopener");
  }

  musicPlayBtn.addEventListener("click", () => {
    registerInteraction();
    openSpotify();
  });

  // ---------- ambient / idle mode ----------

  let lastInteraction = Date.now();

  function registerInteraction() {
    lastInteraction = Date.now();
    if (appEl.classList.contains("idle")) {
      appEl.classList.remove("idle");
      document.body.classList.remove("app-idle-host");
      stopSlideshow();
    }
  }

  function idleTick() {
    const overlayOpen = !briefingOverlay.hidden || !settingsOverlay.hidden || !alertOverlay.hidden;
    const panelOpen = Object.values(panels).some((p) => !p.hidden);
    const idleMs = getIdleMs();
    if (!overlayOpen && !panelOpen && Date.now() - lastInteraction > idleMs) {
      if (!appEl.classList.contains("idle")) {
        appEl.classList.add("idle");
        document.body.classList.add("app-idle-host");
        startSlideshow();
      }
    }
  }

  ["mousemove", "touchstart", "keydown", "click", "wheel"].forEach((evt) => {
    window.addEventListener(evt, registerInteraction, { passive: true });
  });

  setInterval(idleTick, 1000);

  // ---------- morning briefing ----------

  let voices = [];

  function loadVoices() {
    voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    settingVoice.innerHTML = "";
    const autoOpt = document.createElement("option");
    autoOpt.value = "";
    autoOpt.textContent = "Default voice";
    settingVoice.appendChild(autoOpt);
    voices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      settingVoice.appendChild(opt);
    });
    settingVoice.value = settings.voiceURI || "";
  }

  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  function speak(text) {
    return new Promise((resolve) => {
      if (!settings.voiceEnabled || !window.speechSynthesis) {
        resolve();
        return;
      }
      const utter = new SpeechSynthesisUtterance(text);
      const chosen = voices.find((v) => v.voiceURI === settings.voiceURI);
      if (chosen) utter.voice = chosen;
      utter.rate = 0.98;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      utter.onend = finish;
      utter.onerror = finish;
      window.speechSynthesis.speak(utter);

      // Safety net only — real completion should come from onend. Kept
      // generous on purpose: a briefing that runs a bit long is far
      // better than one that cuts a sentence off mid-word, which is what
      // a tight estimate here caused (the next stage's speak() call
      // cancels whatever is still speaking when it starts).
      const safetyMs = Math.max(4000, text.length * 110) + 4000;
      setTimeout(finish, safetyMs);
    });
  }

  function splitSentences(text) {
    const parts = text.match(/[^.!?]+[.!?]+(\s+|$)/g);
    return parts && parts.length ? parts.map((s) => s.trim()).filter(Boolean) : [text];
  }

  async function speakStage(text) {
    // Speaking one sentence per utterance (rather than one long utterance
    // per stage) sidesteps a known issue where some speech engines
    // silently stop partway through very long single utterances.
    for (const sentence of splitSentences(text)) {
      if (!briefingActive) return;
      await speak(sentence);
    }
  }

  function pause(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function withTimeout(promise, ms) {
    // The underlying fetch has no built-in deadline, so a slow or stuck
    // connection (a wifi hiccup, Supabase briefly unreachable) would
    // otherwise block whatever awaited it indefinitely — confirmed, not
    // theoretical: a blocked connection during testing left the briefing
    // stuck on "One moment…" forever with no way out but the close
    // button. The fetch keeps running in the background either way and
    // will still update the data whenever/if it resolves.
    return Promise.race([promise, pause(ms)]);
  }

  let briefingActive = false;

  const BRIEFING_STAGE_LABELS = {
    greeting: "Greeting",
    weather: "Weather",
    calendar: "Calendar",
    media: "Your choice",
  };

  function setBriefingProgress(stageIndex, totalStages) {
    const pct = Math.round(((stageIndex + 1) / totalStages) * 100);
    if (briefingProgressBar) briefingProgressBar.style.width = `${pct}%`;
  }

  function resetBriefingProgress() {
    if (briefingProgressBar) briefingProgressBar.style.width = "0%";
    if (briefingProgressLabel) briefingProgressLabel.textContent = "Morning briefing";
  }

  async function runMorningBriefing() {
    briefingActive = true;
    briefingOverlay.hidden = false;
    briefingChoices.hidden = true;
    briefingText.textContent = "One moment…";
    briefingText.className = "briefing-text stage-visible";
    resetBriefingProgress();
    registerInteraction();

    // Refresh before speaking rather than trusting whatever the last
    // background sync happened to have (up to 5 minutes stale) — a
    // recent calendar/weather edit should always be reflected in the
    // thing that's about to be read aloud. Capped so a slow connection
    // doesn't block the whole briefing — proceeds with whatever data is
    // already on hand if the fetch takes too long.
    await withTimeout(loadFromSupabase(), 5000);
    updateDataSourceHint();
    if (!briefingActive) return;

    const stages = getMorningBriefing(settings.name);

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      if (!briefingActive) return;

      if (briefingProgressLabel) {
        briefingProgressLabel.textContent = BRIEFING_STAGE_LABELS[stage.stage] || "Morning briefing";
      }
      setBriefingProgress(i, stages.length);

      briefingText.classList.remove("stage-visible");
      briefingText.classList.add("stage-enter");
      await pause(200);
      briefingText.textContent = stage.text;
      briefingText.classList.remove("stage-enter");
      briefingText.classList.add("stage-visible");
      await speakStage(stage.text);
      if (!briefingActive) return;
      await pause(500);
    }

    if (!briefingActive) return;
    setBriefingProgress(stages.length, stages.length);
    if (briefingProgressLabel) briefingProgressLabel.textContent = "All set";
    briefingChoices.hidden = false;
  }

  function closeBriefing() {
    briefingActive = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    briefingOverlay.hidden = true;
    briefingChoices.hidden = true;
    resetBriefingProgress();
    registerInteraction();
  }

  async function finishBriefingWithClose(afterClose) {
    if (!settings.morningClose) {
      closeBriefing();
      if (afterClose) await afterClose();
      return;
    }

    briefingChoices.hidden = true;
    const closeText = getMorningCloseText(settings.name);
    briefingText.classList.remove("stage-visible");
    briefingText.classList.add("stage-enter");
    await pause(150);
    briefingText.textContent = closeText;
    briefingText.classList.remove("stage-enter");
    briefingText.classList.add("stage-visible");
    if (briefingProgressLabel) briefingProgressLabel.textContent = "All set";
    await speak(closeText);
    await pause(1200);
    closeBriefing();
    if (afterClose) await afterClose();
  }

  startMorningCard.addEventListener("click", () => {
    registerInteraction();
    runMorningBriefing();
  });

  if (vanityStartBtn) {
    vanityStartBtn.addEventListener("click", () => {
      registerInteraction();
      runMorningBriefing();
    });
  }

  briefingClose.addEventListener("click", closeBriefing);

  briefingChoices.addEventListener("click", async (e) => {
    const btn = e.target.closest(".choice-btn");
    if (!btn) return;
    const action = btn.dataset.action;

    const urls = {
      youtube: "https://www.youtube.com",
      netflix: "https://www.netflix.com",
      peacock: "https://www.peacocktv.com",
    };

    if (action === "music") {
      const hasEmbed = !!parseSpotifyEmbedUrl(settings.spotifyUrl);
      briefingText.textContent = hasEmbed ? "Starting your morning playlist." : "Opening Spotify.";
      await speak(briefingText.textContent);
      await finishBriefingWithClose(async () => {
        if (hasEmbed) {
          showView("music");
        } else {
          await pause(300);
          openSpotify();
        }
      });
    } else if (urls[action]) {
      window.open(urls[action], "_blank", "noopener");
      await finishBriefingWithClose();
    } else {
      await finishBriefingWithClose();
    }
  });

  // ---------- auto-start ----------

  function checkAutoStart() {
    if (!settings.autoStart || briefingActive || !settingsOverlay.hidden) return;
    const now = new Date();
    const [h, m] = (settings.startTime || "07:00").split(":").map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    const diffMs = now - target;
    const todayKey = now.toISOString().slice(0, 10);

    if (diffMs >= 0 && diffMs < 60000) {
      let lastRun = null;
      try {
        lastRun = localStorage.getItem(AUTOSTART_KEY);
      } catch {
        lastRun = null;
      }
      if (lastRun !== todayKey) {
        try {
          localStorage.setItem(AUTOSTART_KEY, todayKey);
        } catch {
          /* ignore */
        }
        runMorningBriefing();
      }
    }
  }

  // ---------- settings overlay ----------

  function openSettings() {
    settingName.value = settings.name;
    settingDevice.value = settings.deviceName;
    settingSpotifyUrl.value = settings.spotifyUrl || "";
    settingStartTime.value = settings.startTime;
    if (settingDisplayMode) settingDisplayMode.value = settings.displayMode || "standard";
    toggleVoice.setAttribute("aria-checked", String(settings.voiceEnabled));
    toggleAutoStart.setAttribute("aria-checked", String(settings.autoStart));
    if (toggleSlideshow) toggleSlideshow.setAttribute("aria-checked", String(settings.idleSlideshow));
    if (toggleMorningClose) toggleMorningClose.setAttribute("aria-checked", String(settings.morningClose));
    settingVoice.value = settings.voiceURI || "";
    updateWallpaperHint();
    updateSlideshowHint();
    renderRoutineSettingsList();
    updateDataSourceHint();
    loadCalendarFeeds();
    settingsOverlay.hidden = false;
    registerInteraction();
  }

  function closeSettings() {
    settingsOverlay.hidden = true;
    registerInteraction();
  }

  settingsBtn.addEventListener("click", openSettings);
  settingsClose.addEventListener("click", closeSettings);
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  [toggleVoice, toggleAutoStart, toggleSlideshow, toggleMorningClose].filter(Boolean).forEach((t) => {
    t.addEventListener("click", () => {
      const next = t.getAttribute("aria-checked") !== "true";
      t.setAttribute("aria-checked", String(next));
    });
  });

  wallpaperUploadBtn.addEventListener("click", () => wallpaperInput.click());

  wallpaperInput.addEventListener("change", async () => {
    const file = wallpaperInput.files[0];
    wallpaperInput.value = "";
    if (!file) return;

    registerInteraction();
    wallpaperHint.textContent = "Preparing photo…";
    wallpaperUploadBtn.disabled = true;

    try {
      const dataUrl = await compressWallpaperFile(file);
      applyWallpaper(dataUrl);

      if (persistWallpaper(dataUrl)) {
        wallpaperHint.textContent = "Wallpaper saved on this device.";
      } else {
        wallpaperHint.textContent =
          "Wallpaper applied for now, but it couldn't be saved — try a smaller photo.";
      }
    } catch {
      wallpaperHint.textContent = "Couldn't use that photo — try a different image.";
    } finally {
      wallpaperUploadBtn.disabled = false;
    }
  });

  wallpaperResetBtn.addEventListener("click", () => {
    registerInteraction();
    try {
      localStorage.removeItem(WALLPAPER_KEY);
    } catch {
      /* ignore */
    }
    wallpaperEl.classList.remove("custom");
    wallpaperEl.style.removeProperty("--custom-wallpaper");
    updateWallpaperHint();
    wallpaperHint.textContent = "Restored the default wallpaper.";
  });

  if (slideshowUploadBtn) {
    slideshowUploadBtn.addEventListener("click", () => slideshowInput.click());
  }

  if (slideshowInput) {
    slideshowInput.addEventListener("change", async () => {
      const files = [...slideshowInput.files];
      slideshowInput.value = "";
      if (!files.length) return;
      registerInteraction();
      slideshowHint.textContent = "Adding photos…";
      slideshowUploadBtn.disabled = true;
      try {
        for (const file of files.slice(0, 8)) {
          const dataUrl = await compressWallpaperFile(file, { maxEdge: 1600, quality: 0.8 });
          slideshowImages.push(dataUrl);
        }
        saveSlideshow(slideshowImages);
        updateSlideshowHint();
      } catch {
        slideshowHint.textContent = "Couldn't add those photos — try smaller images.";
      } finally {
        slideshowUploadBtn.disabled = false;
      }
    });
  }

  if (slideshowClearBtn) {
    slideshowClearBtn.addEventListener("click", () => {
      registerInteraction();
      slideshowImages = [];
      saveSlideshow([]);
      stopSlideshow();
      updateSlideshowHint();
      slideshowHint.textContent = "Slideshow cleared.";
    });
  }

  settingsSaveBtn.addEventListener("click", () => {
    settings = {
      ...settings,
      name: settingName.value.trim() || defaultSettings.name,
      deviceName: settingDevice.value.trim() || defaultSettings.deviceName,
      spotifyUrl: settingSpotifyUrl.value.trim(),
      voiceURI: settingVoice.value,
      voiceEnabled: toggleVoice.getAttribute("aria-checked") === "true",
      autoStart: toggleAutoStart.getAttribute("aria-checked") === "true",
      startTime: settingStartTime.value || defaultSettings.startTime,
      displayMode: settingDisplayMode ? settingDisplayMode.value : "standard",
      idleSlideshow: toggleSlideshow ? toggleSlideshow.getAttribute("aria-checked") === "true" : false,
      morningClose: toggleMorningClose ? toggleMorningClose.getAttribute("aria-checked") === "true" : true,
    };
    saveSettings();
    applyDisplayMode();
    renderStaticContent();
    renderClock();
    closeSettings();
    persistSettingsToSupabase();
  });

  nightModeBtn.addEventListener("click", () => {
    document.body.classList.toggle("night");
    nightModeBtn.textContent = document.body.classList.contains("night") ? "Day mode" : "Night mode";
  });

  // ---------- chime (synthesized — no audio file dependency) ----------

  let audioCtx = null;
  let chimeIntervalId = null;

  function ensureAudioContext() {
    // Browsers require an AudioContext to be created/resumed from a real
    // user gesture before it can produce sound — a timer or alarm can
    // fire with no gesture anywhere nearby, so this is called from clear,
    // deliberate gestures (starting a timer, adding an alarm) to "unlock"
    // audio ahead of time rather than only at the moment a chime is needed.
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }

  function playChime() {
    ensureAudioContext();
    if (!audioCtx) return;
    const playTone = (freq, startTime, duration) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    const playPattern = () => {
      const t = audioCtx.currentTime;
      playTone(880, t, 0.18);
      playTone(1108.7, t + 0.22, 0.18);
      playTone(1318.5, t + 0.44, 0.3);
    };
    playPattern();
    stopChime();
    chimeIntervalId = setInterval(playPattern, 2200);
  }

  function stopChime() {
    if (chimeIntervalId) {
      clearInterval(chimeIntervalId);
      chimeIntervalId = null;
    }
  }

  // ---------- shared timer/alarm alert ----------

  let snoozeContext = null;

  function fireAlert(text, { allowSnooze = false, snoozeMinutes = 5, kind = "timer" } = {}) {
    alertText.textContent = text;
    alertSnoozeBtn.hidden = !allowSnooze;
    alertSnoozeBtn.textContent = `Snooze ${snoozeMinutes} min`;
    snoozeContext = { kind, snoozeMinutes };
    alertOverlay.hidden = false;
    registerInteraction();
    playChime();
  }

  function dismissAlert() {
    alertOverlay.hidden = true;
    stopChime();
    registerInteraction();
  }

  alertDismissBtn.addEventListener("click", dismissAlert);

  alertSnoozeBtn.addEventListener("click", () => {
    const ctx = snoozeContext;
    dismissAlert();
    if (!ctx) return;
    if (ctx.kind === "timer") {
      startTimer(ctx.snoozeMinutes);
    } else if (ctx.kind === "alarm") {
      // Ephemeral on purpose — a snoozed alarm doesn't survive a reload,
      // same as most alarm clocks' snooze not surviving a power cycle.
      setTimeout(() => fireAlert(alertText.textContent, { allowSnooze: true, snoozeMinutes: ctx.snoozeMinutes, kind: "alarm" }), ctx.snoozeMinutes * 60000);
    }
  });

  // ---------- timer ----------

  const TIMER_KEY = "solace.timer";

  function loadTimerState() {
    try {
      const raw = localStorage.getItem(TIMER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveTimerState(state) {
    try {
      if (state) localStorage.setItem(TIMER_KEY, JSON.stringify(state));
      else localStorage.removeItem(TIMER_KEY);
    } catch {
      /* ignore */
    }
  }

  let timerState = loadTimerState(); // null | {endTs, durationMs} running | {pausedRemainingMs, durationMs} paused

  function formatMMSS(ms) {
    const totalSec = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function startTimer(minutes) {
    const durationMs = Math.round(minutes * 60000);
    timerState = { endTs: Date.now() + durationMs, durationMs };
    saveTimerState(timerState);
    renderTimerUI();
  }

  function pauseTimer() {
    if (!timerState || timerState.endTs == null) return;
    timerState = { pausedRemainingMs: Math.max(0, timerState.endTs - Date.now()), durationMs: timerState.durationMs };
    saveTimerState(timerState);
    renderTimerUI();
  }

  function resumeTimer() {
    if (!timerState || timerState.pausedRemainingMs == null) return;
    timerState = { endTs: Date.now() + timerState.pausedRemainingMs, durationMs: timerState.durationMs };
    saveTimerState(timerState);
    renderTimerUI();
  }

  function cancelTimer() {
    timerState = null;
    saveTimerState(null);
    renderTimerUI();
  }

  function renderTimerUI() {
    if (!timerState) {
      timerSetup.hidden = false;
      timerDisplay.hidden = true;
      timerBadge.hidden = true;
      return;
    }
    timerSetup.hidden = true;
    timerDisplay.hidden = false;
    timerBadge.hidden = false;

    const remaining = timerState.pausedRemainingMs != null ? timerState.pausedRemainingMs : timerState.endTs - Date.now();
    const label = formatMMSS(remaining);
    timerCountdown.textContent = label;
    timerBadgeText.textContent = label;
    timerPauseBtn.textContent = timerState.pausedRemainingMs != null ? "Resume" : "Pause";
  }

  function timerTick() {
    if (!timerState || timerState.pausedRemainingMs != null) return;
    const remaining = timerState.endTs - Date.now();
    if (remaining <= 0) {
      cancelTimer();
      fireAlert("Time's up!", { allowSnooze: true, snoozeMinutes: 5, kind: "timer" });
      return;
    }
    renderTimerUI();
  }

  document.querySelectorAll(".preset-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      registerInteraction();
      ensureAudioContext();
      startTimer(Number(chip.dataset.minutes));
    });
  });

  timerStartBtn.addEventListener("click", () => {
    registerInteraction();
    const minutes = Number(timerCustomMinutes.value);
    if (!minutes || minutes <= 0) return;
    ensureAudioContext();
    startTimer(minutes);
    timerCustomMinutes.value = "";
  });

  timerPauseBtn.addEventListener("click", () => {
    registerInteraction();
    if (timerState && timerState.pausedRemainingMs != null) resumeTimer();
    else pauseTimer();
  });

  timerCancelBtn.addEventListener("click", () => {
    registerInteraction();
    cancelTimer();
  });

  timerBadge.addEventListener("click", () => {
    registerInteraction();
    showView("timer");
  });

  setInterval(timerTick, 1000);

  // ---------- alarms ----------

  const ALARMS_KEY = "solace.alarms";
  const ALARM_FIRED_PREFIX = "solace.alarmFired.";

  function loadAlarms() {
    try {
      const raw = localStorage.getItem(ALARMS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveAlarms() {
    try {
      localStorage.setItem(ALARMS_KEY, JSON.stringify(alarms));
    } catch {
      /* ignore */
    }
  }

  let alarms = loadAlarms();

  function formatTimeHM(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  function renderAlarmList() {
    alarmList.innerHTML = "";
    if (!alarms.length) {
      const li = document.createElement("li");
      li.className = "feed-list-empty";
      li.textContent = "No alarms set.";
      alarmList.appendChild(li);
      return;
    }
    alarms
      .slice()
      .sort((a, b) => a.time.localeCompare(b.time))
      .forEach((alarm) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <span class="feed-info">
            <span class="feed-label">${formatTimeHM(alarm.time)}${alarm.label ? " — " + alarm.label : ""}</span>
          </span>
          <span class="alarm-actions">
            <button class="toggle" data-alarm-toggle="${alarm.id}" role="switch" aria-checked="${alarm.enabled}"><span class="toggle-knob"></span></button>
            <button class="feed-remove-btn" data-alarm-remove="${alarm.id}" aria-label="Remove alarm">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </span>`;
        alarmList.appendChild(li);
      });
  }

  addAlarmBtn.addEventListener("click", () => {
    registerInteraction();
    ensureAudioContext();
    const time = newAlarmTime.value;
    if (!time) return;
    alarms.push({ id: crypto.randomUUID(), time, label: newAlarmLabel.value.trim(), enabled: true });
    saveAlarms();
    newAlarmTime.value = "";
    newAlarmLabel.value = "";
    renderAlarmList();
  });

  alarmList.addEventListener("click", (e) => {
    registerInteraction();
    const toggleBtn = e.target.closest("[data-alarm-toggle]");
    if (toggleBtn) {
      const alarm = alarms.find((a) => a.id === toggleBtn.dataset.alarmToggle);
      if (alarm) {
        alarm.enabled = !alarm.enabled;
        saveAlarms();
        renderAlarmList();
      }
      return;
    }
    const removeBtn = e.target.closest("[data-alarm-remove]");
    if (removeBtn) {
      alarms = alarms.filter((a) => a.id !== removeBtn.dataset.alarmRemove);
      saveAlarms();
      renderAlarmList();
    }
  });

  function checkAlarms() {
    if (!alertOverlay.hidden) return; // don't stack a new alert on top of one already ringing
    const now = new Date();
    const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const todayKey = now.toISOString().slice(0, 10);
    for (const alarm of alarms) {
      if (!alarm.enabled || alarm.time !== nowStr) continue;
      const firedKey = ALARM_FIRED_PREFIX + alarm.id + "." + todayKey;
      if (localStorage.getItem(firedKey)) continue;
      try {
        localStorage.setItem(firedKey, "1");
      } catch {
        /* ignore */
      }
      fireAlert(alarm.label ? `Alarm — ${alarm.label}` : "Alarm", { allowSnooze: true, snoozeMinutes: 9, kind: "alarm" });
      break; // one at a time — the next tick will catch any others
    }
  }

  setInterval(checkAlarms, 20000);

  // ---------- init ----------

  async function init() {
    applyDisplayMode();
    applyWallpaperFromStorage();
    renderStaticContent();
    markDataLoading();
    renderClock();
    renderTimerUI();
    renderAlarmList();
    renderRoutineList();
    updateSlideshowHint();
    setInterval(renderClock, 1000 * 10);
    setInterval(checkAutoStart, 20000);
    showView("morning");

    await withTimeout(loadFromSupabase(), 8000);
    renderStaticContent({ animateWidgets: true });
    renderClock();
    updateDataSourceHint();

    setInterval(async () => {
      await withTimeout(loadFromSupabase(), 8000);
      renderStaticContent({ animateWidgets: true });
      updateDataSourceHint();
    }, 5 * 60 * 1000);
  }

  init();
})();
