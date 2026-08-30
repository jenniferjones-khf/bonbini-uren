// Contracten automatisch inlezen uit Dropbox.
//
// Zodra er een contract in de map CONTRACTEN staat, leest het systeem de kernafspraken
// en zet die bij de juiste persoon in de Crew-tabel. De productie hoeft dus nergens een
// dagprijs of kilometervergoeding in te tikken; het contract is de bron.
//
// Wat het wel doet:
// - geld en afspraken uit het contract zijn leidend en worden altijd bijgewerkt
//   (dagprijs, maandfee, kilometervergoeding)
// - persoonsgegevens worden alleen ingevuld als het veld nog leeg is, zodat een
//   correctie die de productie zelf heeft gedaan nooit wordt overschreven
// - staat er iets anders in het contract dan in Airtable, dan wordt dat gemeld en niet
//   stilletjes veranderd
//
// Wat het niet doet: het maakt zelf geen crewleden aan. De volgorde blijft dat de
// productie iemand toevoegt en dat het contract daarna de gegevens aanvult. Ligt er een
// contract van iemand die nog niet in de tabel staat, dan komt dat in het overzicht te
// staan als "niet gekoppeld".
//
// Een definitief contract wint altijd van een concept. Van twee bestanden van dezelfde
// soort wint het bestand dat het laatst is gewijzigd.

import { unzipSync, strFromU8 } from "fflate";

const APP_KEY = "rnxxpzxpwl2aawz";
const MAP = "/BON BINI JETZT GEHT'S LOS - FINANCIEEL/CONTRACTEN";
const OVERSLAAN = ["/000 - templates/", "/_oud/", "/oud/", "/archief/"];

const BASE = "app4HQkMqFpZCnqpv";
const API = "https://api.airtable.com/v0/" + BASE;
const T_CREW = "tblpaxWdwaY6XbPbT";

const F = {
  naam: "fldypfInaNvNURVID",
  voornaam: "fldx9Z5jB6cx4gc8W",
  achternaam: "fld62PpLra6zgLurN",
  functie: "fld9EwU9tcPC3Rd70",
  email: "fldClEi5WxnJfpmFI",
  dagprijs: "fld1LOYLGgIt8AHeH",
  maandfee: "fld20uyjjkp4I6Ce8",
  kmTarief: "fld2BrRp6HJm8KAia",
  otRegelset: "fldmgj93afhMKBD0q",
  straat: "fld4RbRodT64ygSrj",
  postcode: "fldkr0cwaheZ2HLvJ",
  woonplaats: "fldovdqOJP57WQJAn",
  telefoon: "fld7LtKIiMKj4xfim",
  geboortedatum: "fld5F3CDLms40MO40",
  contractvorm: "fld3ERMdFZjaxsnla",
  bedrijfsnaam: "fld9nOwploKcRCzI0",
  btw: "fldJbzQ2lfXo1IOnM",
  kvk: "fld2LgX6Wdv9nzy5V",
  iban: "fldMMHGk6JMCyJkVU",
  bron: "fldm5aSv8bQ1HFWdk",
  rev: "fldJW77B5NKTXsAI9",
  controleren: "fld4sKmm9OB7tcil3",
  melding: "fldqgirzkqiX1J6Vk",
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

async function alleCrew() {
  const uit: any[] = [];
  let offset = "";
  do {
    const d: any = await at("/" + T_CREW + "?returnFieldsByFieldId=true&pageSize=100" + (offset ? "&offset=" + offset : ""));
    uit.push(...d.records);
    offset = d.offset || "";
  } while (offset);
  return uit;
}

// ------------------------------------------------------------------ lezen

// Word knipt een zin op in stukjes zodra er ooit iets aan is bijgewerkt. Daarom lezen we
// per alinea alle tekststukjes en plakken die aan elkaar; anders vind je "Naam:" wel
// maar de naam erachter niet.
export function docxTekst(bytes: Uint8Array) {
  const inhoud = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const ruw = inhoud["word/document.xml"];
  if (!ruw) throw new Error("geen word/document.xml in het bestand");
  const xml = strFromU8(ruw);
  const alineas: string[] = [];
  const re = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const stukjes = m[0].match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [];
    const tekst = stukjes.map((s) => s.replace(/<[^>]+>/g, "")).join("");
    alineas.push(ontsnap(tekst));
  }
  return alineas.join("\n");
}

function ontsnap(s: string) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&");
}

function regel(t: string, label: string) {
  const veilig = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp("^\\s*" + veilig + "\\s*:\\s*(.+?)\\s*$", "im").exec(t);
  return m ? m[1].trim() : "";
}

// "4.200,-" en "193,10" zijn allebei een bedrag. De punt is het duizendtal, de komma de
// decimaal; een streepje achter de komma betekent nul centen.
function bedrag(s: string) {
  const schoon = String(s || "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  const n = parseFloat(schoon);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function datum(s: string) {
  const m = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s || "");
  if (!m) return null;
  return m[3] + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0");
}

