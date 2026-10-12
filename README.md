# gaudi-calendar-scheduling

Feature de la plataforma **Gaudi** que integra **Cal.diy** (l'edició open source
de Cal.com, MIT) com a mòdul de calendari i reserves, amb una superfície CLI
completa per a agents i un stack de producte declaratiu desplegat a K3s.

- **Feature id**: `calendar.scheduling` · **Manifest**: v1.3 (SPEC §15c)
- **Superfície agent**: CLI `scheduling ... --json` + skill `scheduling`
- **Producte**: Cal.diy `v6.2.0` (web Next.js + API v2 + PostgreSQL + Redis)
- **Domini públic**: `cal.apps.ona.gaudi.2mes4.com` (convenció `<app>.apps.<agent>.<domain>`)
- **Estètica**: cap UI pròpia — la interfície és la de Cal.diy; l'agent opera per CLI.

## Què fa

| Família | Accions |
|---|---|
| Identitat | `me-get`, `health` |
| Event types | `event-types-list/get/create/update/delete` |
| Disponibilitat | `slots-list`, `schedules-list/get/default/create/update/delete` |
| Reserves | `bookings-list/get/by-seat/create/reschedule/cancel/confirm/decline/mark-absent` |
| Material reserva | `bookings-calendar-links/references/recordings/transcripts/conferencing-sessions` |
| Enllaços | `booking-url` (mes/dia/slot, timezone, durada, prefill, layout, embed, tema, metadata) |
| Jobs interns | `cron-tick` (executat pels daemons `calcom-cron` i `calcom-maintenance`) |

## Desplegament (resum)

1. **DNS**: crea un registre A `cal.apps.ona.gaudi.2mes4.com → 161.97.75.144`.
2. **Variables de plataforma** (abans del primer deploy):
   ```bash
   gaudi env set GAUDI_CALENDAR_PUBLIC_URL https://cal.apps.ona.gaudi.2mes4.com --scope platform --no-secret
   gaudi env set GAUDI_CALENDAR_API_BASE http://calcom-api:8080 --scope platform --no-secret
   gaudi env set GAUDI_CALENDAR_WEB_BASE http://calcom-web:3000 --scope platform --no-secret
   gaudi env set GAUDI_CALENDAR_DEFAULT_USERNAME <el-teu-username> --scope platform --no-secret
   gaudi env set GAUDI_CALENDAR_DEFAULT_TIMEZONE Europe/Madrid --scope platform --no-secret
   gaudi env sync-k8s --namespace gaudi-platform
   ```
3. **Deploy del stack** (només des del HOST amb kubectl/SSH, no des del pod del kernel):
   afegeix el feature al blueprint (`workspace/blueprints/kernel/platform.yaml`) i
   executa `gaudi deploy`, o bé `gaudi feature install <aquest repo>` des del host.
   El primer deploy crea: `calcom-db` (Postgres+PVC), `calcom-cache` (Redis+PVC),
   `calcom-web` (Ingress TLS + Certificate, secrets generats, **bootstrap `npx prisma migrate deploy`**)
   i `calcom-api` (API v2 interna).
4. **Bootstrap d'admin** (un cop, a la UI): obre `https://cal.apps.ona.gaudi.2mes4.com`,
   crea el compte propietari, connecta el calendari (Google/Microsoft) i crea una
   **API key** (Settings → Developer → API Keys). Desa-la i desactiva registres:
   ```bash
   gaudi env set GAUDI_CALENDAR_API_KEY cal_xxx --scope platform
   gaudi env set GAUDI_CALENDAR_CRON_KEY <CRON_API_KEY del secret calcom-web> --scope platform
   gaudi env sync-k8s --namespace gaudi-platform
   # després, a la config de calcom-web: NEXT_PUBLIC_DISABLE_SIGNUP=true (i redeploy del servei)
   ```
5. **Provisioning d'admin** (API key inclosa — la UI la gateja com a comercial):
   ```bash
   node dist/bin.js scheduling admin-deployment --json
   node dist/bin.js scheduling admin-bootstrap ericmora82@gmail.com ericmora --json
   # → desa GAUDI_CALENDAR_API_KEY (la key retornada) i GAUDI_CALENDAR_DEFAULT_USERNAME=ericmora
   ```
6. **Verificació**: `node dist/bin.js scheduling health --json` (ok: true).

## Imatges del producte (CI)

El stack corre amb imatges pròpies construïdes pel workflow
[`.github/workflows/docker.yml`](.github/workflows/docker.yml) a partir del codi
de `calcom/cal.diy` **pinat** (`v6.2.0`) i publicades a ghcr:

- `ghcr.io/2mes4-gaudi/caldiy-web:v6.2.0` (`NEXT_PUBLIC_WEBAPP_URL` incrustada al build)
- `ghcr.io/2mes4-gaudi/caldiy-api-v2:v6.2.0` (API v2 standalone; upstream no publica imatge)

Upgrade del producte = bump del tag al manifest + release del feature.

## Mòdul d'administració (usuaris i API keys)

