# Changelog

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
