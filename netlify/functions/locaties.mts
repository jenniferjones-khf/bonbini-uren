// Locaties: wat het script vraagt (Decors), wat de scout aandraagt (Locatiekandidaten),
// de foto's daarbij uit Dropbox, en de reacties en cijfers van de heads.
//
// De foto's blijven staan waar ze staan. Deze functie haalt ze rechtstreeks uit Dropbox
// en zet ze door naar de pagina, zodat er nergens een tweede kopie ontstaat die uit de
// pas gaat lopen met wat de scout aanlevert.
//
// Paden:
//   /api/locaties?k=CODE&actie=lijst                 decors, kandidaten en reacties
//   /api/locaties?k=CODE&actie=fotos&kandidaat=rec…  de foto's van één kandidaat
//   /api/locaties?k=CODE&actie=foto&pad=…            één foto, verkleind
//   /api/locaties?k=CODE&actie=groot&pad=…           dezelfde foto op ware grootte
//   POST /api/locaties?k=CODE                        een reactie opslaan
//
// De code in ?k= staat als LOCATIES_CODE in Netlify. Dat is een drempel, geen slot: wie
// de link doorstuurt geeft toegang weg. Bewuste keuze, want de heads hebben geen account
// en dit zijn scoutfoto's, geen gages.

const BASE = "app4HQkMqFpZCnqpv";
const TB_DECORS = "tbljinqf7KnDAJ2dc";
const TB_KANDIDATEN = "tbldTqBvnxfLcHUZI";
const TB_REACTIES = "tblkbS3gyg6YewYjK";
const TB_PLANNING = "tbltzk59cjqgKkHOt";

const D = {
  decor: "fldh1eoX3WQi8gKhL",
  hoofd: "fld8qcYKi0lvIWP5L",
  intext: "fld3iaZgRogZ668gW",
  scenes: "fldq2qyWOubBq0zkj",
  draaitIn: "fldw7yCEGKEkdBxou",
  adres: "fldctlwFRjqUxdWWP",
  status: "flduz150LveXjHvq6",
  notities: "fldrhdqrHF2PZPnpT",
};

const K = {
  naam: "fldko49Ol4C4hgWui",
  blok: "fldNlps4HxlvHjyAa",
  adres: "fldR96DljikUaKS7i",
  notities: "fld13vcZabAeNaXgO",
  map: "fldoYUVeP4QDLmAaO",
  status: "fldXpV75NOakf4pbp",
  voorDecor: "fldFDgBH3om57tzcY",
  link: "fldOeJwfkusjWGq6B",
};

const P = {
  dag: "flds9yAxSLDDzBIj3",
  datum: "fldhrNgpygrecywJj",
  blok: "fldbuoJ9ujgBVUCQj",
  sets: "fldT2wl420dnsc8j1",
  decor: "fldinmqDvSgCRtC6y",
  scenes: "flddr2OOhXKw6tRzA",
  aantal: "fldSf3HiyVrnYtmoq",
  paginas: "fldwer33sATTDQxx5",
  figuratie: "fldv2mQhaClLmIJWU",
};

const R = {
  titel: "fld7Lqx87rjdCv1g2",
  kandidaat: "fld1O5F7tB0wJig4x",
  wie: "fldQmwxQ2TPYV2n21",
  afdeling: "fldBVOAesoe1ip3XE",
  cijfer: "fldWxR1REVq3IMckS",
  opmerking: "fld6NCYEi8fvBS0YE",
  wanneer: "fldm5c6ePz5iDTb7g",
  advies: "fldh4SJOoAPe83hrZ",
};

const APP_KEY = "rnxxpzxpwl2aawz";
const FOTO = /\.(jpe?g|png|heic|webp)$/i;

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
  if (!r.ok || !d.access_token) throw new Error("Dropbox weigert de sleutel");
  return d.access_token as string;
}

