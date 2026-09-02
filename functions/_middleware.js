// Samler al trafik på det kanoniske domæne: pages.dev (og evt. www) → runnin.org,
// med 301 så søgemaskiner flytter autoritet med. Runnin.org selv røres ikke.
export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname.endsWith(".pages.dev") || url.hostname === "www.runnin.org") {
    url.hostname = "runnin.org";
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
