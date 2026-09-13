// De enige plek in dit project die met Airtable praat.
//
// Waarom: zolang elke functie zelf fetch naar api.airtable.com doet, zit het hele
// systeem vast aan Airtable. Gaat er ooit een andere database onder, dan vervang je
// dit bestand en merken de modules er niets van. Dat is de reden dat dit bestaat, en
// daarom is de regel hard: geen enkele module doet zelf een fetch naar Airtable.
//
// Wat hier NIET in hoort: rekenregels, tekst voor de crew, mailinhoud, beslissingen.
// Dit bestand haalt en schrijft records, verder niets.

import { BASE, T } from "./velden.mts";

const API = "https://api.airtable.com/v0/" + BASE;

// De productie waar dit systeem nu voor draait. Zodra er een tweede productie naast
// komt, krijgt elke tabel een veld Productie en filtert dit bestand daarop. Nu staat
// het hier alvast op een plek in plaats van verspreid door de functies.
export const PRODUCTIE = "Bon Bini JGL";

export type Record_ = { id: string; fields: any };

// --------------------------------------------------------------- ruwe aanroep

async function aanroep(pad: string, opties: RequestInit = {}) {
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

// --------------------------------------------------------------- lezen

/** Alle records van een tabel, met paginering. Altijd op veld-id, nooit op veldnaam,
 *  zodat een hernoemde kolom niets breekt. */
export async function alleRecords(tabel: string, extra = ""): Promise<Record_[]> {
  const uit: Record_[] = [];
  let offset = "";
  do {
    const q =
      "?returnFieldsByFieldId=true" +
      (extra ? "&" + extra : "") +
      (offset ? "&offset=" + offset : "");
    const d: any = await aanroep("/" + tabel + q);
    uit.push(...d.records);
    offset = d.offset || "";
  } while (offset);
  return uit;
}

/** Een record op id. */
export async function haalRecord(tabel: string, id: string): Promise<Record_> {
  return (await aanroep(
    "/" + tabel + "/" + id + "?returnFieldsByFieldId=true",
  )) as Record_;
}

/** Records die op een veld een bepaalde waarde hebben. Filtert in de code en niet met
 *  filterByFormula, omdat een formule met veld-ids niet werkt en met veldnamen breekt
 *  zodra iemand een kolom hernoemt. */
export async function recordsWaar(
  tabel: string,
  veld: string,
  waarde: any,
): Promise<Record_[]> {
  const alles = await alleRecords(tabel);
  return alles.filter((r) => r.fields[veld] === waarde);
}

// --------------------------------------------------------------- schrijven

/** Nieuw record. */
export async function maak(tabel: string, velden: any): Promise<Record_> {
  return (await aanroep("/" + tabel, {
    method: "POST",
    body: JSON.stringify({ fields: velden, typecast: true }),
  })) as Record_;
}

/** Bestaand record bijwerken. Alleen de meegegeven velden veranderen. */
export async function werkBij(
  tabel: string,
  id: string,
  velden: any,
): Promise<Record_> {
  return (await aanroep("/" + tabel + "/" + id, {
    method: "PATCH",
    body: JSON.stringify({ fields: velden, typecast: true }),
  })) as Record_;
}

/** Aanmaken of bijwerken in een aanroep, waarbij Airtable zelf op het sleutelveld
 *  bepaalt of het bestaat.
 *
 *  Dit is niet hetzelfde als eerst zoeken en dan aanmaken, en dat verschil is de reden
 *  dat deze functie er is. Netlify garandeert dat een geplande functie MINSTENS een keer
 *  draait, niet hoogstens een keer. Bij twee overlappende runs ziet de zoekstap in beide
 *  runs nog geen record en maken ze er allebei een aan. Op 1 september leverde dat twee
 *  draaidagen op voor 8 en voor 9 september. Airtable doet deze upsert aan zijn kant in
 *  een stap, dus dat kan hier niet gebeuren. */
export async function upsert(
  tabel: string,
  sleutelveld: string,
  velden: any,
): Promise<Record_ | null> {
  const antwoord: any = await aanroep("/" + tabel + "?returnFieldsByFieldId=true", {
    method: "PATCH",
    body: JSON.stringify({
      performUpsert: { fieldsToMergeOn: [sleutelveld] },
      records: [{ fields: velden }],
      typecast: true,
    }),
  });
  const recs = (antwoord && antwoord.records) || [];
  return recs[0] || null;
}

/** Meerdere records tegelijk bijwerken. Airtable neemt er maximaal tien per aanroep,
 *  dus dit hakt de lijst zelf in stukken. */
export async function werkBijVeel(
  tabel: string,
  records: { id: string; fields: any }[],
): Promise<void> {
  for (let i = 0; i < records.length; i += 10) {
    await aanroep("/" + tabel, {
      method: "PATCH",
      body: JSON.stringify({ records: records.slice(i, i + 10), typecast: true }),
    });
  }
}

/** Record weggooien. Bewust apart en zonder lus: verwijderen in bulk is te makkelijk
 *  per ongeluk. */
export async function verwijder(tabel: string, id: string): Promise<void> {
  await aanroep("/" + tabel + "/" + id, { method: "DELETE" });
}

// --------------------------------------------------------------- veelgebruikt

/** De regelset van de productie. Er is er precies een. */
export async function regelset(): Promise<Record_ | null> {
  const recs = await alleRecords(T.regelset, "pageSize=1");
  return recs[0] || null;
}

export { T };