La UI de Cal.diy presenta la creació d'API keys com a funció comercial. Com que
l'operativa és **CLI-first**, el feature inclou un mòdul d'administració que
provisiona directament a la BD de Cal.diy amb la mateixa mecànica del producte
(`hashedKey = sha256(key sense prefix)`, key presentada `<prefix><key>`):

- `scheduling admin-deployment` — assegura la fila `Deployment` amb la llicència
  self-host documentada (`00000000-...`); **imprescindible**: sense això l'API v2
  respon «Invalid or missing CALCOM_LICENSE_KEY» en usar API keys.
- `scheduling admin-bootstrap [email] [username]` — crea els usuaris de
  plataforma a Cal.diy (usuari + horari per defecte Mon-Fri 9-17 + API key si no
  en té), idempotent. Sense email → tots els registrats (`kernel_user_profiles`).
- `scheduling api-keys-list <email>` · `api-keys-create <email> [nota]` ·
  `api-keys-revoke <id> --yes`.

Requereix: `GAUDI_CALENDAR_DB_URL` (BD de Cal.diy; del Secret
`calcom-db-postgres-secret`) i `POSTGRES_URL` (usuaris de plataforma).

## Configuració de Google Calendar (sync bidireccional)

El sync amb Google és **bidireccional** en l'ús pràctic: Cal.diy llegeix la
disponibilitat dels calendaris connectats (els esdeveniments de Google ocupen
franges i bloquegen reserves) i escriu cada reserva al **calendari de
referència** (Destination Calendar). La configuració és 100% agentica:

1. **Google Cloud Console** (una vegada):
   - APIs & Services → Library → activa **Google Calendar API**.
   - Credentials → Create OAuth client ID → **Web application** amb la redirect URI:
     `https://cal.apps.ona.gaudi.2mes4.com/api/integrations/googlecalendar/callback`
   - Si el consent screen està en *Testing*, afegeix el compte com a **Test user**.
2. **Credencials com a configuració del mòdul** (mai al repo — és públic):
   ```bash
   gaudi env set GAUDI_CALENDAR_GOOGLE_CREDENTIALS_JSON '{"client_id":"...","client_secret":"..."}' --scope platform
   gaudi env sync-k8s --namespace gaudi-platform
   # Equivalent via agent/CLI (desa a l'app google-calendar de la BD de Cal.diy i l'activa):
   scheduling apps-set-credentials google-calendar '{"client_id":"...","client_secret":"..."}'
   ```
3. **Connectar el compte** (agent o usuari):
   ```bash
   scheduling calendars-connect        # retorna l'enllaç OAuth → obrir-lo amb sessió de Cal.diy
   ```
   En autoritzar, Cal.diy desa la credencial i marca el calendari **principal**
   per a comprovació de conflictes (SelectedCalendar).
4. **Calendari de referència** (on cauen totes les reserves):
   ```bash
   scheduling calendars-list                          # veure credencials + seleccionats + destinació
   scheduling destination-calendar-set google_calendar <Calendar ID>
   ```
   - `<Calendar ID>`: a Google Calendar → Settings del calendari → *Calendar ID`
     (el principal és l'email; els secundaris `...@group.calendar.google.com`).
   - **Diversos comptes Google**: connecta cada compte per separat
     (`calendars-connect` un cop per compte) i tria el de referència que vulguis.
   - **Diversos calendaris del mateix compte**: el de destinació és l'únic que rep
     les reserves; els altres es poden seleccionar per conflictes.

## Operació

- **Migracions**: les executa el `bootstrap` del servei `calcom-web` a cada deploy (idempotent).
- **Jobs interns**: els executen els daemons del feature (`daemons[]`), MAI CronJobs ad hoc.
- **Canvi d'env del stack**: el desplegador només redeploya si canvia la imatge;
  per canviar env cal esborrar el Deployment i tornar a desplegar (documentat a SPEC §15c).
- **Uninstall**: elimina Deployments/Services/Ingress; **conserva PVCs i el Secret**
  `calcom-web-secret` (claus de xifratge NEXTAUTH/CALENDSO: sense elles les dades són inservibles).

## Desenvolupament

```bash
npm install
npm run build       # tsc → dist/
npm test            # unit tests (node:test)
# smoke amb mock local (sense clúster):
node tests/mock-calcom.mjs &
GAUDI_CALENDAR_API_BASE=http://127.0.0.1:4599 GAUDI_CALENDAR_API_KEY=cal_test \
  node dist/bin.js scheduling event-types-list --json
```

Acceptance tests (sandbox de plataforma): `tests/acceptance/*.test.yaml`.

## Llicència i atribució

- Aquest repo: **MIT** (vegeu `LICENSE`).
- Cal.diy és © Cal.com, Inc. sota llicència **MIT** (`https://github.com/calcom/cal.diy`).
  Aquest feature no modifica el codi de Cal.diy: en declara el desplegament i
  l'opera per la seva API pública. "Cal" és marca registrada de Cal.com, Inc.
