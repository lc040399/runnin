// Cloudflare Pages Function: Strava OAuth-token-udveksling.
// client_secret må aldrig ligge i browseren - kun denne funktion kender den
// (env-vars STRAVA_CLIENT_ID + STRAVA_CLIENT_SECRET på Pages-projektet).
// GET  → { configured, clientId }  (frontend tjekker om rigtig kobling er aktiveret)
// POST { code } → token-sæt  |  POST { refresh_token } → nyt token-sæt

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function onRequestGet({ env }) {
  const configured = !!(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET);
  return json({ configured, clientId: configured ? env.STRAVA_CLIENT_ID : null });
}

export async function onRequestPost({ request, env }) {
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) return json({ error: "ikke konfigureret" }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: "ugyldig forespørgsel" }, 400); }

  const payload = { client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET };
  if (body.code) { payload.code = String(body.code); payload.grant_type = "authorization_code"; }
  else if (body.refresh_token) { payload.refresh_token = String(body.refresh_token); payload.grant_type = "refresh_token"; }
  else return json({ error: "code eller refresh_token påkrævet" }, 400);

  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) return json({ error: "Strava afviste forespørgslen" }, 502);

  // returnér kun det, frontenden skal bruge - aldrig hele athlete-objektet
  return json({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at,
    athlete: d.athlete ? { id: d.athlete.id, fornavn: d.athlete.firstname || "" } : undefined,
  });
}
