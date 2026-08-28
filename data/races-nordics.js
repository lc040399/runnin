// Runnin race-database, Norden-bølge - kuraterede finske/islandske/færøske/grønlandske løb.
// Alle URLs er verificeret levende og matcher løbet (titel-tjekket) 28/8-2026.
// Kun måned (m), ingen dag-datoer - vi gætter aldrig datoer.
RACES.push(...[
  // ---------- FINLAND ----------
  {n:"Paavo Nurmi Marathon",c:"Turku",cc:"FI",co:"EU",la:60.452,lo:22.267,t:"marathon",d:"42,2 km",m:"2027-06",p:null,u:"https://paavonurmimarathon.fi"},
  {n:"Finlandia Marathon",c:"Jyväskylä",cc:"FI",co:"EU",la:62.241,lo:25.747,t:"marathon",d:"42,2 km",m:"2026-09",p:null,u:"https://finlandiamarathon.fi"},
  {n:"Helsinki Half Marathon",c:"Helsinki",cc:"FI",co:"EU",la:60.176,lo:24.930,t:"half",d:"21,1 km",m:"2027-06",p:null,u:"https://helsinkihalfmarathon.fi"},
  {n:"Terwamaraton",c:"Oulu",cc:"FI",co:"EU",la:65.012,lo:25.465,t:"marathon",d:"42,2 km",m:"2027-05",p:null,u:"https://terwamaraton.fi"},
  {n:"Bodom Trail",c:"Espoo",cc:"FI",co:"EU",la:60.256,lo:24.615,t:"ultra",d:"Trail",m:"2026-09",p:null,u:"https://bodomtrail.com"},
  // ---------- ISLAND ----------
  {n:"Midnight Sun Run",c:"Reykjavik",cc:"IS",co:"EU",la:64.146,lo:-21.942,t:"kort",d:"5-21 km",m:"2027-06",p:null,u:"https://marathon.is/midnight-sun-run"},
  {n:"Hengill Ultra",c:"Hveragerði",cc:"IS",co:"EU",la:64.001,lo:-21.188,t:"ultra",d:"Trail",m:"2027-06",p:null,u:"https://hengillultra.is"},
  // ---------- FÆRØERNE ----------
  {n:"Tórshavn Marathon",c:"Tórshavn",cc:"FO",co:"EU",la:62.011,lo:-6.772,t:"marathon",d:"42,2 km",m:"2027-06",p:null,u:"https://torshavnmarathon.com"},
  // ---------- GRØNLAND ----------
  {n:"Nuuk Marathon",c:"Nuuk",cc:"GL",co:"NA",la:64.175,lo:-51.738,t:"marathon",d:"42,2 km",m:"2027-08",p:null,u:"https://nuukmarathon.com"},
]);
RACES.forEach((r, i) => (r.id = i));
