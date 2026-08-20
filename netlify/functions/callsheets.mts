// Callsheets automatisch inlezen uit Dropbox.
//
// Draait elk uur vanzelf. Kijkt in de map CALLSHEETS, pakt elk callsheet-PDF dat nieuw
// is of vervangen, leest de tekst en zet er een draaidag van in Airtable. Kan het
// systeem iets niet lezen, dan maakt het de draaidag toch aan met de vlag Controleren
// en zet het in Leesmelding wat er ontbreekt. Zo verdwijnt er nooit stilletjes iets.
//
// Wat er niet gebeurt: het systeem verzint nooit een tijd of datum. Ontbreekt de datum,
// dan slaan we het bestand over en melden we dat, want zonder datum weten we niet bij
// welke draaidag het hoort.

import { extractText, getDocumentProxy } from "unpdf";

const APP_KEY = "rnxxpzxpwl2aawz";
const MAP = "/BON BINI JETZT GEHT'S LOS/CALLSHEETS";

const BASE = "app4HQkMqFpZCnqpv";
const API = "https://api.airtable.com/v0/" + BASE;
const T_DAG = "tblMsE819GouzsTCo";

const F = {
  draaidag: "fldFPwQFhQg9m8OO3",
  datum: "fldc7rNjjJ2tWf6HH",
  dd: "fldHBwrNl0FsgtwGG",
  blok: "fldiFfFuKr0XcBsSY",
  crewcall: "fldffFdKT94egqOqO",
  wrap: "flddrin96UeGaVvNA",
  lunch: "fld9U5l9EkPqa1id7",
  locatie: "fldO5VdxPm965Fd6P",
  setadres: "fldofXLLEY8m9sFsi",
  nacht: "fldCfhVnog1LVeFcQ",
  zondag: "fldQuMgnrDlXf62WH",
  bron: "fldeaQP5jyM12AmMP",
  rev: "fldXcO3cTd4PN4Z8K",
  controleren: "fldB1MM160pbzJtrg",
  melding: "fldPR9hTpeswJ5Csx",
};

const MAAND: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
  juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
};

// ------------------------------------------------------------------ Dropbox

async function dropboxToken() {
  const refresh = process.env.DROPBOX_REFRESH_TOKEN;
  if (!refresh) throw new Error("DROPBOX_REFRESH_TOKEN ontbreekt op de server");
  const r = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: APP_KEY }),
  });
  const d: any = await r.json();
  if (!r.ok || !d.access_token) throw new Error("Dropbox weigert de sleutel: " + JSON.stringify(d).slice(0, 200));
  return d.access_token as string;
}

async function dropboxLijst(token: string) {
  const uit: any[] = [];
  let r = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ path: MAP, recursive: true }),
  });
  let d: any = await r.json();
  if (!r.ok) throw new Error("Dropbox list_folder: " + JSON.stringify(d).slice(0, 200));
  uit.push(...d.entries);
  while (d.has_more) {
    r = await fetch("https://api.dropboxapi.com/2/files/list_folder/continue", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ cursor: d.cursor }),
    });
    d = await r.json();
    uit.push(...d.entries);
  }
  return uit.filter((e) => e[".tag"] === "file");
}

async function dropboxHaal(token: string, pad: string) {
  const r = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Dropbox-API-Arg": JSON.stringify({ path: pad }) },
  });
  if (!r.ok) throw new Error("Dropbox download " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

// ------------------------------------------------------------------ Airtable

async function at(pad: string, opties: RequestInit = {}) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN ontbreekt op de server");
  const r = await fetch(API + pad, {
    ...opties,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(opties.headers || {}) },
  });
  if (!r.ok) throw new Error("Airtable " + r.status + ": " + (await r.text()).slice(0, 300));
  return r.json();
}

async function alleDraaidagen() {
  const uit: any[] = [];
  let offset = "";
  do {
    const d: any = await at("/" + T_DAG + "?returnFieldsByFieldId=true&pageSize=100" + (offset ? "&offset=" + offset : ""));
    uit.push(...d.records);
    offset = d.offset || "";
  } while (offset);
  return uit;
}

// ------------------------------------------------------------------ lezen

