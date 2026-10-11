# Changelog

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
