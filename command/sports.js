/*
 * Sports — one line each for Blake's two teams, in the Briefing section.
 *
 * Both sources are free, key-free, and CORS-open (verified: both return
 * `Access-Control-Allow-Origin: *`), so unlike Calendar/Gmail this fetches
 * straight from the browser — no secret to protect, no edge function to
 * deploy. MLB Stats API is the Mariners' own official schedule/score feed;
 * TheSportsDB is a free community sports database used for the Blazers
 * since the NBA's official stats API blocks non-browser traffic.
 */

const MARINERS_TEAM_ID = 136; // MLB Stats API team id
const BLAZERS_TEAM_ID = "134888"; // TheSportsDB team id

const RECENT_GAME_WINDOW_MS = 20 * 60 * 60 * 1000; // show a final score as "recent" for ~20h, then fall back to "next"

async function fetchMarinersLine() {
  try {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 2);
    const end = new Date(today);
    end.setDate(end.getDate() + 6);
    const fmt = (d) => d.toISOString().slice(0, 10);

    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?teamId=${MARINERS_TEAM_ID}&sportId=1&startDate=${fmt(start)}&endDate=${fmt(end)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const games = (data.dates || [])
      .flatMap((d) => d.games || [])
      .sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));

    const describe = (g) => {
      const home = g.teams.home;
      const away = g.teams.away;
      const marinersHome = home.team.id === MARINERS_TEAM_ID;
      const opponent = marinersHome ? away.team.name : home.team.name;
      const marinersScore = marinersHome ? home.score : away.score;
      const oppScore = marinersHome ? away.score : home.score;
      return { opponent, marinersScore, oppScore, date: g.gameDate, status: g.status.abstractGameState };
    };

    const live = games.find((g) => g.status.abstractGameState === "Live");
    if (live) {
      const d = describe(live);
      return `${d.marinersScore}-${d.oppScore} vs ${d.opponent} (live)`;
    }

    const now = Date.now();
    const recentFinal = games
      .filter((g) => g.status.abstractGameState === "Final")
      .map(describe)
      .filter((d) => now - new Date(d.date).getTime() < RECENT_GAME_WINDOW_MS)
      .pop();
    if (recentFinal) {
      const outcome = recentFinal.marinersScore > recentFinal.oppScore ? "W" : "L";
      return `${outcome} ${recentFinal.marinersScore}-${recentFinal.oppScore} vs ${recentFinal.opponent}`;
    }

    const upcoming = games.find((g) => new Date(g.gameDate).getTime() > now && g.status.abstractGameState !== "Final");
    if (upcoming) {
      const d = describe(upcoming);
      const when = new Date(upcoming.gameDate).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
      return `Next: vs ${d.opponent}, ${when}`;
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchBlazersLine() {
  try {
    const [lastRes, nextRes] = await Promise.all([
      fetch(`https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${BLAZERS_TEAM_ID}`),
      fetch(`https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${BLAZERS_TEAM_ID}`),
    ]);
    const lastData = lastRes.ok ? await lastRes.json() : null;
    const nextData = nextRes.ok ? await nextRes.json() : null;
    const last = lastData?.results?.[0] || null;
    const next = nextData?.events?.[0] || null;

    const now = Date.now();
    if (last && last.intHomeScore != null && last.intAwayScore != null) {
      const lastTime = new Date(`${last.dateEvent}T${last.strTime || "00:00:00"}Z`).getTime();
      if (now - lastTime < RECENT_GAME_WINDOW_MS) {
        const blazersHome = last.idHomeTeam === BLAZERS_TEAM_ID;
        const blazersScore = blazersHome ? last.intHomeScore : last.intAwayScore;
        const oppScore = blazersHome ? last.intAwayScore : last.intHomeScore;
        const opponent = blazersHome ? last.strAwayTeam : last.strHomeTeam;
        const outcome = Number(blazersScore) > Number(oppScore) ? "W" : "L";
        return `${outcome} ${blazersScore}-${oppScore} vs ${opponent}`;
      }
    }

    if (next) {
      const blazersHome = next.idHomeTeam === BLAZERS_TEAM_ID;
      const opponent = blazersHome ? next.strAwayTeam : next.strHomeTeam;
      const when = new Date(`${next.dateEvent}T${next.strTime || "00:00:00"}Z`).toLocaleString(undefined, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
      return `Next: vs ${opponent}, ${when}`;
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchSportsLines() {
  const [mariners, blazers] = await Promise.all([fetchMarinersLine(), fetchBlazersLine()]);
  return [
    { team: "Mariners", line: mariners },
    { team: "Trail Blazers", line: blazers },
  ];
}