function tijd(s: any) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(s || ""));
  return m ? String(m[1]).padStart(2, "0") + ":" + m[2] : null;
}
function minuten(t: string | null) {
  if (!t) return null;
  const d = t.split(":").map(Number);
  return d[0] * 60 + d[1];
}

export function leesCallsheet(tekst: string, bestandsnaam: string) {
  const t = String(tekst);
  const uit: any = { bron: bestandsnaam, meldingen: [] as string[] };

  // De datum staat twee keer op het callsheet: in de kop en in de slotregel. In de
  // praktijk wijken die soms van elkaar af doordat een callsheet is doorgeschoven en de
  // kop niet is bijgewerkt. De slotregel is de betrouwbare: die heeft ook het jaartal en
  // wordt door het sjabloon zelf gevuld. Wijken ze af, dan nemen we de slotregel en
  // zetten we de dag op Controleren, want een verkeerde datum betekent uren op de
  // verkeerde dag.
  const kop = /CALLSHEET\s*#\s*(\d{1,3})\s*[-–]\s*([A-Za-zÀ-ÿ]+)\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]+)/i.exec(t);
  const staart = /EINDE CALLSHEET\s*#?\s*(\d{1,3})[^|\n]{0,4}[,\s]\s*([A-Za-zÀ-ÿ]+)\s+(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(20\d{2})/i.exec(t);

  function maakDatum(dag: number, maandNaam: string, jaar: number | null) {
    const maand = MAAND[String(maandNaam || "").toLowerCase()];
    if (!maand) { uit.meldingen.push("maand niet herkend: " + maandNaam); return null; }
    if (!jaar) { uit.meldingen.push("jaartal niet gevonden"); return null; }
    return jaar + "-" + String(maand).padStart(2, "0") + "-" + String(dag).padStart(2, "0");
  }

  if (kop) uit.dd = +kop[1];
  else if (staart) uit.dd = +staart[1];
  else uit.meldingen.push("kopregel CALLSHEET #.. niet gevonden");

  const jaarLos = (/EINDE CALLSHEET[^|]*\b(20\d{2})\b/i.exec(t) || [])[1];
  const uitKop = kop ? maakDatum(+kop[3], kop[4], jaarLos ? +jaarLos : null) : null;
  const uitStaart = staart ? maakDatum(+staart[3], staart[4], +staart[5]) : null;

  if (uitStaart) {
    uit.datum = uitStaart;
    uit.weekdag = staart![2].toLowerCase();
    if (uitKop && uitKop !== uitStaart) {
      uit.meldingen.push("de datum in de kop (" + uitKop + ") wijkt af van de datum in de slotregel (" + uitStaart + "); de slotregel is aangehouden");
    }
  } else if (uitKop) {
    uit.datum = uitKop;
    uit.weekdag = kop![2].toLowerCase();
  }

  uit.crewcall = tijd((/CREWCALL\s+(\d{1,2}:\d{2})/i.exec(t) || [])[1]);
  uit.wrap = tijd((/WRAP\s*\(est\.?\)\s*(\d{1,2}:\d{2})/i.exec(t) || [])[1]);
  uit.lunch = tijd((/LUNCH\s*\(est\.?\)\s*(\d{1,2}:\d{2})/i.exec(t) || [])[1]);
  if (!uit.crewcall) uit.meldingen.push("crewcall niet gevonden");
  if (!uit.wrap) uit.meldingen.push("wrap niet gevonden");
  if (!uit.lunch) uit.meldingen.push("lunchtijd niet gevonden");

  const loc = /LOCATIE\s+([A-Z][A-Z0-9 &'\-]{3,40})\s*\n/.exec(t);
  if (loc) uit.locatie = loc[1].trim();

  // Op sommige callsheets staat het setadres achter "SET", op andere staat daar niets
  // en volgt alleen het volgende kopje. Een adres heeft een huisnummer en een komma;
  // is dat er niet, dan hebben we het niet gevonden en zeggen we dat ook.
  const adres = /★[ \t]*SET[ \t]+([^\n]{6,200})/.exec(t);
  // In de ene PDF staat het adres op een eigen regel, in de andere loopt de tekst door
  // met HOLDING en BASECAMP erachter. Knip daarom af bij het eerstvolgende bolletje.
  const kandidaat = (adres ? adres[1] : "").split(/[☉◉★]/)[0].replace(/\s+/g, " ").trim();
  if (/\d/.test(kandidaat) && kandidaat.indexOf(",") > -1) {
    uit.setadres = kandidaat;
  }
  if (!uit.setadres) uit.meldingen.push("setadres niet gevonden, vul het handmatig aan voor de kilometerberekening");

  // Nachtdraaidag: de dag loopt door tot na middernacht en er wordt daarna ook echt
  // nog gedraaid. Een wrap om precies 00:00 levert nul nachturen op en telt dus niet.
  const c = minuten(uit.crewcall), w = minuten(uit.wrap);
  uit.nacht = c != null && w != null && w < c && w > 0;
  uit.zondag = uit.weekdag === "zondag";

  return uit;
}

function velden(p: any, rev: string, vandaag: string) {
  const f: any = {};
  f[F.draaidag] = "DD" + String(p.dd || 0).padStart(2, "0") + " " + p.datum;
  f[F.datum] = p.datum;
  if (p.dd) f[F.dd] = p.dd;
  f[F.blok] = Date.parse(p.datum) >= Date.parse("2027-01-01") ? "OOS" : "NL";
  if (p.crewcall) f[F.crewcall] = p.crewcall;
  if (p.wrap) f[F.wrap] = p.wrap;
  if (p.lunch) f[F.lunch] = p.lunch;
  if (p.locatie) f[F.locatie] = p.locatie;
  if (p.setadres) f[F.setadres] = p.setadres;
  f[F.nacht] = !!p.nacht;
  f[F.zondag] = !!p.zondag;
  f[F.bron] = p.bron;
  f[F.rev] = rev;
  f[F.controleren] = p.meldingen.length > 0;
  f[F.melding] = p.meldingen.length
    ? "Ingelezen op " + vandaag + ". Niet gevonden: " + p.meldingen.join("; ") + "."
    : "";
  return f;
}

// ------------------------------------------------------------------ draaien

export async function verwerk() {
  const vandaag = new Date().toISOString().slice(0, 10);
  const token = await dropboxToken();
  const bestanden = (await dropboxLijst(token)).filter(
    (e) => /callsheet/i.test(e.name) && /\.pdf$/i.test(e.name)
  );
  const bestaand = await alleDraaidagen();

  const gedaan: string[] = [];
  const gemeld: string[] = [];
  const overgeslagen: string[] = [];

  for (const b of bestanden) {
    const alGelezen = bestaand.filter((r: any) => r.fields[F.bron] === b.name && r.fields[F.rev] === b.rev)[0];
    if (alGelezen) continue;

    let p: any;
    try {
      const bytes = await dropboxHaal(token, b.path_lower);
      const pdf = await getDocumentProxy(bytes);
      const uitPdf: any = await extractText(pdf, { mergePages: true });
      p = leesCallsheet(String(uitPdf.text), b.name);
    } catch (e: any) {
      overgeslagen.push(b.name + " (niet te lezen: " + String(e && e.message ? e.message : e).slice(0, 80) + ")");
      continue;
    }

    if (!p.datum) {
      overgeslagen.push(b.name + " (geen datum in het callsheet gevonden)");
      continue;
    }

    const f = velden(p, b.rev, vandaag);
    const opDatum = bestaand.filter((r: any) => r.fields[F.datum] === p.datum)[0];
    if (opDatum) {
      await at("/" + T_DAG + "/" + opDatum.id, { method: "PATCH", body: JSON.stringify({ fields: f, typecast: true }) });
    } else {
      await at("/" + T_DAG, { method: "POST", body: JSON.stringify({ fields: f, typecast: true }) });
    }
    gedaan.push(b.name + " -> " + p.datum);
    if (p.meldingen.length) gemeld.push(b.name + ": " + p.meldingen.join("; "));
  }

  return { bekeken: bestanden.length, gelezen: gedaan, controleren: gemeld, overgeslagen };
}

export default async () => {
  try {
    const uit = await verwerk();
    return new Response(JSON.stringify(uit, null, 2), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ fout: String(e && e.message ? e.message : e) }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/callsheets" };
