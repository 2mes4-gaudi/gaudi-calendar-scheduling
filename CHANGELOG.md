# Changelog

## 0.4.4 — 2026-10-12

- Descripció del manifest actualitzada (és la que veu l'agent en-runtime com a
  descripció de l'eina `feature-calendar-scheduling`): ara anuncia Google sync
  (calendars-connect/destination), recordatoris amb device, sala de Meet
  automàtica i administració.
- Skill: regla explícita — MAI dir que el feature no existeix; començar sempre
  per `calendars-status`; i què fa exactament el sync (reserves→Google,
  conflictes de Google→Cal.diy; NO lectura/edició arbitrària d'esdeveniments).

## 0.4.3 — 2026-10-12

- README: guia completa de configuració de Google Calendar (client OAuth,
  credencials com a configuració del mòdul via GAUDI_CALENDAR_GOOGLE_CREDENTIALS_JSON,
  connexió, calendari de referència i multi-compte).

## 0.4.2 — 2026-10-12

- `apps-set-credentials`: UPDATE primer i INSERT defensiu amb cast d'enum
  (`"AppCategories"[]`) — abans fallava amb apps existents (syncAppMeta) perquè
  l'INSERT ... ON CONFLICT avaluava l'array de categories com a text[].

## 0.4.1 — 2026-10-12

- `calendars-list`/`calendars-status`: inclouen els calendaris seleccionats per a
  conflictes (SelectedCalendar) — permet automatitzar el calendari de referència
  just després de connectar Google.

## 0.4.0 — 2026-10-12

- **Sala de videotrucada SEMPRE a cada reserva**: `bookings-create` afegeix la
  integració del setting `default-location` (per defecte **google-meet**) si el
  cridador no n'indica cap. Si la integració no està disponible (Google encara
  no connectat), reintenta amb la ubicació per defecte de l'event type i
  retorna `locationNote` perquè l'agent ho expliqui i ofereixi `calendars-connect`.
- Nou setting `default-location` (google-meet | cal-video | none | ...).
- Nova acció `apps-enable` (activar/desactivar apps de Cal.diy, ex: google-meet).

## 0.3.1 — 2026-10-12

- `bookings-cancel`: si no s'indica motiu, se n'envia un de genèric (l'API v2
  d'aquesta versió exigeix `cancellationReason`; abans fallava sense motiu).

## 0.3.0 — 2026-10-12

- **Recordatoris** («avisa'm X min abans»): `reminders-add/list/remove` +
  `reminders-dispatch` (daemon `calcom-reminders` cada minut) que publica
  `scheduling.reminder-due` al bus de l'agent; el motor de proactivitat del
  kernel desperta l'agent i lliura al device configurat.
- **Settings** (des de l'agent): `settings-get/set` — `reminder-device`
  (id/nom de device o `none`, per defecte `none`) i `default-reminder-minutes`
  (recordatori global, 0=off).
- **Calendaris Google agentics**: `calendars-status`, `calendars-connect`
  (retorna l'enllaç OAuth; si falta configuració retorna needsConfig perquè
  l'agent la demani a l'usuari), `apps-set-credentials` (activa l'app i desa
  credencials a la BD), `calendars-list` i `destination-calendar-set` (API v2).
- DAO real de plataforma (KV `scheduling_reminders`/`scheduling_settings`) via
  `ctx.db` amb POSTGRES_URL; nou env `GAUDI_CALENDAR_GOOGLE_CREDENTIALS_JSON`.

## 0.2.4 — 2026-10-12

- calcom-api: `NEXT_PUBLIC_WEBAPP_URL`/`NEXT_PUBLIC_WEBSITE_URL` (les constants
  de cal.com les llegeixen d'aquí; els `bookingUrl` de l'API sortien com
  http://localhost:3000).

## 0.2.3 — 2026-10-12

- calcom-api comparteix NEXTAUTH_SECRET i CALENDSO_ENCRYPTION_KEY amb
  calcom-web via `@secretRef:calcom-web-secret:<clau>` (l'upstream exigeix que
  coincideixin: el web xifra i l'API desxifra). `JWT_SECRET` propi (generat).
- CI d'imatges passa a dispatch manual (els releases del feature no
  reconstrueixen el producte).

## 0.2.2 — 2026-10-11

- CI: les imatges poden portar patches Gaudi (platform/caldiy/patches) aplicats
  sobre cal.diy pinat; l'API v2 passa a `caldiy-api-v2:v6.2.0-g1`.
- Patch 0001: `DeploymentsService.checkLicense()` accepta `{valid}` (el que
  respon console.cal.com, també per la clau self-host documentada) a més de
  `{status}` — sense això TOTES les API keys fallaven amb "Invalid or missing
  CALCOM_LICENSE_KEY environment variable" (bug upstream v6.2.0).

## 0.2.1 — 2026-10-11

- `admin-deployment`: assegura la fila `Deployment` amb la **llicència self-host**
  de Cal.diy (`00000000-...`) — el pas oficial (apps/api/v2/README.md) perquè
  l'API v2 accepti API keys; sense això respon «Invalid or missing
  CALCOM_LICENSE_KEY» (el «paywall» que la UI mostra com a funció comercial).
- `calcom-api`: env `CALCOM_LICENSE_KEY` (valor self-host documentat).

## 0.2.0 — 2026-10-11

- **Mòdul d'administració** (la UI de Cal.diy gateja les API keys com a funció
  comercial): `admin-bootstrap` (provisiona usuaris de plataforma a Cal.diy amb
  horari per defecte i API key; idempotent), `api-keys-list/create/revoke`
  directament sobre la BD del producte (sha256 sense prefix, mecànica nativa).
- Nous ports `CalendarAdminStore` / `PlatformUsersReader` (adapters pg).
- Env nova: `GAUDI_CALENDAR_DB_URL` (BD de Cal.diy; usuaris de plataforma via
  `POSTGRES_URL`). Tests nous (20 en total).

## 0.1.4 — 2026-10-11

- calcom-api: límit de memòria 768Mi → 2Gi (OOMKilled al bootstrap de Nest).

## 0.1.3 — 2026-10-11

- Client cron: fallback POST→GET amb HTTP 405 (calendar-subscriptions,
  changeTimeZone i companyia són GET a Cal.diy).
- Stack calcom-api: STRIPE_API_KEY/STRIPE_WEBHOOK_SECRET placeholder i
  IS_TEAM_BILLING_ENABLED=false — la config de l'API v2 els exigeix per arrencar.

## 0.1.2 — 2026-10-11

- Fix: els daemons passaven `--jobs` al CLI, però `cron-tick` usa argument
  posicional (el CLI es genera del registry). Desplegat a Ona.

## 0.1.1 — 2026-10-11

- Stack calcom-web: SMTP de plataforma via @ref (GAUDI_SMTP_*) i control de
  registre amb NEXT_PUBLIC_DISABLE_SIGNUP=@ref:GAUDI_CALENDAR_DISABLE_SIGNUP.

## 0.1.0 — 2026-10-11

- Primera versió del feature `calendar.scheduling` (manifest v1.3, SPEC §15c).
- CLI complet sobre l'API v2 de Cal.diy: me, event types (CRUD), slots,
  bookings (list/get/by-seat/create/reschedule/cancel/confirm/decline/mark-absent,
  calendar-links/references/recordings/transcripts/conferencing-sessions),
  schedules (CRUD + default) i `booking-url` amb totes les opcions.
- Stack Cal.diy `v6.2.0` declarat a `platform_services[]` (web+api+db+cache) amb
  Ingress TLS, secrets generats i bootstrap de migracions Prisma.
- Jobs interns del producte com a daemons (`calcom-cron`, `calcom-maintenance`).
- Skill `scheduling` i 9 casos d'acceptance amb mock local.
