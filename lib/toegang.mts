// Wie mag wat. De enige plek waar dat bepaald wordt.
//
// Vandaag is toegang een persoonlijke link met het record-id erin. Dat is gemak en geen
// beveiliging: wie de link doorstuurt geeft toegang weg. Voor een productie waarin
// iedereen elkaar kent is dat een verdedigbare keuze, voor een product niet. Wordt het
// later echte inlog met rollen, dan verandert alleen dit bestand en merken de modules er
// niets van. Dat is de reden dat het bestaat.
//
// Regel: geen module beslist zelf of iemand iets mag. Die vraag stelt hij hier.

import { CREW, DAG, WEEK } from "./velden.mts";
import type { Record_ } from "./data.mts";

/** Wat een module over de bezoeker moet weten. Meer niet: geen dagprijs, geen IBAN. */
export type Bezoeker = {
  id: string;
  naam: string;
  voornaam: string;
  doetMeeMetUren: boolean;
  krijgtToeslagen: boolean;
  opDeProductie: boolean;
};

/** De code uit de link is het record-id van het crewlid. Deze functie bestaat zodat
 *  modules dat gegeven niet zelf uit het adres vissen; wordt het later een sessie of een
 *  token, dan is dit de enige plek die verandert. */
export function codeUitVerzoek(adres: string): string {
  try {
    return new URL(adres).searchParams.get("t") || "";
  } catch {
    return "";
  }
}

/** Een crewrecord vertalen naar wat een module mag weten.
 *
 *  Let op de vinkjes: Airtable geeft een uitgevinkte checkbox niet terug als false maar
 *  laat het veld weg. Een test op "niet gelijk aan false" is daardoor altijd waar. Daarom
 *  staat het hier overal als "is waar", nooit als "is niet onwaar". */
export function bezoekerUit(rec: Record_): Bezoeker {
  const f = rec.fields || {};
  const naam = String(f[CREW.naam] || "");
  return {
    id: rec.id,
    naam,
    voornaam: String(f[CREW.voornaam] || naam.split(" ")[0] || ""),
    doetMeeMetUren: f[CREW.doetNietMeeMetUren] !== true,
    krijgtToeslagen: f[CREW.otRegelset] === true,
    opDeProductie: f[CREW.nietMeerOpProductie] !== true,
  };
}

/** Mag deze persoon het urenportaal gebruiken.
 *
 *  Hier zit het gat dat nu nog openstaat: het portaal controleert dit niet, alleen de
 *  mails doen dat. Wie op "Doet niet mee met uren" staat kan via zijn link toch invullen.
 *  Zodra portaal.mts op dit bestand aansluit is dat dicht. */
export function magUrenInvullen(b: Bezoeker): boolean {
  return b.opDeProductie && b.doetMeeMetUren;
}

/** Stond deze persoon op het callsheet van die draaidag.
 *
 *  Het callsheet levert alleen voornamen, als komma-gescheiden tekst in het veld
 *  "Crew op callsheet". Vergelijken gebeurt dus op voornaam en hoofdletterongevoelig, en
 *  dat is per definitie grof: twee mensen met dezelfde voornaam zijn niet uit elkaar te
 *  houden. Daarom is dit geen slot maar een signaal.
 *
 *  LET OP bij het aansluiten: weekmails.mts doet vandaag zijn eigen vergelijking om te
 *  bepalen wie een mail krijgt. Voordat die functie hierop overgaat, moeten beide
 *  implementaties naast elkaar gelegd worden. Ze mogen niet uit elkaar gaan lopen, want
 *  dan krijgt iemand wel een mail en geen invulrecht, of andersom. */
export function stondOpCallsheet(b: Bezoeker, draaidag: Record_): boolean {
  const ruw = String((draaidag.fields || {})[DAG.crewOpCallsheet] || "");
  if (!ruw.trim()) return false;
  const namen = ruw
    .split(",")
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  return namen.indexOf(b.voornaam.trim().toLowerCase()) > -1;
}

/** Is deze week afgetikt en dus op slot.
 *
 *  Dit hoort op de server te staan en niet alleen in het scherm, anders is er omheen te
 *  werken. Dat is vandaag ook zo geregeld in portaal.mts; deze functie is de plek waar
 *  die regel straks woont. */
export function weekOpSlot(weekstaat: Record_ | null | undefined): boolean {
  if (!weekstaat) return false;
  const f = weekstaat.fields || {};
  const status = String(f[WEEK.status] || "");
  return f[WEEK.pmAkkoord] === true || status === "Akkoord";
}

/** De persoonlijke links van een crewlid. Ze worden in Airtable als formule samengesteld;
 *  deze functies zijn er zodat een module niet zelf een link in elkaar zet. */
export function urenlink(rec: Record_): string {
  return String((rec.fields || {})[CREW.urenlink] || "");
}

export function gegevenslink(rec: Record_): string {
  return String((rec.fields || {})[CREW.gegevenslink] || "");
}
