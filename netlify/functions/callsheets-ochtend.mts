// De wekker achter het inlezen van callsheets.
//
// Draait elke ochtend om 05:00 UTC. Dat is 06:00 Nederlandse tijd in de winter, en de
// draaiblokken van deze productie vallen in november, december en februari, dus in de
// winter. In de zomer zou het 07:00 zijn; dat maakt hier niet uit.
//
// Waarom een keer per dag en niet vaker: een callsheet gaat de avond ervoor rond en is
// dan definitief. Op de draaidag zelf wordt het callsheet van diezelfde dag niet meer
// aangepast. Een run in de vroege ochtend zet de draaidag dus op tijd klaar, voordat er
// iemand op set staat.
//
// Wil je tussendoor toch bijwerken, open dan /api/callsheets in je browser. Dan doet hij
// hetzelfde en zie je meteen wat hij gelezen heeft.

export default async () => {
  const r = await fetch("https://bonbini-uren.netlify.app/api/callsheets");
  const tekst = await r.text();
  console.log("callsheets ochtendrun", r.status, tekst.slice(0, 500));
};

export const config = { schedule: "0 5 * * *" };
