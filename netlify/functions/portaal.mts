// Urenportaal Bon Bini, serverfunctie.
// Praat namens de crewpagina met Airtable. De Airtable-sleutel blijft hier op de
// server; de telefoon van het crewlid ziet alleen zijn eigen gegevens terug.
//
// Endpoints (alles op /api/portaal):
//   GET  ?t=<recordId>              alle gegevens voor deze persoon
//   POST {t, actie:"dag", ...}      een draaidag opslaan
//   POST {t, actie:"week", week}    de week doorrekenen en indienen
//   POST {t, actie:"gegevens", ...} eigen crewgegevens bijwerken
//
// De persoonlijke code in de link IS het record-id van het crewlid. Er is dus geen
// aparte sleutellijst nodig; een link is geldig zolang het crewrecord bestaat.

const BASE = "app4HQkMqFpZCnqpv";
const API = "https://api.airtable.com/v0/" + BASE;

const T = {
  crew: "tblpaxWdwaY6XbPbT",
  uren: "tblRxNpruBfkT5NR3",
  draaidagen: "tblMsE819GouzsTCo",
  weekstaat: "tblc33QhfS91Jx98w",
  regelset: "tbljCvRiFsZav6XbL",
};

const F = {
  crew: {
    naam: "fldypfInaNvNURVID",
    voornaam: "fldx9Z5jB6cx4gc8W",
    achternaam: "fld62PpLra6zgLurN",
    functie: "fld9EwU9tcPC3Rd70",
    email: "fldClEi5WxnJfpmFI",
    dagprijs: "fld1LOYLGgIt8AHeH",
    groot: "fld5MNLx0vqEeMxRG",
    otRegelset: "fldmgj93afhMKBD0q",
    actief: "fldl49e40hA0LnwF9",
    straat: "fld4RbRodT64ygSrj",
    postcode: "fldkr0cwaheZ2HLvJ",
    woonplaats: "fldovdqOJP57WQJAn",
    telefoon: "fld7LtKIiMKj4xfim",
    geboortedatum: "fld5F3CDLms40MO40",
    allergieen: "fldm1Sukst1SULIhk",
    bhv: "fldb6VpPeqP7PnVLI",
    contractvorm: "fld3ERMdFZjaxsnla",
    bedrijfsnaam: "fld9nOwploKcRCzI0",
    btw: "fldJbzQ2lfXo1IOnM",
    kvk: "fld2LgX6Wdv9nzy5V",
    payrollsysteem: "fldM2pgUkn7TwwH8T",
    kenteken: "fld7rf2FIQRRXJRId",
    noodcontact: "fldeW4VpRIlVGIw08",
    iban: "fldMMHGk6JMCyJkVU",
  },
  dag: {
    datum: "fldc7rNjjJ2tWf6HH",
    dd: "fldHBwrNl0FsgtwGG",
    blok: "fldiFfFuKr0XcBsSY",
    crewcall: "fldffFdKT94egqOqO",
    wrap: "flddrin96UeGaVvNA",
    lunch: "fld9U5l9EkPqa1id7",
    locatie: "fldO5VdxPm965Fd6P",
    nacht: "fldCfhVnog1LVeFcQ",
    zondag: "fldQuMgnrDlXf62WH",
    setadres: "fldofXLLEY8m9sFsi",
  },
  uur: {
    registratie: "fldMeqRcR0Skjde27",
    crew: "fldfvmiXAJs7zwkR5",
    datum: "fldUJUogwUXJcHjUY",
    start: "fldU2bM0zgwzdT0bm",
    eind: "fld6AlZUx8KdMQ3C2",
    pauze: "fldSMeHoGNVfawmK5",
    setlocatie: "fldpS0lkLP9hVCo8G",
    nacht: "fldTjhNf1lgUbVLqS",
    zondag: "fldPjJGAM322yOG84",
    reisHeenVertrek: "fldomLqJKHZB3oaLX",
    reisHeenAankomst: "fld94kABPxWfagFWt",
    reisTerugVertrek: "fldR1UXD8sGE2S6TO",
    reisTerugThuis: "fldOR7mWENFPeWoO0",
    km: "fldzPYCwC6zYtEf7A",
    kmTarief: "fldsiJjyYqxQ22GGu",
    parkeer: "fldVHtOvArO6C7ohO",
    opmerking: "fldTfGqTN0FO8enHy",
    vervoer: "fldNjtSolzwiK2MYn",
    vertrekadres: "fldx4vTnqOzyDld16",
    gewerkteUren: "fldeNWcX5bzIORgZG",
    otUren: "fld2adlJTn1P3fFXI",
    otBedrag: "fldvZth9eAmhoXSNE",
    nachtUren: "fldcgEBnJzreVVCOC",
    nachtBedrag: "flddZ7GiVKbHhJOOr",
    reisuren: "fldsPGZPwrfTQPDH4",
    reisBedrag: "fldisHsBQakZveohi",
    kmBedrag: "fldpAEURNJaiG1IpK",
    taUren: "fld8xnBSCobVnrucW",
    taBedrag: "fldB7d9cN1rFnuJAK",
    zondagBedrag: "fld46LhdbAUP2I5pD",
    totaal: "fld5onf7FZPWLvmHH",
  },
  week: {
    naam: "fld7jQwp4UrxECR37",
    crew: "fldVoJDrqsKQktUxE",
    weeknummer: "fld3fVG7AlqofJ0Bv",
    jaar: "fldGfR7SPCbU6MudM",
    gewerkteUren: "fldIPBP7e0ZpF44Q1",
    ot: "fldNqyqvFYQwhjtBQ",
    nacht: "fldIW0lMlXlm6rrnx",
    reis: "fldpRh9nhEFkaYk9c",
    turnaround: "fldFTGzp5TDxBDeaJ",
    zondag: "fldU429sHjukwlDf6",
    km: "fldOWwJKxFk0N8Igy",
    parkeer: "fldx97EUR7cczgSrr",
    totaal: "fld6EaQxEqgUhPv7B",
    pmAkkoord: "fldXTfSzNzISd1X09",
    status: "fldxzJIEb05HhAxY2",
    opmerking: "fldYyHqO1RZ8Wz7ve",
  },
};

