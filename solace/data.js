/*
 * Solace OS — data layer
 *
 * Everything the UI shows is derived through the helper functions below.
 * `solaceData` holds whatever was last loaded (from Supabase, or the
 * built-in defaults if that hasn't happened yet) — the UI never touches
 * a data source directly, only these functions.
 */

const solaceData = {
  user: {
    name: "Chayla",
  },
  weather: {
    currentTemp: 64,
    condition: "Clear",
    high: 76,
    low: 58,
    rainChance: 30,
    sunrise: null,
    sunset: null,
    aqi: null,
    aqiCategory: null,
    forecastPeriods: [],
    locationLabel: "",
  },
  calendar: [
    {
      time: "9:00 AM",
      title: "Morning appointment",
      location: "",
      leaveBy: "8:25 AM",
    },
    {
      time: "12:30 PM",
      title: "Lunch with Mom",
      location: "La Provence",
    },
    {
      time: "5:45 PM",
      title: "Cheer practice",
      location: "",
      leaveBy: "5:15 PM",
    },
  ],
};

function getWeatherSummary() {
  const {
    currentTemp, condition, high, low, rainChance,
    sunrise, sunset, aqi, aqiCategory, forecastPeriods, locationLabel,
  } = solaceData.weather;

  let rainNote = "";
  if (rainChance >= 50) {
    rainNote = ` There's a good chance of rain, so plan for that.`;
  } else if (rainChance >= 20) {
    rainNote = ` There's a small chance of rain this afternoon.`;
  }

  // Only mentioned aloud when it's actually worth knowing — routine
  // "Good" air quality doesn't need a place in a 45-second briefing.
  let airNote = "";
  if (aqi != null && aqi > 100) {
    airNote = ` Air quality is ${aqiCategory.toLowerCase()} today.`;
  }

  return {
    currentTemp,
    condition,
    high,
    low,
    rainChance,
    sunrise,
    sunset,
    aqi,
    aqiCategory,
    forecastPeriods: forecastPeriods || [],
    locationLabel,
    spoken: `It is currently ${currentTemp} degrees and ${condition.toLowerCase()}. Today's high is ${high}, with a low of ${low}.${rainNote}${airNote}`,
    short: `${condition} · High ${high}° · Low ${low}°`,
  };
}

// Events carry a plain YYYY-MM-DD `date` (the Pacific calendar day they
// belong to) and a `time` string like "4:30 PM" or "All day". Comparing
// against "now" is done in those same terms rather than storing a real
// timestamp, since that's all the sync currently gives us to work with.
function pacificToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDisplayTimeMinutes(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null; // "All day" and anything unrecognized never counts as past
  let hour = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) hour += 12;
  return hour * 60 + parseInt(m[2], 10);
}

function nowMinutesPacific() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (h === 24 ? 0 : h) * 60 + m;
}

function isEventPast(ev) {
  if (!ev.date || ev.date !== pacificToday()) return false; // only today's own events can be "past"
  const mins = parseDisplayTimeMinutes(ev.time);
  if (mins == null) return false; // all-day events are never struck through
  return mins < nowMinutesPacific();
}

function getNextEvent() {
  return solaceData.calendar.find((ev) => !isEventPast(ev)) || null;
}

function getCalendarSummary() {
  const today = pacificToday();
  const events = solaceData.calendar.filter((ev) => (!ev.date || ev.date === today) && !isEventPast(ev));
  if (!events.length) {
    return { events, spoken: "You have a light day — nothing left on the calendar today." };
  }

  const [first, ...rest] = events;
  let spoken = "";

  if (first.leaveBy) {
    spoken += `Your first appointment is ${first.title.toLowerCase()} at ${first.time}. You should leave around ${first.leaveBy}. `;
  } else {
    spoken += `First up, ${first.title.toLowerCase()} at ${first.time}. `;
  }

  if (rest.length === 1) {
    const e = rest[0];
    spoken += `You also have ${e.title.toLowerCase()} at ${e.time}${e.leaveBy ? `, leave by ${e.leaveBy}` : ""}.`;
  } else if (rest.length > 1) {
    const parts = rest.map((e) => `${e.title.toLowerCase()} at ${e.time}${e.leaveBy ? " — leave by " + e.leaveBy : ""}`);
    const last = parts.pop();
    spoken += `You also have ${parts.join(", ")}, and ${last}.`;
  }

  return { events, spoken: spoken.trim() };
}

function getMorningBriefing(name) {
  const weather = getWeatherSummary();
  const calendar = getCalendarSummary();

  return [
    { stage: "greeting", text: `Good morning, ${name}.` },
    { stage: "weather", text: weather.spoken },
    { stage: "calendar", text: calendar.spoken },
    { stage: "media", text: "Would you like some music or something to watch while you get ready?" },
  ];
}

function getDayPeriod(hour) {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function getContextualSentence() {
  const hour = new Date().getHours();
  const period = getDayPeriod(hour);
  const weather = getWeatherSummary();
  const next = getNextEvent();

  if (period === "morning") {
    if (next && next.leaveBy) {
      return `It's going to be a beautiful day. Leave by ${next.leaveBy} for your ${next.time} appointment.`;
    }
    if (weather.rainChance >= 50) {
      return "Bring an umbrella — rain is likely later today.";
    }
    return "It's going to be a beautiful day. Ready when you are.";
  }

  if (period === "afternoon") {
    if (next && next.leaveBy) {
      return `Leave by ${next.leaveBy} for ${next.title} at ${next.time}.`;
    }
    if (next) {
      return `Coming up: ${next.title} at ${next.time}.`;
    }
    if (weather.rainChance >= 50) {
      return "Rain is likely later — plan ahead if you're heading out.";
    }
    return "Afternoon's here. One thing at a time.";
  }

  // Evening — wind-down copy; skip leave-by (today's rush is over)
  if (weather.rainChance >= 50) {
    return "Rain may linger tonight — stay cozy.";
  }
  return "The day did its part. Rest easy tonight.";
}

const QUOTES = {
  morning: [
    "Your day is already unfolding. Let's make it a good one.",
    "Small steps this morning become big wins by tonight.",
    "Breathe in the calm — you've got this.",
    "Today is a blank page. Write something beautiful.",
  ],
  afternoon: [
    "You're halfway through — keep your pace gentle and steady.",
    "A pause now is not a setback. It's wisdom.",
    "The afternoon light is on your side.",
    "One thing at a time. That's always enough.",
  ],
  evening: [
    "The day did its part. Now let yourself unwind.",
    "Rest is not a reward — it's a requirement.",
    "Tomorrow will meet you when it's ready.",
    "You showed up today. That matters.",
  ],
};

function getQuoteLine() {
  const hour = new Date().getHours();
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const pool = QUOTES[period];
  const dayIndex = new Date().getDate() % pool.length;
  return pool[dayIndex];
}

function getGlanceLine() {
  const next = getNextEvent();
  if (next && next.leaveBy) {
    return `Leave by ${next.leaveBy} · ${next.title} at ${next.time}`;
  }
  if (next) {
    return `${next.title} at ${next.time}`;
  }
  const weather = getWeatherSummary();
  return `${weather.currentTemp}° and ${weather.condition.toLowerCase()} — a light morning ahead.`;
}

function getMorningCloseText(name) {
  const lines = [
    `You're set, ${name}. Go gently.`,
    `The day can wait. You've got this, ${name}.`,
    `Ready when you are, ${name}.`,
  ];
  return lines[new Date().getDate() % lines.length];
}

const DEFAULT_ROUTINE = ["Water", "Vitamins", "Pack bag"];
