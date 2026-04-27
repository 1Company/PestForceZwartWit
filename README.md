# Pestforce Nederland

Public site + admin-paneel voor inspectie-aanvragen. Static HTML aan de voorkant, Vercel serverless functions voor het API + admin-werk. SMTP2GO voor e-mail. Vercel KV (Upstash Redis) voor opslag.

## Structuur

```
.
├── index.html              # publieke site
├── admin.html              # /admin — login + dashboard
├── api/
│   ├── submit.js           # POST /api/submit
│   ├── auth-request.js     # POST /api/auth-request   (magic-link starten)
│   ├── auth-verify.js      # GET  /api/auth-verify    (magic-link consumeren)
│   ├── me.js               # GET  /api/me             (sessie-check)
│   ├── logout.js           # POST/GET /api/logout
│   └── requests.js         # GET/PATCH/DELETE /api/requests
├── lib/
│   ├── kv.js               # Upstash REST client
│   ├── auth.js             # HMAC sessions + cookie helpers
│   └── email.js            # SMTP2GO wrapper
├── package.json
├── vercel.json
└── README.md
```

## Vereiste env-variabelen (Vercel → Project Settings → Environment Variables)

| Variabele | Beschrijving | Voorbeeld |
|---|---|---|
| `SMTP2GO_API_KEY` | API-key uit SMTP2GO dashboard | `api-XXXXXXXX...` |
| `SMTP2GO_FROM_EMAIL` | Geverifieerd afzenderadres | `noreply@pestforcenederland.nl` |
| `SMTP2GO_FROM_NAME` | _(optioneel)_ Afzender-naam | `Pestforce Nederland` |
| `INSPECTION_RECIPIENT` | Adres dat nieuwe aanvragen ontvangt | `info@pestforcenederland.nl` |
| `ADMIN_EMAILS` | Comma-separated lijst van adres(sen) die mogen inloggen | `mike@pestforcenederland.nl,admin@1company.nl` |
| `AUTH_SECRET` | Lange random string voor sessie-HMAC | `openssl rand -base64 48` |
| `KV_REST_API_URL` | Vercel KV / Upstash REST URL | `https://xxxx.upstash.io` |
| `KV_REST_API_TOKEN` | Vercel KV / Upstash REST token | _(uit dashboard)_ |
| `PUBLIC_BASE_URL` | _(optioneel)_ overschrijft `https://${VERCEL_URL}` voor magic-links | `https://www.pestforcenederland.nl` |

`VERCEL_URL` en `VERCEL_PROJECT_PRODUCTION_URL` worden automatisch door Vercel gezet en als fallback gebruikt voor de magic-link basis-URL.

## Setup

### 1. Vercel KV koppelen
1. Vercel dashboard → Storage → Create → KV.
2. Connect aan dit project. Vercel zet `KV_REST_API_URL` + `KV_REST_API_TOKEN` automatisch.

### 2. SMTP2GO
1. Account → API Keys → maak een nieuwe key (Send-only volstaat).
2. Sender Domains → voeg `pestforcenederland.nl` toe en pas de DNS-records toe (DKIM + SPF + return-path).
3. `SMTP2GO_FROM_EMAIL` moet onder een geverifieerd domein vallen.

### 3. Adminlijst
Zet `ADMIN_EMAILS` op een of meer adressen. Alleen deze adressen krijgen een werkende inloglink — overige adressen zien dezelfde "check uw inbox"-melding (geen email-enumeratie).

### 4. Auth secret
```bash
openssl rand -base64 48
# zet de output als AUTH_SECRET in Vercel
```
Wijzig deze waarde alleen als je iedereen wilt uitloggen (alle bestaande sessies worden ongeldig).

### 5. Deploy
```bash
git push origin main
```
Vercel detecteert de `api/`-map en deployt elke `.js` als individuele serverless function.

## Endpoints

### `POST /api/submit`
Public. Ontvangt het formulier. Stuurt e-mail via SMTP2GO en slaat op in KV.

```json
{
  "naam":"...", "email":"...", "telefoon":"...", "adres":"...",
  "type":"Knaagdieren", "urgentie":"Acuut",
  "bericht":"...", "datum":"2026-05-03", "tijd":"11:00"
}
```
Honeypot: een verborgen veld `website` — bots vullen het in en krijgen 200 zonder dat er iets gebeurt.
Rate limit: 8 inzendingen / 10 min per IP.

### `POST /api/auth-request`
Body `{ email }`. Stuurt magic-link mits adres in `ADMIN_EMAILS`. Antwoord is altijd `{ ok: true }` om enumeratie te voorkomen. Rate limit: 5 / 10 min per adres.

### `GET /api/auth-verify?token=...`
Eenmalig. Zet sessie-cookie (HttpOnly, SameSite=Lax, 30 dagen). Redirect naar `/admin`. Token is 15 minuten geldig.

### `GET /api/me`
`{ authenticated: true|false, email }`.

### `POST /api/logout`
Wist de sessie-cookie.

### `GET /api/requests` — admin
Geeft de laatste 200 aanvragen, nieuwste eerst.

### `PATCH /api/requests` — admin
Body `{ id, status?, note? }`. Statussen: `nieuw | gebeld | ingepland | afgerond | geannuleerd`.

### `DELETE /api/requests?id=...` — admin
Verwijdert een aanvraag.

## KV-schema

```
pf:request:<id>     JSON-string van de aanvraag
pf:requests         ZSET (score = ms timestamp, member = id)
pf:magic:<token>    e-mailadres (TTL 900s)
pf:rl:magic:<email> teller (TTL 600s)
pf:rl:submit:<ip>   teller (TTL 600s)
```

## Lokaal draaien

```bash
npm i -g vercel
vercel link
vercel env pull .env.local
vercel dev
```

Open `http://localhost:3000` en `http://localhost:3000/admin`.

## Veiligheid

- Sessie-cookie: HttpOnly + Secure + SameSite=Lax, 30 dagen, HMAC-signed met `AUTH_SECRET`.
- Magic-link token: 256-bit random, 15 min TTL, single-use (verwijderd na verbruik).
- Form-honeypot voor bots.
- Rate-limit op submit + auth-request.
- Geen email-enumeratie op de loginflow.
- Admin-endpoints checken zowel HMAC-signature als `ADMIN_EMAILS`-lidmaatschap (intrekkingsbestendig — als een adres uit de lijst wordt gehaald, werkt zijn sessie de volgende request niet meer).

## Nog niet ingebakken (toekomstig werk)

- Echte agenda-koppeling (Google Calendar, Cal.com) zodat de slot-keuze ook beschikbaarheid checkt.
- Webhook of Slack-notificatie naast de e-mail.
- Audit-log van wijzigingen in plaats van alleen de laatste `updated`/`updatedBy`.
- Pagination op `GET /api/requests` zodra er > 200 aanvragen zijn.