async function dropboxFotos(token: string, map: string) {
  const uit: { pad: string; naam: string }[] = [];
  let r = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ path: map, recursive: true, limit: 500 }),
  });
  let d: any = await r.json();
  if (!r.ok) throw new Error("Dropbox: " + JSON.stringify(d).slice(0, 200));
  const pak = (e: any[]) =>
    e.forEach((x) => {
      if (x[".tag"] === "file" && FOTO.test(x.name)) uit.push({ pad: x.path_display, naam: x.name });
    });
  pak(d.entries || []);
  while (d.has_more) {
    r = await fetch("https://api.dropboxapi.com/2/files/list_folder/continue", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ cursor: d.cursor }),
    });
    d = await r.json();
    if (!r.ok) break;
    pak(d.entries || []);
  }
  uit.sort((a, b) => a.pad.localeCompare(b.pad, "nl"));
  return uit;
}

async function dropboxThumb(token: string, pad: string, groot: boolean) {
  const arg = {
    resource: { ".tag": "path", path: pad },
    format: { ".tag": "jpeg" },
    size: { ".tag": groot ? "w2048h1536" : "w640h480" },
    mode: { ".tag": "strict" },
  };
  const r = await fetch("https://content.dropboxapi.com/2/files/get_thumbnail_v2", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Dropbox-API-Arg": JSON.stringify(arg) },
  });
  if (!r.ok) throw new Error("Dropbox geeft geen voorbeeld van dit bestand");
  return await r.arrayBuffer();
}

// ------------------------------------------------------------------ Airtable

async function airtable(pad: string, opties: any = {}) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN ontbreekt op de server");
  const r = await fetch("https://api.airtable.com/v0/" + BASE + "/" + pad, {
    ...opties,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(opties.headers || {}) },
  });
  const d: any = await r.json();
  if (!r.ok) throw new Error("Airtable: " + JSON.stringify(d).slice(0, 300));
  return d;
}

async function alleRecords(tabel: string) {
  const uit: any[] = [];
  let offset = "";
  do {
    const d = await airtable(encodeURIComponent(tabel) + "?returnFieldsByFieldId=true&pageSize=100" + (offset ? "&offset=" + offset : ""));
    uit.push(...d.records);
    offset = d.offset || "";
  } while (offset);
  return uit;
}

// ------------------------------------------------------------------ lijst

async function lijst() {
  const [decors, kandidaten, reacties, planning] = await Promise.all([
    alleRecords(TB_DECORS),
    alleRecords(TB_KANDIDATEN),
    alleRecords(TB_REACTIES),
    alleRecords(TB_PLANNING),
  ]);

  return {
    decors: decors.map((r: any) => ({
      id: r.id,
      decor: r.fields[D.decor] || "",
      hoofd: r.fields[D.hoofd] || "",
      intext: r.fields[D.intext] || "",
      scenes: r.fields[D.scenes] || 0,
      draaitIn: r.fields[D.draaitIn] || "",
      adres: r.fields[D.adres] || "",
      status: r.fields[D.status] || "",
      notities: r.fields[D.notities] || "",
    })),
    kandidaten: kandidaten.map((r: any) => ({
      id: r.id,
      naam: r.fields[K.naam] || "",
      blok: r.fields[K.blok] || "",
      adres: r.fields[K.adres] || "",
      notities: r.fields[K.notities] || "",
      status: r.fields[K.status] || "",
      link: r.fields[K.link] || "",
      decors: r.fields[K.voorDecor] || [],
    })),
    planning: planning
      .map((r: any) => ({
        dag: r.fields[P.dag] || "",
        datum: r.fields[P.datum] || "",
        blok: r.fields[P.blok] || "",
        sets: r.fields[P.sets] || "",
        decor: r.fields[P.decor] || "",
        scenes: r.fields[P.scenes] || "",
        aantal: r.fields[P.aantal] || 0,
        paginas: r.fields[P.paginas] || "",
        figuratie: r.fields[P.figuratie] || 0,
      }))
      .sort((a: any, b: any) => String(a.datum).localeCompare(String(b.datum))),
    reacties: reacties.map((r: any) => ({
      id: r.id,
      kandidaat: (r.fields[R.kandidaat] || [])[0] || "",
      wie: r.fields[R.wie] || "",
      afdeling: r.fields[R.afdeling] || "",
      cijfer: r.fields[R.cijfer] || 0,
      advies: r.fields[R.advies] || "",
      opmerking: r.fields[R.opmerking] || "",
      wanneer: r.fields[R.wanneer] || "",
    })),
  };
}