// De regels. Interim de voorwaarden van Quiet Girl / De Stilte.
const RS = {
  dagdrempelUren: 9.5,
  otTier1Pct: 150,
  otTier2Pct: 200,
  otTier1MaxUren: 4,
  reistijdVrijUren: 2,
  reistijdOtPct: 150,
  grootMateriaalReisPct: 100,
  nachtStartMin: 0,
  nachtEindMin: 360,
  nachtPct: 150,
  zondagPct: 150,
  turnaroundMinUren: 10,
  weekendTurnaroundUren: 58,
  turnaroundPct: 150,
  vrijeNachtenPct: 10,
  zondagVrijPct: 10,
  kmPersonen: 0.23,
  kmMateriaal: 0.32,
  lunchVast: 45,
  geplandePerBlok: { NL: 21, OOS: 7 },
};

// ---------------------------------------------------------------- Airtable

async function at(pad: string, opties: RequestInit = {}) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN ontbreekt op de server");
  const r = await fetch(API + pad, {
    ...opties,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(opties.headers || {}),
    },
  });
  if (!r.ok) {
    const tekst = await r.text();
    throw new Error("Airtable " + r.status + ": " + tekst.slice(0, 300));
  }
  return r.json();
}

async function alleRecords(tabel: string, params = "") {
  const uit: any[] = [];
  let offset = "";
  do {
    const q = params + (offset ? (params ? "&" : "?") + "offset=" + offset : "");
    const d: any = await at("/" + tabel + q);
    uit.push(...d.records);
    offset = d.offset || "";
  } while (offset);
  return uit;
}

// ---------------------------------------------------------------- rekenwerk

