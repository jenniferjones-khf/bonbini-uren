# Urenportaal Bon Bini, Jetzt Geht's Los

De pagina waarop crew per draaidag zijn uren invult. Draait op Netlify, alle gegevens
staan in Airtable.

## Hoe het in elkaar zit

| Onderdeel | Wat het doet |
| --- | --- |
| `index.html` | De pagina die crew ziet. Rekent live mee zodat je meteen ziet wat een dag oplevert. |
| `netlify/functions/portaal.mts` | De serverfunctie. Enige plek waar de Airtable-sleutel staat. Haalt gegevens op, slaat dagen op, rekent de week door en dient hem in. |
| `netlify.toml` | Instellingen: waar de functie staat en welke kopregels de pagina meekrijgt. |

Elk crewlid heeft een eigen link: `https://bonbini-uren.netlify.app/?t=<record-id>`.
Die code is het record-id van het crewrecord in Airtable. Er is dus geen aparte
sleutellijst; een link werkt zolang het crewrecord bestaat. In Airtable staat de link
kant en klaar in de kolom **Mijn urenlink**.

## Instellen

Eén omgevingsvariabele, in Netlify onder Site configuration, Environment variables:

- `AIRTABLE_TOKEN` — een Airtable personal access token met toegang tot alleen de base
  `app4HQkMqFpZCnqpv`, met de rechten `data.records:read` en `data.records:write`.

Die sleutel staat alleen op de server. De pagina in de telefoon van het crewlid krijgt
hem nooit te zien en kan daardoor ook alleen bij de eigen gegevens.

## De regels die de motor rekent

Interim gelden de crewafspraken van Quiet Girl, De Stilte. Ze staan bovenin
`portaal.mts` in het blok `RS` en zijn daar in één keer aan te passen.

- Draaidag is 10 uur en 15 minuten op set, inclusief 45 minuten lunch. De lunch staat
  vast en is niet in te vullen.
- Overuren: eerste tot en met vierde 150 procent, daarna 200 procent, over dagprijs
  gedeeld door tien.
- Nacht: gewerkte uren tussen 00:00 en 06:00, 50 procent bovenop de uurprijs. Tien
  procent van de nachten per draaiblok zit al in de dagprijs.
- Reisuren: eerste twee uur per dag voor eigen rekening, daarboven 150 procent. Rijdt
  iemand groot materiaal, dan tellen alle reisuren tegen 100 procent.
- Turnaround: norm tien uur rust, per vrije dag ertussen 24 uur erbij tot maximaal 58.
  Tekort per afgerond kwartier tegen 150 procent.
- Zondag of feestdag: 50 procent over de dagprijs, ook hier tien procent per blok in de
  dagprijs inbegrepen.
- Kilometers: 0,23 per kilometer, of 0,32 bij materiaalvervoer.
- Geen stapeling. Een uur telt maar onder één noemer, de hoogste.

## Slot na akkoord

Zodra de productie een week op **Akkoord** zet, weigert de server elke wijziging aan de
dagen van die week. Dat gebeurt in `weekOpSlot()` in de functie, niet alleen in het
scherm, zodat er niet omheen te werken is.

## Wat er nog niet in zit

- Kilometers worden nog niet automatisch berekend uit woonadres en setadres.
- Crew kan zijn weekoverzicht nog niet zelf per mail opvragen.
