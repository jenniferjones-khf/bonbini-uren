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
import { geocode } from "./afstand.mts";

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
  crewOpCallsheet: "fldB2LljUvMl7OOrF",
  hotel: "fldXBWRWoyggKJNug",
  coordinatenSet: "fld51k1JqqFLe8rEY",
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

// ------------------------------------------------------------------ adressen
//
// Belangrijk om te weten: unpdf levert de tekst van een callsheet als EEN lange regel.
// Er zitten geen regeleindes in. Alles wat op losse regels zocht, vond daarom niets.
// Daarom zoeken we hieronder op de platte tekst, met posities in plaats van regels.

// Plaatsnaam: normaal een woord. Alleen bij "Den Haag", "Sint Michielsgestel" en
// dergelijke hoort het tweede woord erbij. Meer woorden pakken we bewust niet, want in
// het callsheet staan de adressen achter elkaar en dan loopt de plaatsnaam zo door in
// de volgende straatnaam.
const PLAATS = "[A-ZÀ-Ý][a-zà-ÿ]+(?:[ -](?:Haag|Bosch|Helder|Burg|Zoom|Rijn|IJssel|Michielsgestel|Ambacht|Aa|Zand))?";
const ADRES = new RegExp(",\\s*(\\d{4}\\s?[A-Z]{2})\\s+(" + PLAATS + ")", "g");

// Woorden die zonder hoofdletter in een straatnaam mogen staan.
const TUSSEN = /^(van|de|der|den|op|aan|het|ter|te|in|'t|bij)$/i;

// De straat staat vóór de komma. We lopen van het huisnummer terug zolang de woorden
// op een straatnaam lijken, en stoppen bij het eerste woord dat dat niet is. Zo pikken
// we "Houtlaan 247" uit "... 21:45 uur Houtlaan 247" zonder het woord "uur" mee te nemen.
export function straatVoor(stuk: string) {
  const woorden = stuk.replace(/([()|:;])/g, " $1 ").replace(/\s+/g, " ").trim().split(" ");
  let i = woorden.length - 1;
  if (!/^\d+[a-zA-Z]?(?:[-\/]\d*[a-zA-Z]?)?$/.test(woorden[i] || "")) return "";
  const uit = [woorden[i]];
  let namen = 0;
  for (i--; i >= 0 && uit.length < 7; i--) {
    const w = woorden[i];
    if (/[()|:;,]/.test(w)) break;
    if (namen > 0 && (/^\d{1,2}(e|de|ste)$/i.test(w) || TUSSEN.test(w))) { uit.unshift(w); continue; }
    if (/^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.\-]*$/.test(w)) { uit.unshift(w); namen++; continue; }
    break;
  }
  return namen ? uit.join(" ") : "";
}

// Alle adressen in het document, op volgorde, met de plek waar ze staan.
export function adressen(t: string) {
  const uit: { adres: string; index: number }[] = [];
  const re = new RegExp(ADRES.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const straat = straatVoor(t.slice(Math.max(0, m.index - 90), m.index));
    if (!straat) continue;
    uit.push({ adres: straat + ", " + m[1] + " " + m[2], index: m.index - straat.length });
  }
  return uit;
}

// Adressen die nooit het setadres zijn: het productiekantoor, de huisartsenpost, de
// spoedeisende hulp, het kantoor van de opdrachtgever en de vaste verhuurders.
const GEEN_SET = /Krom Boomssloot|Oudezijds Voorburgwal|Karperstraat|Molewaterplein|Wijnhaven|Hexaanweg|Katendrechtse/i;

// Het setadres. Op het callsheet staan de labels (★ SET, ☉ HOLDING, ◉ BASECAMP) in de
// ene kolom en de adressen in de andere. In de platte tekst komen die adressen als
// rijtje terug, meteen na de kopregel "CALLSHEET #01 - MAANDAG 23 FEBRUARI", in de
// volgorde van de labels. Het eerste adres na die kopregel is dus het setadres.
export function zoekSetadres(t: string) {
  // 1. Het adres staat op dezelfde plek als het sterretje met SET.
  const inline = /★[ \t]*SET[ \t]+([^\n★☉◉]{6,120})/.exec(t);
  if (inline) {
    const dichtbij = adressen(inline[1]);
    if (dichtbij.length && !GEEN_SET.test(dichtbij[0].adres)) return dichtbij[0].adres;
  }

  const lijst = adressen(t);

  // 2. Het eerste adres na de kopregel met het callsheetnummer.
  const kop = /CALLSHEET\s*#\s*\d{1,3}\s*[-–]/i.exec(t);
  if (kop) {
    const na = lijst.filter((a) => a.index > kop.index && a.index < kop.index + 400 && !GEEN_SET.test(a.adres));
    if (na.length) return na[0].adres;
  }

  // 3. Laatste kans: het eerste adres in het document dat geen kantoor, hotel of
  // ziekenhuis is. Liever een adres om te controleren dan helemaal geen adres.
  const rest = lijst.filter((a) => !GEEN_SET.test(a.adres));
  return rest.length ? rest[0].adres : "";
}