export function leesContract(tekst: string, bestandsnaam: string) {
  const t = tekst.replace(/ /g, " ").replace(/[’‘]/g, "'");
  const uit: any = { bron: bestandsnaam, meldingen: [] as string[] };

  uit.naam = regel(t, "Naam");
  uit.telefoon = regel(t, "Tel.nr.");
  uit.straat = regel(t, "Adres");
  uit.email = regel(t, "Email");
  uit.bedrijfsnaam = regel(t, "Bedrijfsnaam");
  uit.btw = regel(t, "BTW-id").replace(/\s+/g, "");
  uit.kvk = regel(t, "KvK-nummer").replace(/\s+/g, "");
  uit.iban = regel(t, "Bankrekeningnummer").replace(/\s+/g, "");
  uit.geboortedatum = datum(regel(t, "Geboortedatum"));

  const pp = regel(t, "Postcode en plaats");
  const ppM = /^(\d{4}\s?[A-Za-z]{2})\s+(.+)$/.exec(pp);
  if (ppM) {
    uit.postcode = ppM[1].toUpperCase().replace(/\s+/g, " ");
    uit.woonplaats = ppM[2].trim();
  } else if (pp) {
    uit.woonplaats = pp;
  }

  // De functie staat als eerste zin achter het kopje; de rest is de taakomschrijving.
  const fn = regel(t, "Functie & Werkzaamheden");
  if (fn) uit.functie = fn.split(".")[0].trim();

  // Vergoeding: of een maandfee met een afgeleide dagprijs, of meteen een dagprijs.
  const verg = regel(t, "Vergoeding");
  const maand = /EUR\s*([\d.,-]+)\s*excl\.?\s*BTW\s*per\s*maand/i.exec(verg);
  const dagAfgeleid = /Afgeleide dagprijs\s*EUR\s*([\d.,]+)/i.exec(verg);
  const dagDirect = /EUR\s*([\d.,-]+)\s*excl\.?\s*BTW\s*per\s*(draai)?dag/i.exec(verg);
  if (maand) uit.maandfee = bedrag(maand[1]);
  if (dagAfgeleid) uit.dagprijs = bedrag(dagAfgeleid[1]);
  else if (dagDirect) uit.dagprijs = bedrag(dagDirect[1]);
  else if (uit.maandfee) {
    uit.dagprijs = Math.round((uit.maandfee / 21.75) * 100) / 100;
    uit.meldingen.push("dagprijs stond niet in het contract, zelf berekend als maandfee gedeeld door 21,75");
  }
  if (!uit.dagprijs) uit.meldingen.push("geen dagprijs of maandfee gevonden in de regel Vergoeding");

  // Kilometervergoeding. In het contract staat "0,25 ct per km"; bedoeld is euro.
  const km = /([\d]+,\d{1,2})\s*(?:ct|cent|euro|EUR|€)?\s*per\s*km/i.exec(t);
  if (km) uit.kmTarief = bedrag(km[1]);
  else uit.meldingen.push("kilometervergoeding niet gevonden");

  // Overuren. Staat er geen tarief maar "in overleg", dan is er formeel geen
  // overurenregeling en moet iemand daar bewust naar kijken.
  const ot = regel(t, "Overuren");
  if (ot) {
    uit.overuren = ot;
    if (/in overleg|maandvergoeding|geen/i.test(ot)) {
      uit.otRegeling = false;
      uit.meldingen.push("overuren: \"" + ot + "\". Volgens het contract dus geen vaste overurenregeling; de OT-regelset staat daarom uit");
    } else {
      uit.otRegeling = true;
    }
  }

  if (/OVK\s*Zelfstandigen|ZELFSTANDIGE/i.test(bestandsnaam + " " + t)) uit.contractvorm = "Freelance";
  if (!uit.naam) uit.meldingen.push("naam niet gevonden, dit contract kan niet aan een crewlid gekoppeld worden");

  return uit;
}

// ------------------------------------------------------------------ koppelen

