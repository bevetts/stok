/*
 * blake-google-oauth
 *
 * Handles the Google OAuth callback for Blake's Command Center. This is
 * the ONLY place the Google Client Secret is used — it lives as a
 * Supabase Edge Function secret (GOOGLE_CLIENT_SECRET), never in the
 * frontend.
 *
 * Flow:
 *   1. command/app.js redirects the browser to Google's consent screen.
 *   2. Google redirects back here with ?code=...
 *   3. We exchange the code for access+refresh tokens, look up the
 *      signed-in Google account's email, and check it against
 *      ALLOWED_EMAIL. Anyone else's Google account is rejected — no
 *      tokens are stored for them.
 *   4. On success we mint a random opaque session token, store only its
 *      SHA-256 hash (plus the Google tokens) in blake_google_tokens, and
 *      redirect the browser back to COMMAND_APP_URL with the raw token
 *      in the query string. command/app.js stashes it in localStorage
 *      and sends it as a bearer token on future calls to
 *      blake-google-data.
 *
 * Deliberately NOT using a client-supplied redirect target: the return
 * URL is a fixed Supabase secret (COMMAND_APP_URL), so this can't be
 * abused as an open redirect to exfiltrate a session token to a
 * third-party site.
 *
 * Required Supabase secrets:
 *   GOOGLE_CLIENT_ID       (matches the constant in command/app.js)
 *   GOOGLE_CLIENT_SECRET   (never exposed client-side)
 *   COMMAND_APP_URL        e.g. "https://yourdomain.com/command/"
 *   ALLOWED_EMAIL          e.g. "blake.evetts@gmail.com" (who's allowed to sign in)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const commandAppUrl = Deno.env.get("COMMAND_APP_URL");

  if (!commandAppUrl) {
    return new Response(
      "COMMAND_APP_URL secret is not set — set it to your deployed /command/ URL before using sign-in.",
      { status: 500 }
    );
  }

  const redirectWithError = (message: string) =>
    Response.redirect(`${commandAppUrl}?auth_error=${encodeURIComponent(message)}`, 302);

  if (!url.pathname.endsWith("/callback")) {
    return new Response("Not found", { status: 404 });
  }

  const error = url.searchParams.get("error");
  if (error) return redirectWithError(`Google sign-in was cancelled (${error}).`);

  const code = url.searchParams.get("code");
  if (!code) return redirectWithError("Missing authorization code.");

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const allowedEmail = Deno.env.get("ALLOWED_EMAIL");
  if (!clientId || !clientSecret || !allowedEmail) {
    return new Response("Server is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / ALLOWED_EMAIL secrets.", { status: 500 });
  }

  const redirectUri = `${url.origin}/functions/v1/blake-google-oauth/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("Google token exchange failed:", tokenRes.status, body);
      // Temporary: surface Google's actual error inline so this is debuggable
      // without Edge Function log access. Safe to do — it's an OAuth error
      // code/description, never a token or secret.
      return redirectWithError(`Token exchange failed: ${body.slice(0, 300)}`);
    }
    const tokenData = await tokenRes.json();

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userInfoRes.ok) return redirectWithError("Couldn't verify the Google account.");
    const userInfo = await userInfoRes.json();

    if ((userInfo.email || "").toLowerCase() !== allowedEmail.toLowerCase()) {
      // Never store tokens for anyone but the allow-listed account.
      return redirectWithError("This Google account isn't authorized for this dashboard.");
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const sessionToken = randomToken();
    const sessionHash = await sha256Hex(sessionToken);
    const tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    const sessionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    // Google only returns a refresh_token on first consent (or when
    // prompt=consent forces re-consent, which we always request) — but
    // guard anyway so a re-auth without one doesn't wipe a working one.
    const { data: existing } = await supabase.from("blake_google_tokens").select("refresh_token").eq("id", 1).maybeSingle();

    const { error: upsertErr } = await supabase.from("blake_google_tokens").upsert({
      id: 1,
      email: userInfo.email,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || existing?.refresh_token,
      token_expiry: tokenExpiry,
      session_token_hash: sessionHash,
      session_expiry: sessionExpiry,
      updated_at: new Date().toISOString(),
    });
    if (upsertErr) {
      console.error("Failed to store tokens:", upsertErr);
      return redirectWithError("Signed in, but couldn't save the session. Try again.");
    }

    return Response.redirect(`${commandAppUrl}?session=${sessionToken}`, 302);
  } catch (err) {
    console.error("blake-google-oauth callback error:", err);
    return redirectWithError("Unexpected error during sign-in.");
  }
});
