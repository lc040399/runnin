// Cloudflare Pages Function: smal proxy til Stravas API, så browseren aldrig
// afhænger af Stravas CORS-politik. Kun whitelist'ede paths og query-parametre,
// og brugerens eget Bearer-token sendes bare videre - intet gemmes her.

const TILLADT = new Set(["athlete", "athlete/activities"]);

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  if (!TILLADT.has(path)) return new Response(JSON.stringify({ error: "ukendt path" }), { status: 400 });
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "mangler token" }), { status: 401 });

  const qs = new URLSearchParams();
  for (const [k, v] of url.searchParams) if (["after", "before", "page", "per_page"].includes(k)) qs.set(k, v);
  const r = await fetch(`https://www.strava.com/api/v3/${path}?${qs}`, { headers: { Authorization: auth } });
  return new Response(await r.text(), {
    status: r.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
