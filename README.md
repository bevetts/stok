# stok

## Apps in this repo

- **`solace/`** — Chayla's Solace OS morning command center.
- **`command/`** — Blake's personal Command Center. See below.
- **`shared/`** — plain-script helpers reused by both (`storage.js`, `weather.js`). No build step, no bundler — just `<script>` tags, matching the rest of the repo.

Both are static sites (no framework, no build) backed by the same Supabase project. Whatever serves this repo should serve the repo root directly, so each app is reachable at its own path (`/solace/`, `/command/`).

## Running locally

No build step. From the repo root:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000/solace/` or `http://localhost:8000/command/`.

## Blake's Command Center (`/command/`)

A compact personal dashboard — today's actionable stuff, not a metrics dashboard. Local tasks and quick links persist in `localStorage` under the `blake_command_*` namespace, kept deliberately separate from Solace's `solace.*` keys and Supabase tables so the two apps' data can never collide.

Sections: Now (actionable-only summary) · To-dos (local) · Today's agenda (Google Calendar) · Gmail attention · Weather (reused from Solace) · Quick launch (local links) · Needs attention (collapsible) · Briefing (collapsible, lower priority).

### Weather

Reuses Solace's existing `solace_weather` table directly (same household, no reason for a second weather source/provider).

### Google sign-in + Calendar + Gmail

The whole `/command/` route sits behind Google sign-in — only allow-listed Google accounts (Blake's) can use it, since it shows real calendar/inbox data. There's no separate password: signing in with an allowed Google account **is** the access gate.

**Multiple Google accounts** (e.g. work + personal) can be connected at once — "Sign in" and "+ Add account" are the same flow, forcing Google's account chooser (`prompt=consent select_account`) so a second click lets you pick a different account instead of re-adding the first. Today's Calendar agenda and the Gmail attention summary are **merged** across every connected account into one chronological/prioritized list, each item tagged with a small color-coded dot for its source account (the dots only appear once 2+ accounts are connected — a single account stays untagged). Account chips at the top of the dashboard show what's connected, with a "×" to disconnect any one of them.

Architecture (all new, none of this existed in the repo before):

- `blake_command_sessions` — one row per browser granted access to the dashboard (session token hash + expiry). Separate from Google account tokens, since "can this browser use the dashboard" and "which Google accounts feed it data" are different questions once more than one account is involved.
- `blake_google_accounts` — one row per connected Google account, keyed by email, holding that account's access/refresh token. Both tables have RLS enabled with **zero policies**, so they're unreachable from the browser (anon/authenticated roles) entirely — only the service-role key, used exclusively by the two Edge Functions below, can touch them.
- `blake-google-oauth` Edge Function — handles the OAuth callback: exchanges the auth code for tokens, checks the signed-in account's email against `ALLOWED_EMAILS`, upserts that account's tokens (without touching any other connected account), and mints a fresh opaque session token (only its SHA-256 hash is stored). The Google Client Secret lives only here, as a Supabase secret — never in frontend code.
- `blake-google-data` Edge Function — given a valid session token (sent as `Authorization: Bearer ...`), refreshes each connected account's Google access token as needed, fetches Calendar + Gmail per account, and returns a single merged/sorted payload. `DELETE .../blake-google-data?email=...` disconnects one account. The browser never talks to Google directly.

No cookies, no session middleware — a random bearer token in `localStorage`, checked against a stored hash server-side. Appropriate for a single-user (multi-*account*) personal app; would need revisiting for anything genuinely multi-*user*.

Source for both functions lives in `command/edge-functions/` for reference — **they still need to be deployed to Supabase** (this environment's Supabase MCP access couldn't push a deploy directly; use the Supabase dashboard's Edge Functions → Deploy, pasting each file's contents in as `index.ts`).

#### Required Supabase Edge Function secrets

Set these on the Supabase project (Dashboard → Edge Functions → Manage secrets, or `supabase secrets set`):

| Secret | Used by | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | both | Must match the constant in `command/app.js` |
| `GOOGLE_CLIENT_SECRET` | `blake-google-oauth` | Never committed, never sent to the browser |
| `ALLOWED_EMAILS` | `blake-google-oauth` | Comma-separated list, e.g. `blake@x.com,blake@work.com` — any of these can sign in and connect an account |
| `COMMAND_APP_URL` | `blake-google-oauth` | Fixed redirect target after sign-in: `https://bevetts.github.io/stok/command/index.html` — deliberately not client-supplied, to avoid an open-redirect that could leak a session token |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are already available to every Edge Function automatically.

Deploy both functions with **`verify_jwt` disabled** — `blake-google-oauth` is called by Google's redirect (no Supabase JWT at all), and `blake-google-data` uses its own bearer-session-token scheme instead of Supabase Auth.

#### Google Cloud setup

1. Google Cloud Console → APIs & Services → Credentials → OAuth Client ID → **Web application**.
2. Enable the **Calendar API** and **Gmail API**.
3. Authorized redirect URI: `https://<project-ref>.supabase.co/functions/v1/blake-google-oauth/callback`
4. Scopes requested: `calendar.readonly`, `gmail.readonly`, `email`. Gmail usage is conservative by design — only unread-message metadata (sender/subject/date), never message bodies, even though the granted scope would technically allow it.

#### Local vs. live vs. not-connected

The UI always makes the data source explicit rather than guessing or faking it:
- **Live** — real data from Google/Supabase (Calendar, Gmail, Weather).
- **Local** — stored only in this browser's `localStorage` (Tasks, Quick launch).
- **Not connected** — a source with no data yet (shown plainly, never with fabricated numbers), ready for a future integration to fill in.

While `GOOGLE_CLIENT_ID` is unset in `command/app.js`, the sign-in gate is bypassed with a visible "dev mode" banner so the rest of the dashboard can be built/tested without a live OAuth setup. **The route is not actually private until real credentials are configured** — don't treat it as gated until that banner is gone.