function pt(t: any) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(t || "").trim());
  return m ? +m[1] * 60 + +m[2] : null;
}
function isNacht(c: number) {
  c = ((c % 1440) + 1440) % 1440;
  return c >= RS.nachtStartMin && c < RS.nachtEindMin;
}
function r2(n: number) {
  return Math.round(n * 100) / 100;
}
function getal(x: any) {
  if (x == null || x === "") return 0;
  let s = String(x).trim().replace(/[^0-9.,-]/g, "");
  if (s.indexOf(",") > -1) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Reisuren uit de vier tijden. Ontbreekt de aankomst op de set of het vertrek van de
// set, dan rekenen we met de start- en eindtijd van die dag.
// Een reisstuk van meer dan 12 uur bestaat niet; dan staan de tijden in de verkeerde
// volgorde. Dat stuk telt niet mee, anders staat er honderden euro's te veel in de
// weekstaat zonder dat iemand het merkt.
function reisSpan(a: any, b: any) {
  const x = pt(a), y = pt(b);
  if (x == null || y == null) return 0;
  let d = y - x;
  if (d < 0) d += 1440;
  const uren = d / 60;
  return uren > 12 ? 0 : uren;
}
function reisurenUit(r: any) {
  const aankomstSet = pt(r.reisHeenAankomst) != null ? r.reisHeenAankomst : r.start;
  const vertrekSet = pt(r.reisTerugVertrek) != null ? r.reisTerugVertrek : r.eind;
  return r2(reisSpan(r.reisHeenVertrek, aankomstSet) + reisSpan(vertrekSet, r.reisTerugThuis));
}

function berekenDag(inp: any) {
  const D = getal(inp.dagprijs), uur = D / 10;
  const start = pt(inp.start);
  let eind = pt(inp.eind);
  let onset = 0, nO = 0;
  if (start != null && eind != null) {
    if (eind <= start) eind += 1440;
    onset = eind - start;
    for (let m = start; m < eind; m++) if (isNacht(m)) nO++;
  }
  const p = RS.lunchVast;
  const dagOnset = onset - nO;
  const pD = Math.min(p, Math.max(0, dagOnset)), pN = Math.max(0, p - pD);
  const nachtW = Math.max(0, nO - pN);
  let sD = pD, sN = pN;
  const w: boolean[] = [];
  if (start != null && eind != null) {
    for (let m = start; m < eind; m++) {
      const n = isNacht(m);
      if (!n && sD > 0) { sD--; continue; }
      if (n && sN > 0) { sN--; continue; }
      w.push(n);
    }
  }
  const dm = RS.dagdrempelUren * 60, t1 = RS.otTier1MaxUren * 60;
  let otE = 0, naE = 0, otMin = 0;
  for (let i = 0; i < w.length; i++) {
    if (i >= dm) {
      const k = i - dm;
      otE += ((k < t1 ? RS.otTier1Pct : RS.otTier2Pct) / 100) * uur / 60;
      otMin++;
    } else if (w[i]) {
      naE += ((RS.nachtPct - 100) / 100) * uur / 60;
    }
  }
  const R = Math.max(0, getal(inp.reisuren));
  const reE = inp.groot
    ? (RS.grootMateriaalReisPct / 100) * uur * R
    : (RS.reistijdOtPct / 100) * uur * Math.max(0, R - RS.reistijdVrijUren);
  const zoE = inp.zondag ? ((RS.zondagPct - 100) / 100) * D : 0;
  const kmB = Math.max(0, getal(inp.km)) * (getal(inp.kmTarief) || RS.kmPersonen);
  return {
    uur,
    gewerkteUren: r2(w.length / 60),
    otUren: r2(otMin / 60),
    otE: r2(otE),
    nachtUren: r2(nachtW / 60),
    naE: r2(naE),
    reisuren: r2(R),
    reE: r2(reE),
    kmB: r2(kmB),
    zoE: r2(zoE),
  };
}

function toTs(datum: string, min: number, plusDag: boolean) {
  return Date.parse(datum + "T00:00:00Z") + (min + (plusDag ? 1440 : 0)) * 60000;
}

function berekenTurnaround(vorige: any, huidige: any, dagprijs: number) {
  if (!vorige) return { uren: 0, bedrag: 0 };
  const thuis = pt(vorige.reisTerugThuis) ?? pt(vorige.eind);
  const vertrek = pt(huidige.reisHeenVertrek) ?? pt(huidige.start);
  if (thuis == null || vertrek == null) return { uren: 0, bedrag: 0 };
  const eindV = pt(vorige.eind);
  const overMidder = eindV != null && pt(vorige.start) != null && eindV <= (pt(vorige.start) as number);
  const t1 = toTs(vorige.datum, thuis, overMidder || thuis < (eindV ?? 0));
  const t2 = toTs(huidige.datum, vertrek, false);
  const rust = (t2 - t1) / 3600000;
  if (rust <= 0) return { uren: 0, bedrag: 0 };
  const gat = Math.max(0, Math.round((Date.parse(huidige.datum) - Date.parse(vorige.datum)) / 86400000) - 1);
  const norm = Math.min(RS.turnaroundMinUren + gat * 24, RS.weekendTurnaroundUren);
  const tekort = Math.max(0, norm - rust);
  if (tekort <= 0) return { uren: 0, bedrag: 0 };
  const kwart = Math.ceil(tekort * 4) / 4;
  return { uren: r2(kwart), bedrag: r2(kwart * (RS.turnaroundPct / 100) * (dagprijs / 10)) };
}

function isoWeek(ds: string) {
  const d = new Date(ds + "T00:00:00Z");
  const dag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dag + 3);
  const eerste = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - eerste.getTime()) / 86400000 - 3 + ((eerste.getUTCDay() + 6) % 7)) / 7);
  return { week, jaar: d.getUTCFullYear() };
}