// Het hotel, als er die dag overnacht wordt. Naam plus het eerstvolgende adres.
export function zoekHotel(t: string) {
  const m = /hotel\s+([A-Z][A-Za-zÀ-ÿ'’.\- ]{2,40}?)\s*[,(]/.exec(t);
  if (!m) return { naam: "", adres: "" };
  const naam = m[1].replace(/\s+/g, " ").trim();
  // Het adres moet vlak achter de naam staan. Staat er niets (op sommige callsheets is
  // het haakje leeg), dan pakken we NIET het eerstvolgende adres verderop, want dat is
  // de huisartsenpost. Liever alleen de naam dan een verkeerd adres.
  const dichtbij = adressen(t.slice(m.index, m.index + 110)).filter((a) => !/Wijnhaven|Molewaterplein|Krom Boomssloot/i.test(a.adres));
  return { naam, adres: dichtbij.length ? dichtbij[0].adres : "" };
}

// De crewregel. Op het callsheet staan de namen van crew, extra crew en cast achter
// elkaar, direct onder de zonnetijden. Alleen voornamen, met komma's ertussen, en soms
// twee namen aan elkaar geplakt omdat de kolommen in de PDF naast elkaar staan. Daarom
// knippen we op komma's én op spaties en houden we alles over wat op een voornaam lijkt.
export function zoekCrew(t: string) {
  const m = /ZON\s*ONDER:?\s*\d{1,2}:\d{2}\s*(.{20,1200}?)(?=Kaap Holland:|Netflix:|Post:|Verhuur:|Crew:|Blue Circle|Kaap Holland Series Production|$)/i.exec(t);
  if (!m) return [];
  const namen: string[] = [];
  m[1].split(/[,\n;]+/).forEach((stuk) => {
    stuk.split(/\s+/).forEach((w) => {
      const n = w.replace(/[.,;:()]+$/, "").trim();
      if (/^[A-ZÀ-Ý][a-zà-ÿ'’\-]{1,}$/.test(n) && namen.indexOf(n) < 0) namen.push(n);
    });
  });
  return namen;
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

  // De locatienaam staat tussen het woord LOCATIE en het eerste labelteken. In de platte
  // tekst zit daar geen regeleinde tussen, dus zoeken we vooruit naar ★, ☉, ◉ of CREWCALL.
  const loc = /LOCATIE\s+([A-Z][A-Z0-9 &'\-]{3,40}?)\s*(?=[★☉◉]|CREWCALL)/.exec(t);
  if (loc) uit.locatie = loc[1].trim();
  if (!uit.locatie) uit.meldingen.push("locatienaam niet gevonden");

  // Het setadres. Dit is het lastigste stukje van het callsheet, want de labels en de
  // adressen staan in twee losse kolommen. In de ene PDF komt de tekst eruit als
  // "★ SET <adres>", in de andere staan eerst de labels SET, HOLDING en BASECAMP onder
  // elkaar en pas verderop het rijtje adressen. Daarom drie manieren, in volgorde.
  uit.setadres = zoekSetadres(t);

  // Wie er die dag op het callsheet stond. Nodig om de weekmails alleen naar die mensen
  // te sturen en niet naar de hele ploeg.
  const aantal = /\bCREW\s*\((\d{1,3})\)/i.exec(t);
  const namen = zoekCrew(t);
  if (namen.length >= 5) {
    uit.crew = namen;
    if (aantal && namen.length + 2 < +aantal[1]) {
      uit.meldingen.push("het callsheet noemt " + aantal[1] + " crew maar ik lees er " + namen.length + "; controleer de crewregel");
    }
  }
  if (!uit.crew) uit.meldingen.push("crewregel niet gevonden, de weekmails gaan voor deze dag naar iedereen");

  // Het hotel, als er die dag overnacht wordt. Het portaal biedt dat adres dan aan als
  // vertrekpunt, zodat iemand die in het hotel sliep geen kilometers vanaf huis claimt.
  const h = zoekHotel(t);
  uit.hotelnaam = h.naam;
  uit.hotel = h.naam && h.adres ? h.naam + ", " + h.adres : "";

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
  if (p.coordinatenSet) f[F.coordinatenSet] = p.coordinatenSet;
  if (p.hotel) f[F.hotel] = p.hotel;
  if (p.crew) f[F.crewOpCallsheet] = p.crew.join(", ");
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
  // Op naam sorteren, zodat DD#01 vóór DD#02 wordt gelezen. Dat maakt het vangnet
  // hieronder voorspelbaar: een adres dat op een latere dag wél staat, staat dan al in
  // Airtable bij de volgende run.
  const bestanden = (await dropboxLijst(token))
    .filter((e) => /callsheet/i.test(e.name) && /\.pdf$/i.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  const bestaand = await alleDraaidagen();

  const gedaan: string[] = [];
  const gemeld: string[] = [];
  const overgeslagen: string[] = [];

  // Vangnet, zodat een locatie nooit leeg blijft. Sommige callsheets zetten het adres
  // van de set of van het hotel er niet bij (bij DD#01 en DD#03 staat het hotel er als
  // "SS Roterdam ( )", met een leeg haakje). We onthouden per locatienaam en per
  // hotelnaam het adres dat we elders wél gelezen hebben, uit deze run en uit de dagen
  // die al in Airtable staan, en vullen dat dan in. Dat wordt altijd gemeld, zodat het
  // te zien is dat het adres niet van dat callsheet zelf komt.
  const bekendSet: Record<string, string> = {};
  const bekendHotel: Record<string, string> = {};
  bestaand.forEach((r: any) => {
    const l = String(r.fields[F.locatie] || "").trim().toUpperCase();
    const a = String(r.fields[F.setadres] || "").trim();
    if (l && a && !bekendSet[l]) bekendSet[l] = a;
    const h = String(r.fields[F.hotel] || "").trim();
    if (h && h.indexOf(",") > -1) {
      const naam = h.split(",")[0].trim().toLowerCase();
      if (naam && !bekendHotel[naam]) bekendHotel[naam] = h;
    }
  });

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

    // Vangnet: adres van set of hotel aanvullen als het callsheet het niet noemt.
    const locSleutel = String(p.locatie || "").trim().toUpperCase();
    if (p.setadres && locSleutel) bekendSet[locSleutel] = p.setadres;
    if (!p.setadres && locSleutel && bekendSet[locSleutel]) {
      p.setadres = bekendSet[locSleutel];
      p.meldingen.push("setadres staat niet op dit callsheet; overgenomen van een eerdere draaidag op " + p.locatie + " (" + p.setadres + ")");
    }
    const hotelSleutel = String(p.hotelnaam || "").trim().toLowerCase();
    if (p.hotel && hotelSleutel) bekendHotel[hotelSleutel] = p.hotel;
    if (!p.hotel && hotelSleutel && bekendHotel[hotelSleutel]) {
      p.hotel = bekendHotel[hotelSleutel];
      p.meldingen.push("hoteladres staat niet op dit callsheet; overgenomen van een andere draaidag (" + p.hotel + ")");
    } else if (!p.hotel && hotelSleutel) {
      p.meldingen.push("hotel " + p.hotelnaam + " genoemd zonder adres; vul het adres eenmalig aan bij een draaidag");
    }
    if (!p.setadres) p.meldingen.push("setadres niet gevonden, vul het handmatig aan voor de kilometerberekening");

    // Het setadres omzetten in coördinaten, zodat het portaal later de kilometers kan
    // uitrekenen zonder dat elk crewlid opnieuw hetzelfde adres laat opzoeken.
    if (p.setadres) {
      try {
        const punt = await geocode(p.setadres);
        if (punt) p.coordinatenSet = punt.lat + "," + punt.lon;
        else p.meldingen.push("setadres niet op de kaart gevonden, geen kilometerberekening voor deze dag");
      } catch {
        p.meldingen.push("setadres niet op de kaart gevonden, geen kilometerberekening voor deze dag");
      }
    }

    const f = velden(p, b.rev, vandaag);
    const opDatum = bestaand.filter((r: any) => r.fields[F.datum] === p.datum)[0];
    if (opDatum) {
      await at("/" + T_DAG + "/" + opDatum.id, { method: "PATCH", body: JSON.stringify({ fields: f, typecast: true }) });
      opDatum.fields = { ...opDatum.fields, ...f };
    } else {
      // De nieuwe dag meteen aan de lijst toevoegen. Voor sommige draaidagen staat er
      // meer dan een callsheet in de map (bijvoorbeeld een aparte versie voor een
      // kindacteur). Zonder deze regel maakt de tweede daar een tweede draaidag van.
      const nieuwRec: any = await at("/" + T_DAG, { method: "POST", body: JSON.stringify({ fields: f, typecast: true }) });
      bestaand.push({ id: nieuwRec.id, fields: f });
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
