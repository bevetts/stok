/*
 * blake-google-data
 *
 * Returns today's Google Calendar agenda + a Gmail attention summary for
 * Blake's Command Center. The browser never talks to Google directly —
 * it sends its opaque session token (see blake-google-oauth) as a bearer
 * token here, and this function does the real API calls server-side
 * using the stored access/refresh token.
 *
 * Deliberately conservative on Gmail: only fetches unread-message
 * metadata (From/Subject/Date headers) for a handful of messages,
 * prioritizing starred/important — never fetches message bodies, even
 * though the granted `gmail.readonly` scope would technically allow it.
 *
 * Required Supabase secrets (shared with blake-google-oauth):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

async function refreshAccessToken(refreshToken: string) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function meetingLinkFor(event: any): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const entryPoints = event.conferenceData?.entryPoints || [];
  const video = entryPoints.find((e: any) => e.entryPointType === "video");
  return video?.uri || null;
}

async function fetchCalendarEvents(accessToken: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

  const params = new URLSearchParams({
    timeMin: startOfDay,
    timeMax: endOfDay,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "25",
  });

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status} ${await res.text()}`);
  const data = await res.json();

  const events = (data.items || [])
    .filter((e: any) => e.status !== "cancelled")
    .map((e: any) => {
      const isAllDay = !!e.start?.date;
      const start = isAllDay ? new Date(`${e.start.date}T00:00:00`) : new Date(e.start.dateTime);
      const end = isAllDay ? new Date(`${e.end.date}T00:00:00`) : new Date(e.end.dateTime);
      return {
        id: e.id,
        title: e.summary || "(No title)",
        location: e.location || null,
        meetingLink: meetingLinkFor(e),
        isAllDay,
        start: start.toISOString(),
        end: end.toISOString(),
        displayTime: isAllDay
          ? "All day"
          : start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
        isPast: !isAllDay && end.getTime() < now.getTime(),
      };
    });

  // Overlap + "next" flags, computed once server-side so the client just renders.
  const timed = events.filter((e: any) => !e.isAllDay);
  timed.forEach((e: any, i: number) => {
    e.overlaps = timed.some((other: any, j: number) => {
      if (i === j) return false;
      return new Date(e.start) < new Date(other.end) && new Date(other.start) < new Date(e.end);
    });
  });
  const next = timed.find((e: any) => !e.isPast);
  if (next) next.isNext = true;

  return events;
}

async function fetchGmailSummary(accessToken: string) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const unreadLabelRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels/UNREAD", { headers: authHeader });
  const unreadLabel = unreadLabelRes.ok ? await unreadLabelRes.json() : null;
  const unreadCount = unreadLabel?.messagesUnread ?? 0;

  if (!unreadCount) return { unreadCount: 0, messages: [] };

  const listRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=8",
    { headers: authHeader }
  );
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status} ${await listRes.text()}`);
  const listData = await listRes.json();
  const ids: string[] = (listData.messages || []).map((m: any) => m.id);

  const messages = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: authHeader }
      );
      if (!res.ok) return null;
      const msg = await res.json();
      const headers = msg.payload?.headers || [];
      const get = (name: string) => headers.find((h: any) => h.name === name)?.value || "";
      const fromRaw = get("From");
      const senderMatch = fromRaw.match(/^"?([^"<]*)"?\s*<?/);
      return {
        id,
        sender: (senderMatch?.[1] || fromRaw).trim() || "(unknown)",
        subject: get("Subject") || "(no subject)",
        link: `https://mail.google.com/mail/u/0/#inbox/${id}`,
        starred: (msg.labelIds || []).includes("STARRED"),
        important: (msg.labelIds || []).includes("IMPORTANT"),
        internalDate: Number(msg.internalDate || 0),
      };
    })
  );

  const usable = messages.filter(Boolean) as any[];
  usable.sort((a, b) => {
    const score = (m: any) => (m.starred ? 2 : 0) + (m.important ? 1 : 0);
    const s = score(b) - score(a);
    return s !== 0 ? s : b.internalDate - a.internalDate;
  });

  return { unreadCount, messages: usable.slice(0, 5) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") || "";
  const sessionToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: "Missing session token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: row, error: rowErr } = await supabase.from("blake_google_tokens").select("*").eq("id", 1).maybeSingle();
  if (rowErr || !row) {
    return new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sessionHash = await sha256Hex(sessionToken);
  const sessionValid =
    row.session_token_hash === sessionHash && row.session_expiry && new Date(row.session_expiry) > new Date();
  if (!sessionValid) {
    return new Response(JSON.stringify({ error: "Session expired" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let accessToken = row.access_token;
    if (new Date(row.token_expiry) <= new Date(Date.now() + 60_000)) {
      const refreshed = await refreshAccessToken(row.refresh_token);
      accessToken = refreshed.access_token;
      await supabase
        .from("blake_google_tokens")
        .update({
          access_token: accessToken,
          token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);
    }

    const [calendar, gmail] = await Promise.all([fetchCalendarEvents(accessToken), fetchGmailSummary(accessToken)]);

    return new Response(JSON.stringify({ calendar, gmail }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("blake-google-data error:", err);
    return new Response(JSON.stringify({ error: "Failed to load Google data" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
