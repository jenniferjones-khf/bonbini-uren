// De twee mails van Bonnie rond een draaiweek.
//
// Bij het begin van de eerste draaidag van een draaiweek krijgt de crew de link, zodat
// ze de week kunnen bijhouden. De ochtend na de laatste draaidag krijgen ze het seintje
// om af te ronden. Wat een draaiweek is, komt uit de tabel Draaidagen: die vult zich uit
// de callsheets, dus het volgt het echte schema en geen vaste maandag-tot-vrijdag.
//
// Deze functie stuurt zelf geen mail. Hij zet alleen het juiste vinkje aan bij de crew;
// de mail zelf komt uit de automatiseringen in Airtable, zodat de tekst daar te
// wijzigen is zonder aan code te komen.
//
// Wat hij niet kan: bepalen wie er die dag op set stond. Callsheets noemen alleen
// voornamen, dus de mail gaat naar alle actieve crewleden met een overurenregeling en
// een mailadres. Wie geen uren bijhoudt, zet je uit met het ene vinkje Geen urenregistratie
// op de Crew-tabel; dat is per persoon en staat standaard uit, zodat vergeten aanvinken
// hooguit een overbodige mail kost en nooit iemands uren.

const BASE = "app4HQkMqFpZCnqpv";
const API = "https://api.airtable.com/v0/" + BASE;
const T_DAG = "tblMsE819GouzsTCo";
const T_CREW = "tblpaxWdwaY6XbPbT";

const F = {
  datum: "fldc7rNjjJ2tWf6HH",
  actief: "fldl49e40hA0LnwF9",
  otRegelset: "fldmgj93afhMKBD0q",
  email: "fldClEi5WxnJfpmFI",
  naam: "fldypfInaNvNURVID",
  startmail: "fldXcX16qUjGrmG1D",
  geenUren: "fldiBe898AEQaHfGB",
  herinnering: "fldPop8xTY8qEfDG2",
};

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

async function alles(tabel: string) {
  const uit: any[] = [];
  let offset = "";
  do {
    const d: any = await at("/" + tabel + "?returnFieldsByFieldId=true&pageSize=100" + (offset ? "&offset=" + offset : ""));
    uit.push(...d.records);
    offset = d.offset || "";
  } while (offset);
  return uit;
}

// Nederlandse kalenderdag, ook als de server in UTC staat.
function vandaagNL() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}
function dagErvoor(ds: string) {
  return new Date(Date.parse(ds + "T12:00:00Z") - 86400000).toISOString().slice(0, 10);
}

export function isoWeek(ds: string) {
  const d = new Date(Date.parse(ds + "T00:00:00Z"));
  const dag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dag + 3);
  const eerste = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - eerste.getTime()) / 86400000 - 3 + ((eerste.getUTCDay() + 6) % 7)) / 7);
  return d.getUTCFullYear() + "-" + String(week).padStart(2, "0");
}

// Eerste en laatste draaidag van elke draaiweek. Een draaiweek is een ISO-week; dat is
// ook de indeling waarop de crew hun uren indient en waarop de weekstaat draait.
export function grenzen(datums: string[]) {
  const per: Record<string, string[]> = {};
  [...new Set(datums)].sort().forEach((d) => (per[isoWeek(d)] = per[isoWeek(d)] || []).push(d));
  const eerste = new Set<string>();
  const laatste = new Set<string>();
  Object.keys(per).forEach((w) => {
    eerste.add(per[w][0]);
    laatste.add(per[w][per[w].length - 1]);
  });
  return { eerste, laatste };
}

export async function verwerk(peildatum?: string, droog = false) {
  const vandaag = peildatum || vandaagNL();
  const gisteren = dagErvoor(vandaag);

  const datums = (await alles(T_DAG)).map((r: any) => r.fields[F.datum]).filter(Boolean);
  const g = grenzen(datums);

  const start = g.eerste.has(vandaag);
  const einde = g.laatste.has(gisteren);
  if (!start && !einde) return { vandaag, start: false, einde: false, aangezet: 0, reden: "vandaag is geen eerste draaidag en gisteren was geen laatste draaidag" };

  // Eén schakelaar voor mail: Geen urenregistratie. Of de rekenmotor overuren uitrekent
  // is een andere vraag (OT-regelset van toepassing) en hoort hier niet mee te tellen,
  // anders staan er twee vinkjes voor hetzelfde en weet niemand meer welke telt.
  const crew = (await alles(T_CREW)).filter(
    (r: any) => r.fields[F.actief] !== false && !r.fields[F.geenUren] && String(r.fields[F.email] || "").trim()
  );

  const namen: string[] = [];
  for (const c of crew) {
    const velden: any = {};
    if (start) velden[F.startmail] = true;
    if (einde) velden[F.herinnering] = true;
    // Met ?droog=1 zet hij niets aan en zie je alleen wie er mail zou krijgen.
    if (!droog) await at("/" + T_CREW + "/" + c.id, { method: "PATCH", body: JSON.stringify({ fields: velden, typecast: true }) });
    namen.push(String(c.fields[F.naam] || c.id));
  }

  return { vandaag, gisteren, start, einde, droog, aangezet: droog ? 0 : namen.length, crew: namen };
}

export default async (req: Request) => {
  try {
    // Met ?datum=2026-11-03 kun je een dag naspelen zonder te wachten, en met ?droog=1
    // zie je wie er mail zou krijgen zonder dat er iets wordt verstuurd.
    const p = new URL(req.url).searchParams;
    const peil = p.get("datum") || undefined;
    const uit = await verwerk(peil && /^\d{4}-\d{2}-\d{2}$/.test(peil) ? peil : undefined, p.get("droog") === "1");
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

export const config = { path: "/api/weekmails" };
