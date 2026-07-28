# DoctNasa&MrBorg :: tools

Sezione interna del sito studio. Due tool generativi protetti da auth Cloudflare Access (email magic-link).

## struttura

```
tools/
├── index.html              ← galleria tool (nav + schede)
├── assets/
│   └── presets.js          ← libreria preset save/load (localStorage)
├── cuore-statico/
│   ├── tool.html           ← studio audio Tone.js
│   └── preview.svg
├── barene-frame/
│   ├── tool.html           ← generatore cornici biomorfiche
│   ├── preview.svg
│   └── shot_*.svg
├── fluid-vessel/
│   ├── tool.html           ← membrana PBD · Three.js
│   └── preview.svg
└── bio-mesh/
    ├── tool.html           ← mesh biomorfa da spettro audio · Three.js
    ├── mesh-core.js
    └── preview.svg
├── ricamo/
    ├── tool.html           ← punto croce e rilievi · STL multicolore
    └── preview.svg
└── velario/
    ├── tool.html           ← tassellazione modulare · archi · STL
    └── preview.svg
└── ventaglio/
    ├── tool.html           ← ventaglio modulare · profilo · simulazione
    ├── ventaglio-core.js
    └── preview.svg
└── isoieta/
    ├── tool.html           ← sintetizzatore FM meteorologico · Open-Meteo
    └── preview.svg
└── ventolino/
    ├── tool.html           ← wind spinner laser · PDF/SVG mm
    ├── ventolino-core.js
    └── preview.svg
```

## aggiornare un tool

ogni tool è un file `tool.html` autonomo. Per aggiornarne uno:

1. modifica `tools/<slug>/tool.html`
2. aggiorna versione in `info.html` e nel `changelog`
3. push su git → cloudflare rideploya in 30s

### PORTAL sync (CUORE_STATICO)

Trail e BPM usano **WebSocket** via Worker dedicato `cuore-portal-relay` (non Pages Functions).

1. **Secrets GitHub** (Settings → Secrets → Actions):
   - `CLOUDFLARE_API_TOKEN` — token con permesso Workers + Durable Objects
   - `CLOUDFLARE_ACCOUNT_ID` — ID account Cloudflare
2. Push su `main` → workflow `.github/workflows/deploy-portal-relay.yml` deploya il Worker.
3. Verifica relay: `https://cuore-portal-relay.<tuo-subdomain>.workers.dev/ws?room=TEST` → JSON `{ok:true,...}`.
4. Aggiorna `tools/cuore-statico/portal-ws.json` con il tuo `wsBase` (es. `wss://cuore-portal-relay.younngleo.workers.dev`).
5. In UI: riga **SYNC** → `ws:on` · `portal.js v11`. Audio resta su PeerJS.

Deploy manuale Worker (alternativa):

```bash
cd workers/cuore-portal-relay && npx wrangler deploy
```

## aggiungere un terzo tool

l'index.html ora ha le card scritte a mano. Per aggiungere un terzo tool:

1. crea `tools/<nuovo-slug>/` con `tool.html`, `info.html`, `preview.svg`
2. apri `tools/index.html` e duplica un blocco `<a class="card">`, cambia link, badge, descrizione
3. aggiorna il contatore `TOOLS_AVAILABLE` nel SYSTEM_STATUS

## deploy su cloudflare pages + access

### 1. setup repository

```bash
git init
git add .
git commit -m "initial tools section"
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

(il repository può essere PRIVATO — cloudflare clona via OAuth)

### 2. cloudflare pages

1. cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. autorizza github, seleziona il repo
3. **Framework preset:** None · **Build command:** vuoto · **Build output directory:** `/`
4. **Save and Deploy**

avrai un URL `<progetto>.pages.dev`. Per dominio custom: **Custom domains** → aggiungi il tuo.

### 3. cloudflare access (auth via email)

1. cloudflare dashboard → **Zero Trust** (gratis fino a 50 utenti)
2. al primo accesso configura il team name
3. **Access** → **Applications** → **Add an application** → **Self-hosted**
4. setup:
   - **Application name:** DoctNasa Tools
   - **Session duration:** 24 hours
   - **Application domain:** il dominio Pages · path `/tools/*`
5. **Next** → policy:
   - **Policy name:** Studio access
   - **Action:** Allow
   - **Include:** Emails → aggiungi le email autorizzate

Con Access attivo, il middleware riconosce automaticamente il JWT (`Cf-Access-Jwt-Assertion`).

### 4. approvazione email (consigliato)

Flusso: il visitatore inserisce la sua email → **tu ricevi una mail** con pulsanti **Autorizza / Nega** → se approvi, il visitatore riceve il link di ingresso.

Guida completa: [`tools/ACCESS-SETUP.md`](ACCESS-SETUP.md)

Setup rapido (Cloudflare Pages → Environment variables):

| Variabile | Valore |
|-----------|--------|
| `TOOLS_OWNER_EMAIL` | la tua email (es. `fornasaleonardo@gmail.com`) |
| `TOOLS_APPROVAL` | `1` |
| `TOOLS_AUTH_SECRET` | stringa casuale lunga |
| `MAILER_URL` | URL worker `tools-auth-mailer` |
| `MAILER_SECRET` | segreto condiviso con il worker |
| `TOOLS_MAIL_FROM` | `tools@tuodominio.it` (dominio su Cloudflare DNS) |

KV namespace (già creato): `dnmb-tools-auth` → binding `TOOLS_AUTH_KV` nelle Functions del progetto Pages.

Deploy worker mailer: push su `workers/tools-auth-mailer/` (GitHub Action) oppure `npx wrangler deploy` nella cartella.

### 5. passcode studio (opzionale)

In aggiunta all'approvazione email, oppure da solo:

1. Cloudflare Pages → **Settings** → **Environment variables**
2. `TOOLS_ACCESS_CODE` = codice studio condiviso

Login passcode: `/tools/_auth/login`

## sviluppo locale

```bash
cd tools
python3 -m http.server 8080
```

apri `http://localhost:8080/`. In locale non c'è auth — normale, cloudflare access agisce solo sul deploy.

## privacy

- pagine hanno `<meta name="robots" content="noindex,nofollow">`
- `robots.txt` blocca `/tools/` ai crawler
- `_headers` imposta `X-Robots-Tag` su `/tools/*`
- preset usano localStorage del browser (solo dispositivo locale)
- nessun analytics, nessun tracking

## changelog

- v1.2 — index.html hardcoded, manifest rimosso, stile unificato Cuore_Statico
- v1.1 — aggiunto cuore_statico
- v1.0 — initial release con barene_frame v0.5
