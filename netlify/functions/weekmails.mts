// De twee mails van Bonnie rond een draaiweek.
//
// Bij het begin van de eerste draaidag van een draaiweek krijgt de crew de link, zodat
// ze de week kunnen bijhouden. De ochtend na de laatste draaidag krijgen ze het seintje
// om af te ronden. Wat een draaiweek is, komt uit de tabel Draaidagen: die vult zich uit
// de callsheets, dus het volgt het echte schema en geen vaste maandag-tot-vrijdag.
//
// Wie er mail krijgt, komt uit de crewregel van het callsheet. Stond je die week niet op
// een callsheet, dan krijg je niets. Kan een naam van het callsheet niet aan een crewlid
// gekoppeld worden, dan staat dat in de uitvoer; er verdwijnt dus nooit stilletjes
// iemand. Staat er voor die week nergens een crewregel, dan gaat de mail naar iedereen
// die meedoet, want niemand mailen zou erger zijn.
//
// Deze functie stuurt zelf geen mail. Hij zet alleen het juiste vinkje aan bij de crew;
// de mail zelf komt uit de automatiseringen in Airtable, zodat de tekst daar te
// wijzigen is zonder aan code te komen.

const BASE = "app4HQkMqFpZCnqpv";
const API = "https://api.airtable.com/v0/" + BASE;
const T_DAG = "tblMsE819GouzsTCo";
const T_CREW = "tblpaxWdwaY6XbPbT";
const T_REGELSET = "tbljCvRiFsZav6XbL";

const F = {
  datum: "fldc7rNjjJ2tWf6HH",
  crewOpCallsheet: "fldB2LljUvMl7OOrF",
  actief: "fldl49e40hA0LnwF9",
  email: "fldClEi5WxnJfpmFI",
  naam: "fldypfInaNvNURVID",
  voornaam: "fldx9Z5jB6cx4gc8W",
  startmail: "fldXcX16qUjGrmG1D",
  herinnering: "fldPop8xTY8qEfDG2",
  geenUren: "fldiBe898AEQaHfGB",
  testdatum: "fldIZ4WeM3no1pgXA",
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
  return { eerste, laatste, per };
}

function sleutel(s: any) {
  return String(s || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

// De crewregel op een callsheet is een rij voornamen achter elkaar. Meer hebben we niet:
// geen achternaam, geen functie. Daarom matchen we op voornaam.
export function splitsNamen(tekst: string) {
  return String(tekst || "")
    .split(/[,\n;]+/)
    .map((s) => s.replace(/\(.*?\)/g, "").trim())
    .filter((s) => s.length > 1 && !/^\d+$/.test(s));
}

function voornaamVan(rec: any) {
  const vn = String(rec.fields[F.voornaam] || "").trim();
  if (vn) return sleutel(vn);
  return sleutel(String(rec.fields[F.naam] || "").split(" ")[0]);
}

export async function verwerk(peilOverride?: string, droog = false) {
  const regelset = await alles(T_REGELSET);
  const testdatum = regelset[0] && regelset[0].fields[F.testdatum];
  const vandaag = peilOverride || (testdatum ? String(testdatum).slice(0, 10) : vandaagNL());
  const gisteren = dagErvoor(vandaag);

  const dagen = await alles(T_DAG);
  const datums = dagen.map((r: any) => r.fields[F.datum]).filter(Boolean);
  const g = grenzen(datums);

  const start = g.eerste.has(vandaag);
  const einde = g.laatste.has(gisteren);
  if (!start && !einde) {
    return {
      peildatum: vandaag,
      testdatumGebruikt: !!testdatum && !peilOverride,
      start: false,
      einde: false,
      aangezet: 0,
      reden: "vandaag is geen eerste draaidag en gisteren was geen laatste draaidag",
    };
  }

  // De week waar het om gaat: bij de startmail die van vandaag, bij de herinnering die
  // van gisteren, want dat was de laatste draaidag.
  const week = isoWeek(start ? vandaag : gisteren);
  const dagenInWeek = (g.per[week] || []);
  const opCallsheet = new Set<string>();
  dagenInWeek.forEach((d) => {
    const rec = dagen.filter((r: any) => r.fields[F.datum] === d)[0];
    splitsNamen(rec && rec.fields[F.crewOpCallsheet]).forEach((n) => opCallsheet.add(sleutel(n)));
  });

  const meedoen = (await alles(T_CREW)).filter(
    (r: any) => r.fields[F.actief] !== false && !r.fields[F.geenUren] && String(r.fields[F.email] || "").trim()
  );

  // Geen crewregels voor deze week? Dan mailen we iedereen die meedoet en zeggen we dat
  // erbij. Te veel mail is vervelend, geen mail kost iemand zijn uren.
  const geenLijst = opCallsheet.size === 0;
  const kiezen = geenLijst ? meedoen : meedoen.filter((r: any) => opCallsheet.has(voornaamVan(r)));

  const gekoppeld = new Set(meedoen.map(voornaamVan));
  const onbekendeNamen = [...opCallsheet].filter((n) => !gekoppeld.has(n));
  const nietGemaild = meedoen.filter((r: any) => kiezen.indexOf(r) < 0).map((r: any) => String(r.fields[F.naam] || r.id));

  const namen: string[] = [];
  for (const c of kiezen) {
    const velden: any = {};
    if (start) velden[F.startmail] = true;
    if (einde) velden[F.herinnering] = true;
    if (!droog) await at("/" + T_CREW + "/" + c.id, { method: "PATCH", body: JSON.stringify({ fields: velden, typecast: true }) });
    namen.push(String(c.fields[F.naam] || c.id));
  }

  return {
    peildatum: vandaag,
    testdatumGebruikt: !!testdatum && !peilOverride,
    gisteren,
    week,
    start,
    einde,
    droog,
    opCallsheet: geenLijst ? "geen crewregels gevonden voor deze week, daarom iedereen gemaild" : [...opCallsheet],
    aangezet: droog ? 0 : namen.length,
    crew: namen,
    nietGemaild,
    onbekendeNamenOpCallsheet: onbekendeNamen,
  };
}

export default async (req: Request) => {
  try {
    // ?datum=2026-11-03 speelt een dag na, ?droog=1 zet niets aan en laat alleen zien
    // wie er mail zou krijgen.
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
