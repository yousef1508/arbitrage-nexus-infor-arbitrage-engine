# Arbitrage Nexus

**Et selvstendig prosjekt bygget fra bunnen av, alene: automatisert
datapipeline, AI-agent-orkestrering og blockchain-betalingsverifisering,
kjørende på Cloudflares edge-plattform.**

[GitHub](#) · [Live demo / notater under](#) — *(legg inn lenker her)*

---

## Hva dette er, enkelt forklart

Arbitrage Nexus er et system jeg har designet og bygget som kjører helt på
egen hånd: det følger med på gratis, offentlige kilder (Hacker News, GitHub
Trending, sikkerhetsvarsler, forskningsfeeder, med mer), gjør det den finner
om til strukturerte etterretningsrapporter, publiserer dem offentlig i både
menneske- og maskinlesbart format, og kan ta imot og verifisere
kryptobetalinger direkte på blockchainen for å låse opp hele rapporten —
uten at et menneske selger noe manuelt.

Jeg tar det med her fordi det er det klareste eksempelet jeg har på hvordan
jeg faktisk bygger ting: velger et vanskelig problem med mange deler, lærer
det jeg trenger av ny teknologi underveis, og får et fungerende system til å
kjøre fra start til slutt — ikke bare en demo av én enkelt del.

---

## Hvorfor dette er relevant for stillingen

Aquafind-annonsen ber om en generalist som er komfortabel med å sette seg
raskt inn i nye verktøy, som bruker AI aktivt i arbeidsflyten sin (ikke bare
til å "spørre om kode"), som tar initiativ i stedet for å vente på en
ferdig spesifisert oppgave, og som kan forklare tekniske valg til folk som
ikke er tekniske. Dette prosjektet er beviset på alt dette, konkret:

| Det dere ser etter | Hvor det vises her |
|---|---|
| Bred, selvlært verktøykasse | Frontend (React/Vite/Tailwind), backend (Cloudflare Workers, Hono), stateful infrastruktur (Durable Objects), on-chain betalingsverifisering (rå JSON-RPC-kall mot Polygon), AI-modellorkestrering — ingenting av dette kunne jeg fra før |
| Komfortabel med nye plattformer | Hele stacken (Cloudflare Workers/Agents SDK, Durable Objects) var ny for meg da jeg startet |
| Bruker AI-verktøy til å faktisk løse problemer | Se "Hvordan jeg brukte AI" under — ikke kode-autofullføring, men en reell metode for å bygge og revidere et system som er for stort til å holde i hodet på egen hånd |
| Selvstendig, tar initiativ | Ingen ga meg dette som oppgave. Jeg definerte omfanget, bygget det, og — se "Teknisk vurdering" under — gikk selv kritisk gjennom eget arbeid i stedet for å erklære det ferdig |
| Forklarer tekniske valg tydelig | Denne README-en er skrevet slik at en ikke-teknisk leser kan følge hva systemet gjør og hvorfor, ikke bare en teknisk leser |
| Tenker som produkteier, ikke bare utfører | "Kjente svakheter"-seksjonen finnes fordi jeg reviderte mitt eget arbeid mot min egen opprinnelige spesifikasjon, og prioriterte det som faktisk betyr noe — ikke det som var enklest å fikse |

---

## Arkitektur

```
skrap offentlige kilder (gratis, ingen betalte API-er)
→ oppdag et signal
→ syntetiser det til en priset etterretningsrapport (AI-assistert)
→ publiser i en offentlig katalog (JSON, RSS, sitemap — for både folk og roboter)
→ kjøper betaler i krypto (Polygon)
→ betalingen verifiseres direkte mot blockchainen (ingen tredjeparts betalingsløsning)
→ rapporten låses opp
→ regnskapet oppdateres (kun fra bekreftede, verifiserte betalinger — aldri estimater)
```

- **Frontend**: React + Vite + Tailwind, Shadcn/UI, Zustand, TanStack Query
- **Backend**: Cloudflare Workers + Hono + Cloudflare Agents SDK
- **Tilstand**: Durable Objects — alle signaler, rapporter og finansiell tilstand lagres server-side
- **AI**: et lite multi-agent-system (Scout finner kilder, Analyst prissetter og strukturerer muligheten, en Governor håndhever harde grenser for forbruk/risiko som agentene ikke kan overstyre) med automatisk fallback mellom flere AI-modell-leverandører, slik at systemet fortsetter å kjøre selv om én blir rate-limitet
- **Betaling**: native kryptotransaksjoner verifisert direkte via RPC-kall — jeg sjekker selv transaksjonsstatus, chain-ID, mottakeradresse og antall bekreftelser, i stedet for å stole på et tredjeparts betalings-API

---

## Hvordan jeg brukte AI i byggingen

Ikke som autofullføring. Jeg brukte det som en reell samarbeidspartner til
to forskjellige oppgaver i dette prosjektet:

1. **Bygging** — design av agent-arkitekturen, skriving av
   betalingsverifiseringslogikken, og arbeid med kantsaker i
   regnskaps-/treasury-designet (f.eks. å sikre at projisert verdi aldri
   kunne bli telt som reell inntekt ved en feil).
2. **Revisjon av eget arbeid** — jeg fikk det til å lese gjennom hele
   kodebasen opp mot mitt opprinnelige designdokument og fortelle meg
   ærlig hva som faktisk var bygget versus hva jeg bare hadde beskrevet.
   Det er derfra "Kjente svakheter"-seksjonen under kommer — den fanget
   opp et hull jeg ellers ikke hadde sett (en feed som så komplett ut,
   men som egentlig bare var et alias for en annen), og identifiserte
   riktig hvilken svakhet som var kosmetisk og hvilken som faktisk hadde
   betydning for at systemet skulle virke som tiltenkt.

Den andre bruksmåten er den jeg tror betyr mest i det daglige: å vite hvordan
man får en reell, kritisk vurdering av eget arbeid fra et verktøy, og å
vite hvilke av funnene man faktisk bør handle på.

---

## Teknisk vurdering: kjente svakheter, rangert etter hva som faktisk betyr noe

Jeg tror ikke på et "ferdig, ingen anmerkninger"-prosjekt, så her er min
egen ærlige vurdering, rangert etter reell betydning — ikke etter hva som
er enklest å fikse:

1. **Rapportdybden er den egentlige flaskehalsen.** AI-agenten som skriver
   hver rapport jobber i dag ut fra én enkelt kilde, i én omgang, med
   begrenset input. Det er det som er mest verdt å forbedre — å koble
   signaler på tvers av flere kilder slik at resultatet blir ekte syntese,
   ikke en omformulert oppsummering. Dette er neste post på listen min,
   foran alt som er kosmetisk.
2. **Kildehelse spores ikke live.** Hvis en kildes sidestruktur endres og
   skrapingen svikter stille, dukker det foreløpig ikke automatisk opp
   noe sted.
3. **Ett feed-endepunkt er for øyeblikket bare et alias for et annet**,
   i stedet for et eget, distinkt datalag slik den opprinnelige
   spesifikasjonen tilsa. Kosmetisk — lavest prioritet av de tre.

---

## Kjøre det lokalt

```bash
bun install
bun run dev          # starter på :3000
bun run typecheck
bun run build
```

Konfigurasjon ligger i en lokal `.dev.vars`-fil (ikke committet) —
API-nøkler, treasury-lommebokadresse og AI-leverandørcredentials. Ikke
inkludert her, av åpenbare grunner.

---

## En kommentar om omfang

Dette er ikke et kurs- eller malprosjekt — det finnes ingen kurs eller
mal det er basert på. Betalingsverifiseringslogikken,
agent-styringsreglene og kravene til regnskapsintegritet er alle valg jeg
tok selv, og som jeg måtte forsvare overfor meg selv da jeg reviderte
resultatet.