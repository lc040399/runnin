/* Stempler data/meta.js med datoen for seneste data-opdatering (dansk tid).
   Køres sidst i refresh-workflowet, efter kilderne er genimporteret. */
import { writeFileSync } from "node:fs";

const nu = new Date();
// Europe/Copenhagen-dato (ISO) uanset hvor runneren står
const iso = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit",
}).format(nu);

const ud = `/* Auto-genereret af tools/build-meta.mjs - rør ikke i hånden. */\n` +
  `window.RUNNIN_META = ${JSON.stringify({ opdateret: iso })};\n`;

writeFileSync(new URL("../data/meta.js", import.meta.url), ud);
console.log("meta.js opdateret:", iso);
