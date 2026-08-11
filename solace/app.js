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
  const AUTOSTART_KEY = "solace.lastAutoStart";
  const IDLE_MS = 30000;

  const defaultSettings = {
    name: "Chayla",
    deviceName: "Solace",
    voiceURI: "",
    voiceEnabled: true,
    autoStart: false,
    startTime: "07:00",
    spotifyUrl: "",
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
  const statusTempEl = el("statusTemp");
  const avatarInitialEl = el("avatarInitial");
  const profileNameEl = el("profileName");

  const weatherTempPreview = el("weatherTempPreview");
  const weatherCondPreview = el("weatherCondPreview");
  const weatherHighLowPreview = el("weatherHighLowPreview");
  const nextEventTime = el("nextEventTime");
  const nextEventTitle = el("nextEventTitle");
  const nextEventLeaveBy = el("nextEventLeaveBy");

  const dock = el("dock");
  const panels = {
    weather: el("panel-weather"),
    calendar: el("panel-calendar"),
    music: el("panel-music"),
    watch: el("panel-watch"),
  };

  const startMorningCard = el("startMorningCard");
  const briefingOverlay = el("briefingOverlay");
  const briefingText = el("briefingText");
  const briefingChoices = el("briefingChoices");
  const briefingClose = el("briefingClose");

  const settingsBtn = el("settingsBtn");
  const settingsOverlay = el("settingsOverlay");
  const settingsClose = el("settingsClose");
  const settingName = el("settingName");
  const settingDevice = el("settingDevice");
  const settingSpotifyUrl = el("settingSpotifyUrl");
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
      wallpaperEl.style.setProperty("--custom-wallpaper", `url(${dataUrl})`);
      wallpaperEl.classList.add("custom");
    } else {
      wallpaperEl.classList.remove("custom");
    }
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
    // The bundled fallback numbers are plausible-looking real weather —
    // without this, "still loading" and "loaded but stuck on fallback"
    // look identical. Cleared by renderStaticContent() once the first
    // Supabase attempt (success or failure) resolves.
    statusTempEl.textContent = "…";
    weatherTempPreview.textContent = "…";
    weatherCondPreview.textContent = "Checking…";
    weatherHighLowPreview.textContent = "";
    nextEventTime.textContent = "…";
    nextEventTitle.textContent = "Checking your day…";
    nextEventLeaveBy.textContent = "";
  }

  function renderStaticContent() {
    profileNameEl.textContent = settings.name;
    avatarInitialEl.textContent = settings.name.charAt(0).toUpperCase() || "S";
    document.title = settings.deviceName || "Solace";

    renderSpotifyEmbed();

    contextLineEl.textContent = getContextualSentence();

    const weather = getWeatherSummary();
    statusTempEl.textContent = `${weather.currentTemp}°`;
    weatherTempPreview.textContent = `${weather.currentTemp}°`;
    weatherCondPreview.textContent = weather.condition;
    weatherHighLowPreview.textContent = `High ${weather.high}° · Low ${weather.low}°`;

    const next = getNextEvent();
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
    }
  }

  function idleTick() {
    const overlayOpen = !briefingOverlay.hidden || !settingsOverlay.hidden;
    const panelOpen = Object.values(panels).some((p) => !p.hidden);
    if (!overlayOpen && !panelOpen && Date.now() - lastInteraction > IDLE_MS) {
      appEl.classList.add("idle");
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

  async function runMorningBriefing() {
    briefingActive = true;
    briefingOverlay.hidden = false;
    briefingChoices.hidden = true;
    briefingText.textContent = "One moment…";
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

    for (const stage of stages) {
      if (!briefingActive) return;
      briefingText.style.opacity = 0;
      await pause(150);
      briefingText.textContent = stage.text;
      briefingText.style.opacity = 1;
      await speakStage(stage.text);
      if (!briefingActive) return;
      await pause(500);
    }

    if (!briefingActive) return;
    briefingChoices.hidden = false;
  }

  function closeBriefing() {
    briefingActive = false;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    briefingOverlay.hidden = true;
    registerInteraction();
  }

  startMorningCard.addEventListener("click", () => {
    registerInteraction();
    runMorningBriefing();
  });

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
      closeBriefing();
      if (hasEmbed) {
        showView("music");
      } else {
        await pause(300);
        openSpotify();
      }
    } else if (urls[action]) {
      window.open(urls[action], "_blank", "noopener");
      closeBriefing();
    } else {
      closeBriefing();
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
    toggleVoice.setAttribute("aria-checked", String(settings.voiceEnabled));
    toggleAutoStart.setAttribute("aria-checked", String(settings.autoStart));
    settingVoice.value = settings.voiceURI || "";
    wallpaperHint.textContent = "";
    updateDataSourceHint();
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

  [toggleVoice, toggleAutoStart].forEach((t) => {
    t.addEventListener("click", () => {
      const next = t.getAttribute("aria-checked") !== "true";
      t.setAttribute("aria-checked", String(next));
    });
  });

  wallpaperUploadBtn.addEventListener("click", () => wallpaperInput.click());

  wallpaperInput.addEventListener("change", () => {
    const file = wallpaperInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      try {
        localStorage.setItem(WALLPAPER_KEY, dataUrl);
        wallpaperHint.textContent = "Wallpaper saved.";
      } catch {
        wallpaperHint.textContent =
          "That photo is too large to save locally, but it's applied for this session.";
      }
      wallpaperEl.style.setProperty("--custom-wallpaper", `url(${dataUrl})`);
      wallpaperEl.classList.add("custom");
    };
    reader.onerror = () => {
      wallpaperHint.textContent = "Couldn't read that photo — try a different file.";
    };
    reader.readAsDataURL(file);
  });

  wallpaperResetBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem(WALLPAPER_KEY);
    } catch {
      /* ignore */
    }
    wallpaperEl.classList.remove("custom");
    wallpaperHint.textContent = "Restored the default wallpaper.";
  });

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
    };
    saveSettings();
    renderStaticContent();
    renderClock();
    closeSettings();
    persistSettingsToSupabase();
  });

  nightModeBtn.addEventListener("click", () => {
    document.body.classList.toggle("night");
    nightModeBtn.textContent = document.body.classList.contains("night") ? "Day mode" : "Night mode";
  });

  // ---------- init ----------

  async function init() {
    applyWallpaperFromStorage();
    renderStaticContent();
    markDataLoading();
    renderClock();
    setInterval(renderClock, 1000 * 10);
    setInterval(checkAutoStart, 20000);
    showView("morning");

    await withTimeout(loadFromSupabase(), 8000);
    renderStaticContent();
    renderClock();
    updateDataSourceHint();

    setInterval(async () => {
      await withTimeout(loadFromSupabase(), 8000);
      renderStaticContent();
      updateDataSourceHint();
    }, 5 * 60 * 1000);
  }

  init();
})();
