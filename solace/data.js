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
  const { currentTemp, condition, high, low, rainChance } = solaceData.weather;
  let rainNote = "";
  if (rainChance >= 50) {
    rainNote = ` There's a good chance of rain, so plan for that.`;
  } else if (rainChance >= 20) {
    rainNote = ` There's a small chance of rain this afternoon.`;
  }
  return {
    currentTemp,
    condition,
    high,
    low,
    rainChance,
    spoken: `It is currently ${currentTemp} degrees and ${condition.toLowerCase()}. Today's high is ${high}, with a low of ${low}.${rainNote}`,
    short: `${condition} · High ${high}° · Low ${low}°`,
  };
}

function getNextEvent() {
  return solaceData.calendar[0] || null;
}

function getCalendarSummary() {
  const events = solaceData.calendar;
  if (!events.length) {
    return { events, spoken: "You have a light day — nothing on the calendar yet." };
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

function getContextualSentence() {
  const weather = getWeatherSummary();
  const next = getNextEvent();
  if (next && next.leaveBy) {
    return `It's going to be a beautiful day. Leave by ${next.leaveBy} for your ${next.time} appointment.`;
  }
  if (weather.rainChance >= 50) {
    return "Bring an umbrella — rain is likely later today.";
  }
  return "It's going to be a beautiful day. Ready when you are.";
}
