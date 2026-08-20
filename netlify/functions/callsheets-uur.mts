// De klok achter het inlezen van callsheets.
//
// Netlify roept deze functie elk uur aan. Hij doet zelf niets anders dan de echte
// inleesfunctie aanzetten. Dat is bewust gescheiden: /api/callsheets kun je ook met de
// hand openen om te zien wat er gebeurt, en deze hier is puur de wekker.

export default async () => {
  const r = await fetch("https://bonbini-uren.netlify.app/api/callsheets");
  const tekst = await r.text();
  console.log("callsheets uurloop", r.status, tekst.slice(0, 500));
};

export const config = { schedule: "@hourly" };