// Nachten en zondagen die al in de dagprijs zitten: 10 procent van de geplande
// draaidagen per blok, productiebreed, de eerste zoveel kalenderdata van dat blok.
function inbegrepenData(dagen: any[], soort: "nacht" | "zondag") {
  const perBlok: Record<string, string[]> = {};
  dagen
    .filter((d) => (soort === "nacht" ? d.nacht : d.zondag))
    .sort((a, b) => (a.datum < b.datum ? -1 : 1))
    .forEach((d) => {
      const b = d.blok || "NL";
      (perBlok[b] = perBlok[b] || []).push(d.datum);
    });
  const uit: Record<string, boolean> = {};
  const quota: Record<string, number> = {};
  Object.keys(perBlok).forEach((b) => {
    const pct = soort === "nacht" ? RS.vrijeNachtenPct : RS.zondagVrijPct;
    const q = Math.round((pct / 100) * ((RS.geplandePerBlok as any)[b] || 0));
    quota[b] = q;
    perBlok[b].slice(0, q).forEach((dt) => (uit[dt] = true));
  });
  return { data: uit, quota, perBlok };
}

// ---------------------------------------------------------------- ophalen

async function haalAlles(crewId: string) {
  const crewRec: any = await at("/" + T.crew + "/" + crewId);

  const dagRecs = await alleRecords(T.draaidagen, "?pageSize=100");
  const draaidagen = dagRecs
    .map((r: any) => ({
      id: r.id,
      datum: r.fields[F.dag.datum],
      dd: r.fields[F.dag.dd],
      blok: r.fields[F.dag.blok],
      crewcall: r.fields[F.dag.crewcall],
      wrap: r.fields[F.dag.wrap],
      lunch: r.fields[F.dag.lunch],
      locatie: r.fields[F.dag.locatie],
      setadres: r.fields[F.dag.setadres],
      nacht: !!r.fields[F.dag.nacht],
      zondag: !!r.fields[F.dag.zondag],
    }))
    .filter((d: any) => d.datum)
    .sort((a: any, b: any) => (a.datum < b.datum ? -1 : 1));

  const filter = encodeURIComponent("RECORD_ID({" + "Crew" + "}) != ''");
  const urenRecs = await alleRecords(T.uren, "?pageSize=100");
  const mijnUren = urenRecs.filter((r: any) => (r.fields[F.uur.crew] || []).indexOf(crewId) > -1);

  const weekRecs = await alleRecords(T.weekstaat, "?pageSize=100");
  const mijnWeken = weekRecs.filter((r: any) => (r.fields[F.week.crew] || []).indexOf(crewId) > -1);

  const inbNacht = inbegrepenData(draaidagen, "nacht");
  const inbZondag = inbegrepenData(draaidagen, "zondag");

  return {
    productie: "Bon Bini, Jetzt Geht's Los",
    regelset: RS,
    inbegrepen: {
      nachten: inbNacht.data,
      zondagen: inbZondag.data,
      quotaNacht: inbNacht.quota,
      quotaZondag: inbZondag.quota,
      nachtdagenPerBlok: inbNacht.perBlok,
      zondagenPerBlok: inbZondag.perBlok,
    },
    ik: {
      id: crewRec.id,
      naam: crewRec.fields[F.crew.naam] || "",
      functie: crewRec.fields[F.crew.functie] || "",
      email: crewRec.fields[F.crew.email] || "",
      dagprijs: crewRec.fields[F.crew.dagprijs] || 0,
      groot: !!crewRec.fields[F.crew.groot],
      otRegelset: crewRec.fields[F.crew.otRegelset] !== false,
      gegevens: {
        straat: crewRec.fields[F.crew.straat] || "",
        postcode: crewRec.fields[F.crew.postcode] || "",
        woonplaats: crewRec.fields[F.crew.woonplaats] || "",
        telefoon: crewRec.fields[F.crew.telefoon] || "",
        geboortedatum: crewRec.fields[F.crew.geboortedatum] || "",
        allergieen: crewRec.fields[F.crew.allergieen] || "",
        bhv: crewRec.fields[F.crew.bhv] || "",
        contractvorm: crewRec.fields[F.crew.contractvorm] || "",
        bedrijfsnaam: crewRec.fields[F.crew.bedrijfsnaam] || "",
        btw: crewRec.fields[F.crew.btw] || "",
        kvk: crewRec.fields[F.crew.kvk] || "",
        payrollsysteem: crewRec.fields[F.crew.payrollsysteem] || "",
        kenteken: crewRec.fields[F.crew.kenteken] || "",
        noodcontact: crewRec.fields[F.crew.noodcontact] || "",
        iban: crewRec.fields[F.crew.iban] || "",
      },
    },
    draaidagen,
    uren: mijnUren.map((r: any) => ({
      id: r.id,
      datum: r.fields[F.uur.datum],
      start: r.fields[F.uur.start] || "",
      eind: r.fields[F.uur.eind] || "",
      reisHeenVertrek: r.fields[F.uur.reisHeenVertrek] || "",
      reisHeenAankomst: r.fields[F.uur.reisHeenAankomst] || "",
      reisTerugVertrek: r.fields[F.uur.reisTerugVertrek] || "",
      reisTerugThuis: r.fields[F.uur.reisTerugThuis] || "",
      km: r.fields[F.uur.km] || "",
      vervoer: (r.fields[F.uur.vervoer] || {}).name || "",
      parkeer: r.fields[F.uur.parkeer] || "",
      opmerking: r.fields[F.uur.opmerking] || "",
    })),
    weken: mijnWeken.map((r: any) => ({
      id: r.id,
      week: r.fields[F.week.weeknummer],
      jaar: r.fields[F.week.jaar],
      status: (r.fields[F.week.status] || {}).name || "Open",
      totaal: r.fields[F.week.totaal] || 0,
      pmAkkoord: !!r.fields[F.week.pmAkkoord],
    })),
  };
}