function sleutel(s: string) {
  return String(s || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

function leeg(v: any) {
  return v === undefined || v === null || String(v).trim() === "";
}

export async function verwerk() {
  const token = await dropboxToken();
  const bestanden = (await dropboxLijst(token)).filter((e) => {
    const p = String(e.path_lower || "");
    if (!/\.docx$/i.test(e.name)) return false;
    if (/^~\$/.test(e.name)) return false;
    return !OVERSLAAN.some((o) => p.indexOf(o) > -1);
  });

  // Per persoon houden we het beste bestand over: definitief wint van concept, en
  // daarbinnen het bestand dat het laatst gewijzigd is.
  const beste = new Map<string, any>();
  for (const b of bestanden) {
    const concept = String(b.path_lower).indexOf("/concepten/") > -1 || /^cp_/i.test(b.name);
    b._rang = concept ? 0 : 1;
    b._tijd = Date.parse(b.server_modified || 0) || 0;
    // De persoonsnaam kennen we pas na het lezen; voorlopig groeperen op bestandsnaam
    // zonder de map en zonder het voorvoegsel CP_.
    const kort = sleutel(b.name.replace(/^cp_/i, "").split("_")[0]);
    const eerder = beste.get(kort);
    if (!eerder || b._rang > eerder._rang || (b._rang === eerder._rang && b._tijd > eerder._tijd)) beste.set(kort, b);
  }

  const crew = await alleCrew();
  const gedaan: string[] = [];
  const gemeld: string[] = [];
  const nietGekoppeld: string[] = [];
  const overgeslagen: string[] = [];

  for (const b of beste.values()) {
    const rec = crew.find((r: any) => sleutel(r.fields[F.bron]) === sleutel(b.name) && r.fields[F.rev] === b.rev);
    if (rec) continue;

    let c: any;
    try {
      c = leesContract(docxTekst(await dropboxHaal(token, b.path_lower)), b.name);
    } catch (e: any) {
      overgeslagen.push(b.name + " (niet te lezen: " + String(e.message).slice(0, 80) + ")");
      continue;
    }
    if (!c.naam) {
      overgeslagen.push(b.name + " (geen naam in het contract gevonden)");
      continue;
    }

    const doel = crew.find((r: any) => {
      const vol = sleutel(r.fields[F.naam]);
      const samen = sleutel(String(r.fields[F.voornaam] || "") + " " + String(r.fields[F.achternaam] || ""));
      return vol === sleutel(c.naam) || samen === sleutel(c.naam);
    });
    if (!doel) {
      nietGekoppeld.push(c.naam + " (" + b.name + ")");
      continue;
    }

    const f: any = {};
    const meldingen: string[] = [...c.meldingen];

    // Geld en afspraken: het contract is de bron, dus die zetten we altijd.
    if (c.dagprijs) f[F.dagprijs] = c.dagprijs;
    if (c.maandfee) f[F.maandfee] = c.maandfee;
    if (c.kmTarief) f[F.kmTarief] = c.kmTarief;

    // Of de overurenregeling geldt komt uit de regel Overuren in het contract. Dit
    // wordt alleen gezet als het contract nieuw of vervangen is; zet de productie het
    // daarna met de hand anders, dan blijft dat staan tot er een nieuwe versie van het
    // contract in de map komt.
    if (typeof c.otRegeling === "boolean") f[F.otRegelset] = c.otRegeling;

    // Persoonsgegevens: alleen aanvullen wat nog leeg is. Staat er al iets anders, dan
    // melden we het verschil en laten we het staan.
    const paren: [string, any, string][] = [
      [F.functie, c.functie, "functie"],
      [F.email, c.email, "e-mailadres"],
      [F.straat, c.straat, "adres"],
      [F.postcode, c.postcode, "postcode"],
      [F.woonplaats, c.woonplaats, "woonplaats"],
      [F.telefoon, c.telefoon, "telefoonnummer"],
      [F.geboortedatum, c.geboortedatum, "geboortedatum"],
      [F.bedrijfsnaam, c.bedrijfsnaam, "bedrijfsnaam"],
      [F.btw, c.btw, "btw-id"],
      [F.kvk, c.kvk, "kvk-nummer"],
      [F.iban, c.iban, "iban"],
      [F.contractvorm, c.contractvorm, "contractvorm"],
    ];
    for (const [veldId, waarde, naamvanhet] of paren) {
      if (leeg(waarde)) continue;
      const nu = doel.fields[veldId];
      if (leeg(nu)) {
        f[veldId] = waarde;
      } else if (sleutel(typeof nu === "object" ? nu.name : nu) !== sleutel(waarde)) {
        meldingen.push(naamvanhet + " wijkt af: in Airtable \"" + (typeof nu === "object" ? nu.name : nu) + "\", in het contract \"" + waarde + "\"");
      }
    }

    f[F.bron] = b.name;
    f[F.rev] = b.rev;
    f[F.controleren] = meldingen.length > 0;
    f[F.melding] = meldingen.length
      ? "Contract gelezen op " + new Date().toISOString().slice(0, 10) + ". " + meldingen.join(". ") + "."
      : "";

    await at("/" + T_CREW + "/" + doel.id, { method: "PATCH", body: JSON.stringify({ fields: f, typecast: true }) });
    gedaan.push(c.naam + " <- " + b.name);
    if (meldingen.length) gemeld.push(c.naam + ": " + meldingen.join("; "));
  }

  return { gelezen: gedaan, controleren: gemeld, nietGekoppeld, overgeslagen, bekeken: beste.size };
}

export default async (req: Request) => {
  if ((process.env.API_SLEUTEL || "") !== (new URL(req.url).searchParams.get("s") || "")) return new Response(JSON.stringify({ fout: "geen of verkeerde sleutel achter de link" }), { status: 401, headers: { "Content-Type": "application/json" } });
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

export const config = { path: "/api/contracten" };
