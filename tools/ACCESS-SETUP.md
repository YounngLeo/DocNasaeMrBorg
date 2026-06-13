# Binding KV per Pages (configura nel dashboard, NON wrangler.toml in root)

Namespace creato: **dnmb-tools-auth**
ID: `96809d76ca064e3ebb0f25782b72f7e1`

## Cloudflare Pages → progetto → Settings → Functions

1. **KV namespace bindings**
   - Variable name: `TOOLS_AUTH_KV`
   - KV namespace: `dnmb-tools-auth`

2. **Environment variables** (Production)

| Variabile | Esempio | Note |
|-----------|---------|------|
| `TOOLS_OWNER_EMAIL` | `fornasaleonardo@gmail.com` | Riceve richieste |
| `TOOLS_APPROVAL` | `1` | Abilita flusso approvazione |
| `TOOLS_AUTH_SECRET` | stringa casuale lunga | Firma token |
| `MAILER_URL` | `https://tools-auth-mailer.<account>.workers.dev` | Worker mailer |
| `MAILER_SECRET` | stringa casuale | Stesso valore nel Worker mailer |
| `TOOLS_MAIL_FROM` | `tools@tuodominio.it` | Mittente (dominio su CF) |
| `TOOLS_ACCESS_CODE` | opzionale | Codice studio bypass |

3. **Worker `tools-auth-mailer`** — secrets:
   - `MAILER_SECRET` (uguale a Pages)
   - `MAIL_FROM` (uguale a TOOLS_MAIL_FROM)

4. **Email Service** (Cloudflare dashboard)
   - Compute → Email Service → onboard dominio
   - Abilita `send_email` binding nel worker mailer (wrangler.toml)

## Flusso

1. Visitatore → `/tools/` → inserisce email
2. Tu ricevi email con **AUTORIZZA** / **NEGA**
3. Se approvi → visitatore riceve link di ingresso
4. Sessione cookie 14 giorni su `/tools/*`