// ---------------------------------------------------------------- schrijven

// Een week die op Akkoord of Verwerkt staat is dicht. Dat wordt hier op de server
// gecontroleerd, niet alleen in het scherm, zodat er niet omheen te werken is.
function weekOpSlot(weken: any[], datum: string) {
  const w = isoWeek(datum);
  const rec = weken.filter((x) => x.week === w.week && x.jaar === w.jaar)[0];
  if (!rec) return false;
  return rec.status === "Akkoord" || rec.status === "Verwerkt";
}

async function bewaarDag(crewId: string, body: any) {
  const alles = await haalAlles(crewId);
  const datum = String(body.datum || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) throw new Error("Ongeldige datum");
  if (weekOpSlot(alles.weken, datum)) {
    return { ok: false, reden: "Deze week is al afgetikt door de productie en kan niet meer worden gewijzigd. Mail de productieleider als er iets niet klopt." };
  }

  const dag = alles.draaidagen.filter((d: any) => d.datum === datum)[0] || {};
  const bestaand = alles.uren.filter((u: any) => u.datum === datum)[0];

  if (body.nietGewerkt) {
    if (bestaand) await at("/" + T.uren + "/" + bestaand.id, { method: "DELETE" });
    return { ok: true, verwijderd: true };
  }

  const vervoer = String(body.vervoer || "");
  const materiaal = vervoer === "Eigen auto met materiaal";
  const geenKm = vervoer === "Huurauto of bus van de productie" || vervoer === "Meegereden" || vervoer === "Openbaar vervoer";
  const km = geenKm ? 0 : Math.max(0, getal(body.km));

  const velden: any = {
    [F.uur.crew]: [crewId],
    [F.uur.datum]: datum,
    [F.uur.start]: String(body.start || ""),
    [F.uur.eind]: String(body.eind || ""),
    [F.uur.pauze]: RS.lunchVast,
    [F.uur.reisHeenVertrek]: String(body.reisHeenVertrek || ""),
    [F.uur.reisHeenAankomst]: String(body.reisHeenAankomst || ""),
    [F.uur.reisTerugVertrek]: String(body.reisTerugVertrek || ""),
    [F.uur.reisTerugThuis]: String(body.reisTerugThuis || ""),
    [F.uur.km]: km,
    [F.uur.kmTarief]: materiaal ? "materiaal 0,32" : "personen 0,23",
    [F.uur.parkeer]: Math.max(0, getal(body.parkeer)),
    [F.uur.opmerking]: String(body.opmerking || ""),
    [F.uur.setlocatie]: dag.locatie || "",
    [F.uur.nacht]: !!dag.nacht,
    [F.uur.zondag]: !!dag.zondag,
  };
  if (vervoer) velden[F.uur.vervoer] = vervoer;

  if (bestaand) {
    await at("/" + T.uren + "/" + bestaand.id, { method: "PATCH", body: JSON.stringify({ fields: velden, typecast: true }) });
    return { ok: true, id: bestaand.id };
  }
  const nieuw: any = await at("/" + T.uren, { method: "POST", body: JSON.stringify({ fields: velden, typecast: true }) });
  return { ok: true, id: nieuw.id };
}