// ------------------------------------------------------------------ reactie opslaan

async function bewaarReactie(body: any) {
  const kandidaat = String(body.kandidaat || "");
  const wie = String(body.wie || "").trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(kandidaat)) throw new Error("geen geldige kandidaat");
  if (!wie) throw new Error("vul je naam in");

  const kandRec = await airtable(encodeURIComponent(TB_KANDIDATEN) + "/" + kandidaat + "?returnFieldsByFieldId=true");
  const kandNaam = kandRec.fields[K.naam] || "kandidaat";

  const bestaand = (await alleRecords(TB_REACTIES)).filter(
    (r: any) =>
      ((r.fields[R.kandidaat] || [])[0] || "") === kandidaat &&
      String(r.fields[R.wie] || "").toLowerCase() === wie.toLowerCase(),
  )[0];

  const velden: any = {
    [R.titel]: wie + " over " + kandNaam,
    [R.kandidaat]: [kandidaat],
    [R.wie]: wie,
    [R.afdeling]: String(body.afdeling || "").trim(),
    [R.cijfer]: Math.max(0, Math.min(5, Number(body.cijfer) || 0)),
    [R.advies]: ["Langs gaan", "Twijfel", "Niet nodig"].indexOf(String(body.advies || "")) > -1 ? String(body.advies) : null,
    [R.opmerking]: String(body.opmerking || "").trim(),
    [R.wanneer]: new Date().toISOString(),
  };

  if (bestaand) {
    await airtable(encodeURIComponent(TB_REACTIES) + "/" + bestaand.id, {
      method: "PATCH",
      body: JSON.stringify({ fields: velden }),
    });
    return { bijgewerkt: true };
  }
  await airtable(encodeURIComponent(TB_REACTIES), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: velden }] }),
  });
  return { nieuw: true };
}

// ------------------------------------------------------------------ ingang

export default async (req: Request) => {
  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

  try {
    const url = new URL(req.url);
    const code = process.env.LOCATIES_CODE || "";
    if (!code || (url.searchParams.get("k") || "") !== code) {
      return json({ fout: "geen of verkeerde code achter de link" }, 401);
    }

    if (req.method === "POST") return json(await bewaarReactie(await req.json()));

    const actie = url.searchParams.get("actie") || "lijst";

    if (actie === "lijst") return json(await lijst());

    if (actie === "fotos") {
      const id = url.searchParams.get("kandidaat") || "";
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return json({ fout: "geen geldige kandidaat" }, 400);
      const rec = await airtable(encodeURIComponent(TB_KANDIDATEN) + "/" + id + "?returnFieldsByFieldId=true");
      const map = rec.fields[K.map] || "";
      if (!map) return json({ fotos: [], melding: "Bij deze kandidaat staat geen Dropboxmap." });
      const token = await dropboxToken();
      return json({ fotos: await dropboxFotos(token, map) });
    }

    if (actie === "foto" || actie === "groot") {
      const pad = url.searchParams.get("pad") || "";
      if (!pad.startsWith("/")) return json({ fout: "geen geldig pad" }, 400);
      const token = await dropboxToken();
      const bytes = await dropboxThumb(token, pad, actie === "groot");
      return new Response(bytes, {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
      });
    }

    return json({ fout: "onbekende actie" }, 400);
  } catch (e: any) {
    return json({ fout: String(e && e.message ? e.message : e) }, 500);
  }
};

export const config = { path: "/api/locaties" };
