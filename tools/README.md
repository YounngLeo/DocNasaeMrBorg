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
├── digital-energy/
│   ├── tool.html           ← scie VFX anime · WebGL2
│   └── preview.svg
└── bio-mesh/
    ├── tool.html           ← mesh biomorfa da spettro audio · Three.js
    ├── mesh-core.js
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
   - **Application domain:** `tools.tuosito.com` o path `/tools/*`
5. **Next** → policy:
   - **Policy name:** Studio access
   - **Action:** Allow
   - **Include:** Emails → aggiungi le email autorizzate

dopo questo: qualunque accesso a `/tools/*` chiede login email con magic link OTP.

## sviluppo locale

```bash
cd tools
python3 -m http.server 8080
```

apri `http://localhost:8080/`. In locale non c'è auth — normale, cloudflare access agisce solo sul deploy.

## privacy

- pagine hanno `<meta name="robots" content="noindex,nofollow">`
- preset usano localStorage del browser (solo dispositivo locale)
- nessun analytics, nessun tracking

## changelog

- v1.2 — index.html hardcoded, manifest rimosso, stile unificato Cuore_Statico
- v1.1 — aggiunto cuore_statico
- v1.0 — initial release con barene_frame v0.5
