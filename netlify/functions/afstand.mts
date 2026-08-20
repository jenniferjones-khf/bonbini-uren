// Afstand tussen twee adressen, in kilometers over de weg.
//
// Waarom dit apart staat: het portaal gebruikt het om de kilometers alvast in te vullen
// als een crewlid een draaidag opent, en de callsheet-inlezer gebruikt het om het
// setadres om te zetten in coördinaten. Eén plek, dus één antwoord.
//
// Drie manieren, in deze volgorde:
// 1. Google, als de sleutel GOOGLE_MAPS_KEY op de server staat. Adressen gaan er zo in
//    en de afstand over de weg komt eruit. Dit is de nauwkeurige route.
// 2. Zonder sleutel: adressen omzetten in coördinaten via OpenStreetMap en de route
//    opvragen bij de open routedienst OSRM.
// 3. Doet ook dat het even niet, dan de hemelsbrede afstand maal 1,3. Dat is een
//    schatting en kan een paar kilometer schelen; er komt dan ook bron "schatting" mee
//    terug zodat het scherm dat kan laten zien.
//
// Afronden gebeurt altijd naar boven op hele kilometers, in het voordeel van het
// crewlid. Wie minder invult dan berekend krijgt nooit een melding.

const UA = "bonbini-uren/1.0 (productie Bon Bini Jetzt Geht's Los)";

export type Punt = { lat: number; lon: number };

function sleutel() {
  return process.env.GOOGLE_MAPS_KEY || "";
}

// ------------------------------------------------------------------ hulp

export function hemelsbreed(a: Punt, b: Punt) {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function alsPunt(s: any): Punt | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(s || ""));
  return m ? { lat: +m[1], lon: +m[2] } : null;
}

// Naar boven afronden op hele kilometers, want een halve kilometer minder uitbetalen
// omdat de rekenmachine afkapt is precies het soort discussie dat we niet willen.
export function retour(enkeleReisKm: number) {
  return Math.ceil(enkeleReisKm * 2);
}

// ------------------------------------------------------------------ geocoderen

export async function geocode(adres: string): Promise<Punt | null> {
  const tekst = String(adres || "").trim();
  if (!tekst) return null;
  const punt = alsPunt(tekst);
  if (punt) return punt;

  const key = sleutel();
  if (key) {
    const u =
      "https://maps.googleapis.com/maps/api/geocode/json?address=" +
      encodeURIComponent(tekst) + "&region=nl&key=" + key;
    try {
      const d: any = await (await fetch(u)).json();
      const p = d && d.results && d.results[0] && d.results[0].geometry && d.results[0].geometry.location;
      if (p) return { lat: p.lat, lon: p.lng };
    } catch {}
  }

  try {
    const u =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(tekst);
    const d: any = await (await fetch(u, { headers: { "User-Agent": UA } })).json();
    if (Array.isArray(d) && d[0]) return { lat: +d[0].lat, lon: +d[0].lon };
  } catch {}

  return null;
}

// ------------------------------------------------------------------ afstand

export async function afstandKm(van: string, naar: string): Promise<{ km: number | null; bron: string; melding?: string }> {
  const key = sleutel();

  // 1. Google: adressen erin, meters over de weg eruit.
  if (key) {
    try {
      const u =
        "https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins=" +
        encodeURIComponent(van) + "&destinations=" + encodeURIComponent(naar) + "&key=" + key;
      const d: any = await (await fetch(u)).json();
      const el = d && d.rows && d.rows[0] && d.rows[0].elements && d.rows[0].elements[0];
      if (el && el.status === "OK" && el.distance && el.distance.value) {
        return { km: el.distance.value / 1000, bron: "google" };
      }
    } catch {}
  }

  const a = await geocode(van);
  const b = await geocode(naar);
  if (!a || !b) {
    return { km: null, bron: "geen", melding: !a ? "vertrekadres niet gevonden" : "setadres niet gevonden" };
  }

  // 2. OSRM, de open routedienst. Echte wegafstand, geen sleutel nodig.
  try {
    const u =
      "https://router.project-osrm.org/route/v1/driving/" +
      a.lon + "," + a.lat + ";" + b.lon + "," + b.lat + "?overview=false";
    const d: any = await (await fetch(u, { headers: { "User-Agent": UA } })).json();
    if (d && d.code === "Ok" && d.routes && d.routes[0] && d.routes[0].distance) {
      return { km: d.routes[0].distance / 1000, bron: "osrm" };
    }
  } catch {}

  // 3. Laatste redmiddel: hemelsbreed maal 1,3.
  return { km: hemelsbreed(a, b) * 1.3, bron: "schatting", melding: "geschat, geen routedienst beschikbaar" };
}

// ------------------------------------------------------------------ endpoint

export default async (req: Request) => {
  try {
    const p = new URL(req.url).searchParams;
    const van = p.get("van") || "";
    const naar = p.get("naar") || "";
    if (!van || !naar) {
      return new Response(JSON.stringify({ fout: "geef van en naar mee" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const r = await afstandKm(van, naar);
    return new Response(
      JSON.stringify({ ...r, retourKm: r.km == null ? null : retour(r.km) }, null, 2),
      { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ fout: String(e && e.message ? e.message : e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/afstand" };