// De week doorrekenen en indienen. De motor draait hier, niet in het scherm, zodat
// wat er in de weekstaat komt te staan altijd van de server komt.
async function dienWeekIn(crewId: string, weeknummer: number) {
  const alles = await haalAlles(crewId);
  const bestaandeWeek = alles.weken.filter((w: any) => w.week === weeknummer)[0];
  if (bestaandeWeek && (bestaandeWeek.status === "Akkoord" || bestaandeWeek.status === "Verwerkt")) {
    return { ok: false, reden: "Deze week is al afgetikt." };
  }

  const dagprijs = getal(alles.ik.dagprijs);
  if (!dagprijs) return { ok: false, reden: "Er staat nog geen dagprijs in je contract. Vraag de productie om die in te vullen." };

  const inWeek = alles.uren
    .filter((u: any) => u.datum && isoWeek(u.datum).week === weeknummer)
    .sort((a: any, b: any) => (a.datum < b.datum ? -1 : 1));
  if (!inWeek.length) return { ok: false, reden: "Er staan nog geen ingevulde dagen in deze week." };

  const tot = { uren: 0, ot: 0, nacht: 0, reis: 0, ta: 0, zondag: 0, km: 0, parkeer: 0 };
  let vorige: any = null;

  // de vorige draaidag kan in de week ervoor liggen; die telt mee voor turnaround
  const alleIngevuld = alles.uren.slice().sort((a: any, b: any) => (a.datum < b.datum ? -1 : 1));

  for (const u of inWeek) {
    const dag = alles.draaidagen.filter((d: any) => d.datum === u.datum)[0] || {};
    const materiaal = u.vervoer === "Eigen auto met materiaal";
    const c = berekenDag({
      dagprijs,
      groot: alles.ik.groot,
      start: u.start,
      eind: u.eind,
      reisuren: reisurenUit(u),
      km: u.km,
      kmTarief: materiaal ? RS.kmMateriaal : RS.kmPersonen,
      zondag: dag.zondag,
    });
    const nachtVrij = dag.nacht && alles.inbegrepen.nachten[u.datum];
    const zonVrij = dag.zondag && alles.inbegrepen.zondagen[u.datum];
    const idx = alleIngevuld.findIndex((x: any) => x.datum === u.datum);
    vorige = idx > 0 ? alleIngevuld[idx - 1] : null;
    const ta = berekenTurnaround(vorige, u, dagprijs);

    tot.uren += c.gewerkteUren;
    tot.ot += c.otE;
    tot.nacht += dag.nacht && !nachtVrij ? c.naE : 0;
    tot.reis += c.reE;
    tot.ta += ta.bedrag;
    tot.zondag += zonVrij ? 0 : c.zoE;
    tot.km += c.kmB;
    tot.parkeer += Math.max(0, getal(u.parkeer));

    await at("/" + T.uren + "/" + u.id, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [F.uur.gewerkteUren]: c.gewerkteUren,
          [F.uur.otUren]: c.otUren,
          [F.uur.otBedrag]: c.otE,
          [F.uur.nachtUren]: dag.nacht ? c.nachtUren : 0,
          [F.uur.nachtBedrag]: dag.nacht && !nachtVrij ? c.naE : 0,
          [F.uur.reisuren]: c.reisuren,
          [F.uur.reisBedrag]: c.reE,
          [F.uur.kmBedrag]: c.kmB,
          [F.uur.taUren]: ta.uren,
          [F.uur.taBedrag]: ta.bedrag,
          [F.uur.zondagBedrag]: zonVrij ? 0 : c.zoE,
          [F.uur.totaal]: r2(c.otE + (dag.nacht && !nachtVrij ? c.naE : 0) + c.reE + c.kmB + ta.bedrag + (zonVrij ? 0 : c.zoE) + Math.max(0, getal(u.parkeer))),
        },
      }),
    });
  }

  const totaal = r2(tot.ot + tot.nacht + tot.reis + tot.ta + tot.zondag + tot.km + tot.parkeer);
  const jaar = isoWeek(inWeek[0].datum).jaar;
  const velden: any = {
    [F.week.naam]: alles.ik.naam + " week " + weeknummer,
    [F.week.crew]: [crewId],
    [F.week.weeknummer]: weeknummer,
    [F.week.jaar]: jaar,
    [F.week.gewerkteUren]: r2(tot.uren),
    [F.week.ot]: r2(tot.ot),
    [F.week.nacht]: r2(tot.nacht),
    [F.week.reis]: r2(tot.reis),
    [F.week.turnaround]: r2(tot.ta),
    [F.week.zondag]: r2(tot.zondag),
    [F.week.km]: r2(tot.km),
    [F.week.parkeer]: r2(tot.parkeer),
    [F.week.totaal]: totaal,
    [F.week.status]: "Ingediend",
  };

  if (bestaandeWeek) {
    await at("/" + T.weekstaat + "/" + bestaandeWeek.id, { method: "PATCH", body: JSON.stringify({ fields: velden, typecast: true }) });
    return { ok: true, totaal, id: bestaandeWeek.id };
  }
  const nieuw: any = await at("/" + T.weekstaat, { method: "POST", body: JSON.stringify({ fields: velden, typecast: true }) });
  return { ok: true, totaal, id: nieuw.id };
}

