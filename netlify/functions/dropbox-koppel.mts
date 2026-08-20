// Eenmalige koppeling met Dropbox.
//
// Waarom dit bestaat: de server moet zelf in de Dropbox-map met callsheets kunnen
// kijken, ook als niemand ingelogd is. Dropbox geeft daarvoor een refresh token. Dat
// token wordt hier een keer opgehaald en op het scherm gezet, waarna het als
// omgevingsvariabele DROPBOX_REFRESH_TOKEN in Netlify wordt gezet. Het token komt dus
// nooit in de code of in Airtable te staan.
//
// Er is bewust geen app secret nodig: de Dropbox-app staat op "Allow public clients",
// dus we gebruiken PKCE. Het enige wat in de code staat is de app key, en die is
// openbaar van ontwerp; hij staat ook gewoon in de adresbalk van Dropbox.

const APP_KEY = "rnxxpzxpwl2aawz";
const REDIRECT = "https://bonbini-uren.netlify.app/api/dropbox-koppel";

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pagina(titel: string, binnen: string) {
  return new Response(
    "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
      "<title>" + titel + "</title>" +
      "<style>body{font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;" +
      "max-width:640px;margin:40px auto;padding:0 16px;color:#12141a}h1{font-size:20px}" +
      "code,input{font:14px ui-monospace,Menlo,monospace}input{width:100%;padding:10px;" +
      "border:1px solid #ccc;border-radius:6px}button{padding:10px 14px;border:0;border-radius:6px;" +
      "background:#0f7b52;color:#fff;font-size:15px;cursor:pointer}.let{background:#fdf3e3;" +
      "border-left:3px solid #a2600d;padding:10px 12px;margin:16px 0}</style>" + binnen,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const fout = url.searchParams.get("error");

  if (fout) {
    return pagina("Koppeling afgebroken", "<h1>Koppeling afgebroken</h1><p>Dropbox gaf terug: " + fout + ". Je kunt het gewoon opnieuw proberen.</p>");
  }

  // Stap 1: geen code in de link, dus we sturen door naar Dropbox om toestemming te vragen.
  if (!code) {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = b64url(new Uint8Array(hash));
    const naar =
      "https://www.dropbox.com/oauth2/authorize?client_id=" + APP_KEY +
      "&response_type=code&token_access_type=offline&code_challenge_method=S256" +
      "&code_challenge=" + challenge +
      "&redirect_uri=" + encodeURIComponent(REDIRECT);
    return new Response(null, {
      status: 302,
      headers: {
        Location: naar,
        "Set-Cookie": "dbxv=" + verifier + "; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Lax",
        "Cache-Control": "no-store",
      },
    });
  }

  // Stap 2: terug van Dropbox met een code. Die ruilen we in voor een refresh token.
  const gevonden = /(?:^|;\s*)dbxv=([^;]+)/.exec(req.headers.get("cookie") || "");
  const verifier = gevonden ? gevonden[1] : "";
  if (!verifier) {
    return pagina("Opnieuw beginnen", "<h1>De koppeling is verlopen</h1><p>Begin opnieuw op <a href='/api/dropbox-koppel'>deze link</a>. Het duurt maar even.</p>");
  }

  const r = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: APP_KEY,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
    }),
  });
  const d: any = await r.json();

  if (!r.ok || !d.refresh_token) {
    return pagina("Niet gelukt", "<h1>Dropbox gaf geen token</h1><pre>" + String(JSON.stringify(d)).slice(0, 400) + "</pre>");
  }

  // Het token staat verborgen in het veld; met de knop kopieer je het zonder dat het
  // op je scherm leesbaar wordt. Zo kan er ook niemand overheen meekijken.
  return pagina(
    "Dropbox gekoppeld",
    "<h1>Dropbox is gekoppeld</h1>" +
      "<p>Hieronder staat de sleutel die de server nodig heeft. Kopieer hem met de knop " +
      "en plak hem in Netlify onder <b>Site configuration, Environment variables</b>, " +
      "als variabele <code>DROPBOX_REFRESH_TOKEN</code>. Daarna een keer opnieuw deployen.</p>" +
      "<div class=let>Deze pagina toont de sleutel maar een keer. Kwijt? Open deze link " +
      "gewoon nog een keer, dan krijg je een nieuwe.</div>" +
      "<input id=t type=password readonly value='" + String(d.refresh_token).replace(/'/g, "") + "'>" +
      "<p><button onclick=\"var e=document.getElementById('t');e.select();" +
      "navigator.clipboard.writeText(e.value);this.textContent='Gekopieerd';\">Kopieer de sleutel</button></p>" +
      "<p>Rechten: " + String(d.scope || "") + "</p>"
  );
};

export const config = { path: "/api/dropbox-koppel" };
