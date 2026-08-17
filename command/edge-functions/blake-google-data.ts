/*
 * blake-google-data
 *
 * Returns a MERGED today's-Calendar agenda + Gmail attention summary
 * across every connected Google account (work, personal, etc.) for
 * Blake's Command Center. The browser never talks to Google directly —
 * it sends its opaque session token (see blake-google-oauth) as a bearer
 * token here, and this function does the real API calls server-side
 * using each account's stored access/refresh token.
 *
 * Deliberately conservative on Gmail: only fetches unread-message
 * metadata (From/Subject/Date headers) for a handful of messages per
 * account, prioritizing starred/important — never fetches message
 * bodies, even though the granted `gmail.readonly` scope would
 * technically allow it.
 *
 * GET  — validate session, return { accounts, calendar, gmail }
 * DELETE?email=... — validate session, disconnect that account
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
  "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

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

async function fetchCalendarEvents(accessToken: string, accountEmail: string) {
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

  return (data.items || [])
    .filter((e: any) => e.status !== "cancelled")
    .map((e: any) => {
      const isAllDay = !!e.start?.date;
      const start = isAllDay ? new Date(`${e.start.date}T00:00:00`) : new Date(e.start.dateTime);
      const end = isAllDay ? new Date(`${e.end.date}T00:00:00`) : new Date(e.end.dateTime);
      return {
        id: `${accountEmail}:${e.id}`,
        account: accountEmail,
        title: e.summary || "(No title)",
        location: e.location || null,
        meetingLink: meetingLinkFor(e),
        isAllDay,
        start: start.toISOString(),
        end: end.toISOString(),
        displayTime: isAllDay ? "All day" : start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
        isPast: !isAllDay && end.getTime() < now.getTime(),
      };
    });
}

async function fetchTomorrowFirstEvent(accessToken: string, accountEmail: string) {
  const now = new Date();
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);

  const params = new URLSearchParams({
    timeMin: tomorrowStart.toISOString(),
    timeMax: tomorrowEnd.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "1",
  });

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Tomorrow calendar fetch failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const first = (data.items || []).find((e: any) => e.status !== "cancelled");
  if (!first) return null;

  const isAllDay = !!first.start?.date;
  const start = isAllDay ? new Date(`${first.start.date}T00:00:00`) : new Date(first.start.dateTime);
  return {
    account: accountEmail,
    title: first.summary || "(No title)",
    displayTime: isAllDay ? "All day" : start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    start: start.toISOString(),
  };
}

async function fetchGmailSummary(accessToken: string, accountEmail: string) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const unreadLabelRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels/UNREAD", { headers: authHeader });
  const unreadLabel = unreadLabelRes.ok ? await unreadLabelRes.json() : null;
  const unreadCount = unreadLabel?.messagesUnread ?? 0;

  if (!unreadCount) return { unreadCount: 0, importantUnreadCount: 0, messages: [] };

  // A real inbox with years of unread mail is dominated by promotions/social
  // noise — "most recent unread" alone surfaces marketing junk, not anything
  // that needs Blake. category:primary excludes Gmail's own Promotions/
  // Social/Updates/Forums tabs, which does the heavy lifting here.
  const listRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread category:primary&maxResults=10",
    { headers: authHeader }
  );
  if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status} ${await listRes.text()}`);
  const listData = await listRes.json();
  const ids: string[] = (listData.messages || []).map((m: any) => m.id);

  // Cheap approximate count (no per-message fetch) for a genuine "needs a
  // look" signal, as opposed to the raw unread total which is mostly noise.
  const importantRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread (is:important OR is:starred)&maxResults=1",
    { headers: authHeader }
  );
  const importantData = importantRes.ok ? await importantRes.json() : null;
  const importantUnreadCount = importantData?.resultSizeEstimate ?? 0;

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
        id: `${accountEmail}:${id}`,
        account: accountEmail,
        sender: (senderMatch?.[1] || fromRaw).trim() || "(unknown)",
        subject: get("Subject") || "(no subject)",
        link: `https://mail.google.com/mail/u/0/#inbox/${id}`,
        starred: (msg.labelIds || []).includes("STARRED"),
        important: (msg.labelIds || []).includes("IMPORTANT"),
        internalDate: Number(msg.internalDate || 0),
      };
    })
  );

  return { unreadCount, importantUnreadCount, messages: messages.filter(Boolean) as any[] };
}

async function validateSession(supabase: any, req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const sessionToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!sessionToken) return false;

  const sessionHash = await sha256Hex(sessionToken);
  const { data: session } = await supabase
    .from("blake_command_sessions")
    .select("session_expiry")
    .eq("session_token_hash", sessionHash)
    .maybeSingle();

  return !!session && new Date(session.session_expiry) > new Date();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const sessionValid = await validateSession(supabase, req);
  if (!sessionValid) return jsonResponse({ error: "Not signed in or session expired" }, 401);

  const url = new URL(req.url);

  if (req.method === "DELETE") {
    const email = url.searchParams.get("email");
    if (!email) return jsonResponse({ error: "Missing email" }, 400);
    const { error: delErr } = await supabase.from("blake_google_accounts").delete().eq("email", email);
    if (delErr) return jsonResponse({ error: "Failed to disconnect account" }, 500);
    return jsonResponse({ ok: true });
  }

  const { data: accounts, error: accountsErr } = await supabase.from("blake_google_accounts").select("*");
  if (accountsErr) return jsonResponse({ error: "Failed to load connected accounts" }, 500);
  if (!accounts || !accounts.length) {
    return jsonResponse({ accounts: [], calendar: [], gmail: { unreadCount: 0, importantUnreadCount: 0, messages: [] }, tomorrow: null });
  }

  const results = await Promise.all(
    accounts.map(async (account: any) => {
      try {
        let accessToken = account.access_token;
        if (new Date(account.token_expiry) <= new Date(Date.now() + 60_000)) {
          const refreshed = await refreshAccessToken(account.refresh_token);
          accessToken = refreshed.access_token;
          await supabase
            .from("blake_google_accounts")
            .update({
              access_token: accessToken,
              token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("email", account.email);
        }
        const [calendar, gmail, tomorrowFirst] = await Promise.all([
          fetchCalendarEvents(accessToken, account.email),
          fetchGmailSummary(accessToken, account.email),
          fetchTomorrowFirstEvent(accessToken, account.email),
        ]);
        return { email: account.email, ok: true, calendar, gmail, tomorrowFirst };
      } catch (err) {
        console.error(`blake-google-data: failed for ${account.email}:`, err);
        return { email: account.email, ok: false, calendar: [] as any[], gmail: { unreadCount: 0, importantUnreadCount: 0, messages: [] as any[] }, tomorrowFirst: null as any };
      }
    })
  );

  // Merge across accounts. Calendar: one chronological list. Gmail:
  // summed unread count, top messages across all accounts combined
  // (starred/important first, then most recent), capped so this stays a
  // glance, not a second inbox.
  const calendar = results
    .flatMap((r) => r.calendar)
    .sort((a: any, b: any) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const timed = calendar.filter((e: any) => !e.isAllDay);
  timed.forEach((e: any, i: number) => {
    e.overlaps = timed.some(
      (other: any, j: number) => i !== j && new Date(e.start) < new Date(other.end) && new Date(other.start) < new Date(e.end)
    );
  });
  const next = timed.find((e: any) => !e.isPast);
  if (next) next.isNext = true;

  const unreadCount = results.reduce((sum, r) => sum + (r.gmail.unreadCount || 0), 0);
  const importantUnreadCount = results.reduce((sum, r) => sum + (r.gmail.importantUnreadCount || 0), 0);
  const allMessages = results.flatMap((r) => r.gmail.messages);
  allMessages.sort((a: any, b: any) => {
    const score = (m: any) => (m.starred ? 2 : 0) + (m.important ? 1 : 0);
    const s = score(b) - score(a);
    return s !== 0 ? s : b.internalDate - a.internalDate;
  });

  // Earliest first event across all accounts tomorrow — a one-line preview,
  // not a full agenda, so only the single soonest event across everyone's
  // calendar is worth surfacing.
  const tomorrowCandidates = results.map((r: any) => r.tomorrowFirst).filter(Boolean) as any[];
  tomorrowCandidates.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const tomorrow = tomorrowCandidates[0] || null;

  return jsonResponse({
    accounts: accounts.map((a: any) => ({ email: a.email, label: a.label })),
    accountErrors: results.filter((r) => !r.ok).map((r) => r.email),
    calendar,
    gmail: { unreadCount, importantUnreadCount, messages: allMessages.slice(0, 6) },
    tomorrow,
  });
});
