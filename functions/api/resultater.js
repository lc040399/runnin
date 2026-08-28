// Cloudflare Pages Function: proxy til RunSignups åbne resultat-API.
// RunSignup stripper resultater i CORS-svar, så opslaget skal ske server-side.
// GET /api/resultater?rsid=<race_id>[&dato=YYYY-MM-DD]  →  { results: [...] } eller { results: null }

const json = (data, status = 200, cache = 120) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${cache}` },
  });

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const rsid = url.searchParams.get("rsid") || "";
  if (!/^\d{1,10}$/.test(rsid)) return json({ error: "ugyldigt rsid" }, 400, 0);

  // dagens dato (UTC) med 1 dags slæk bagud pga. amerikanske tidszoner; ?dato= til test
  const iDag = url.searchParams.get("dato") || new Date().toISOString().slice(0, 10);
  const iGår = new Date(Date.parse(iDag) - 86400000).toISOString().slice(0, 10);

  const debug = url.searchParams.get("debug") === "1";
  const diag = [];
  try {
    const rd = await (await fetch(`https://runsignup.com/rest/race/${rsid}?format=json`)).json();
    if (debug) diag.push({ events: (rd.race?.events || []).map(e => e.start_time) });
    for (const ev of rd.race?.events || []) {
      const [dato] = (ev.start_time || "").split(" ");
      const [mm, dd, yyyy] = dato.split("/");
      if (!yyyy) continue;
      const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      if (iso !== iDag && iso !== iGår) continue;

      const UA = { headers: { "User-Agent": "curl/8.6.0", "Accept": "application/json" } };
      const rs = await (await fetch(
        `https://runsignup.com/rest/race/${rsid}/results/get-result-sets?format=json&event_id=${ev.event_id}`, UA
      )).json();
      // fald tilbage til dedikeret get-results pr. sæt, hvis embedded results er strippet
      for (const s of rs.individual_results_sets || []) {
        if (s.public_results === "T" && !(s.results || []).length) {
          try {
            const gr = await (await fetch(
              `https://runsignup.com/rest/race/${rsid}/results/get-results?format=json&event_id=${ev.event_id}&individual_result_set_id=${s.individual_result_set_id}&results_per_page=200`, UA
            )).json();
            s.results = gr.individual_results_sets?.[0]?.results || [];
          } catch (_) {}
        }
      }
      if (debug) diag.push({ event: ev.event_id, sets: (rs.individual_results_sets || []).map(s => ({ id: s.individual_result_set_id, n: (s.results || []).length, pub: s.public_results })) });
      for (const sæt of rs.individual_results_sets || []) {
        if (sæt.public_results !== "T" || !sæt.results?.length) continue;
        const results = sæt.results.slice(0, 200).map(r => ({
          navn: `${r.first_name || ""} ${(r.last_name || "").slice(0, 1)}.`.trim(),
          bib: r.bib ?? "",
          plac: r.place,
          tid: r.chip_time || r.clock_time || "",
        })).filter(r => r.navn && r.tid);
        if (results.length) return json({ results, event: ev.name });
      }
    }
    return json(debug ? { results: null, diag } : { results: null });
  } catch (e) {
    return json({ results: null, fejl: String(e).slice(0, 120) }, 200, 30);
  }
}