// Eigen gegevens bijwerken. Schrijft in het eigen crewrecord, dus er ontstaat nooit
// een tweede regel voor dezelfde persoon.
async function bewaarGegevens(crewId: string, body: any) {
  const g = body.gegevens || {};
  const velden: any = {};
  const mag: [string, string][] = [
    ["straat", F.crew.straat],
    ["postcode", F.crew.postcode],
    ["woonplaats", F.crew.woonplaats],
    ["telefoon", F.crew.telefoon],
    ["geboortedatum", F.crew.geboortedatum],
    ["allergieen", F.crew.allergieen],
    ["bhv", F.crew.bhv],
    ["contractvorm", F.crew.contractvorm],
    ["bedrijfsnaam", F.crew.bedrijfsnaam],
    ["btw", F.crew.btw],
    ["kvk", F.crew.kvk],
    ["payrollsysteem", F.crew.payrollsysteem],
    ["kenteken", F.crew.kenteken],
    ["noodcontact", F.crew.noodcontact],
    ["iban", F.crew.iban],
  ];
  mag.forEach(([sleutel, veld]) => {
    if (g[sleutel] !== undefined) velden[veld] = g[sleutel] === "" ? null : g[sleutel];
  });
  if (!Object.keys(velden).length) return { ok: true, ongewijzigd: true };
  await at("/" + T.crew + "/" + crewId, { method: "PATCH", body: JSON.stringify({ fields: velden, typecast: true }) });
  return { ok: true };
}

// ---------------------------------------------------------------- handler

export default async (req: Request) => {
  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const t = (url.searchParams.get("t") || "").trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(t)) return json({ fout: "geen geldige code" }, 400);
      return json(await haalAlles(t));
    }

    if (req.method === "POST") {
      const body: any = await req.json();
      const t = String(body.t || "").trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(t)) return json({ fout: "geen geldige code" }, 400);

      if (body.actie === "dag") return json(await bewaarDag(t, body));
      if (body.actie === "week") return json(await dienWeekIn(t, +body.week));
      if (body.actie === "gegevens") return json(await bewaarGegevens(t, body));
      return json({ fout: "onbekende actie" }, 400);
    }

    return json({ fout: "methode niet toegestaan" }, 405);
  } catch (e: any) {
    return json({ fout: String(e && e.message ? e.message : e) }, 500);
  }
};

export const config = { path: "/api/portaal" };
