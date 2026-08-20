// De wekker achter het inlezen van callsheets en contracten.
//
// Draait elke ochtend om 05:00 UTC. Dat is 06:00 Nederlandse tijd in de winter, en de
// draaiblokken van deze productie vallen in november, december en februari, dus in de
// winter. In de zomer zou het 07:00 zijn; dat maakt hier niet uit.
//
// Waarom een keer per dag en niet vaker: een callsheet gaat de avond ervoor rond en is
// dan definitief. Op de draaidag zelf wordt het callsheet van diezelfde dag niet meer
// aangepast. Een run in de vroege ochtend zet de draaidag dus op tijd klaar, voordat er
// iemand op set staat. Voor contracten geldt hetzelfde ritme: staat er een nieuw of
// vervangen contract in de map, dan staan de afspraken de volgende ochtend in Airtable.
//
// Wil je tussendoor toch bijwerken, open dan /api/callsheets of /api/contracten in je
// browser. Dan doet hij hetzelfde en zie je meteen wat hij gelezen heeft.
//
// /api/weekmails kijkt daarna of vandaag de eerste draaidag van een draaiweek is, of
// gisteren de laatste. Zo ja, dan zet hij het bijbehorende vinkje aan bij de crew en
// stuurt Bonnie vanuit Airtable de mail.

export default async () => {
  for (const pad of ["/api/callsheets", "/api/contracten", "/api/weekmails"]) {
    try {
      const r = await fetch("https://bonbini-uren.netlify.app" + pad);
      console.log("ochtendrun", pad, r.status, (await r.text()).slice(0, 600));
    } catch (e: any) {
      console.log("ochtendrun", pad, "mislukt", String(e && e.message ? e.message : e));
    }
  }
};

export const config = { schedule: "0 5 * * *" };
