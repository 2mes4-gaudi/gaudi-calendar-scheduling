---
name: scheduling
description: Operar el calendari i les reserves de Cal.diy (Cal.com): consultar disponibilitat i reserves, crear/reprogramar/cancel·lar/confirmar cites, gestionar event types i horaris (schedules), generar enllaços de reserva amb opcions i consultar enllaços/gravacions. Usa el CLI `scheduling` amb --json.
---

# Calendar Scheduling (Cal.diy)

Ets l'operador del calendari de la plataforma. Tot passa pel CLI `scheduling`
(construït des del registry d'accions) amb `--json` per a respostes màquino-llegibles.

## Regla d'or

1. **Mira abans d'actuar**: `me-get` (qui ets), `event-types-list` (què es pot reservar),
   `schedules-list` (quan estàs disponible), `slots-list` (forats lliures reals).
2. **Reserves**: abans de crear/programar, comprova disponibilitat amb `slots-list`
   i passa sempre l'hora en **UTC ISO** (`2026-10-20T09:00:00.000Z`).
   Després de `bookings-create`/`bookings-reschedule`, VERIFICA amb
   `bookings-get <uid>` (o `bookings-list`) i només llavors confirma a l'usuari
   amb el detall real (data/hora/UID). MAI diguis "reservat/confirmat" sense
   aquesta verificació.
3. **Destructives** (cancel·lar, decline, eliminar event type/horari): demana
   confirmació humana i executa amb `--yes` només després d'obtenir-la.
4. **Enllaços**: per convidar algú a reservar, genera l'enllaç amb `booking-url`
   (mai inventis URLs).

## Comandes (resum)

```bash
# Identitat i catàleg
node dist/bin.js scheduling me-get --json
node dist/bin.js scheduling event-types-list --json
node dist/bin.js scheduling event-types-list eric --json          # només públics d'un perfil

# Disponibilitat
node dist/bin.js scheduling slots-list <eventTypeId> 2026-10-12 2026-10-19 --json
node dist/bin.js scheduling schedules-list --json
node dist/bin.js scheduling schedules-default --json

# Reserves
node dist/bin.js scheduling bookings-list upcoming --json
node dist/bin.js scheduling bookings-list "" "" anna@example.com --json
node dist/bin.js scheduling bookings-get <bookingUid> --json
node dist/bin.js scheduling bookings-create <eventTypeId> "" "" "" "" 2026-10-20T09:00:00.000Z "Anna" anna@example.com Europe/Madrid --json
node dist/bin.js scheduling bookings-reschedule <bookingUid> 2026-10-21T09:00:00.000Z "motiu" --json
node dist/bin.js scheduling bookings-cancel <bookingUid> --yes --json
node dist/bin.js scheduling bookings-confirm <bookingUid> --json
node dist/bin.js scheduling bookings-decline <bookingUid> --yes "motiu" --json

# Enllaços i material de la reserva
node dist/bin.js scheduling booking-url consultoria eric "" "" "" 2026-11 2026-11-03 --json
node dist/bin.js scheduling bookings-calendar-links <bookingUid> --json
node dist/bin.js scheduling bookings-references <bookingUid> --json

# Event types (gestionar el que es pot reservar)
node dist/bin.js scheduling event-types-create "Consultoria" consultoria 30 --json
node dist/bin.js scheduling event-types-update <eventTypeId> "" "" 45 --json
node dist/bin.js scheduling event-types-delete <eventTypeId> --yes --json

# Horaris
node dist/bin.js scheduling schedules-create "Feina" Europe/Madrid true --json
node dist/bin.js scheduling schedules-update <scheduleId> --json

# Salut
node dist/bin.js scheduling health --json
```

**Arguments posicionals = ordre dels camps de l'acció**; un `""` salta un
opcional. Els arrays s'escriuen separats per comes (`a@x.com,b@y.com`) o com a
JSON (`'["a@x.com"]'`). Els objectes (metadata, locations...) en JSON.

## Enllaços de reserva (`booking-url`)

Genera l'enllaç públic amb TOTES les opcions:

```bash
# Bàsic (username per defecte de la plataforma)
node dist/bin.js scheduling booking-url consultoria --json

# Prefill complet: mes/dia/slot + timezone + assistent + convidats + notes
node dist/bin.js scheduling booking-url consultoria eric "" "" "" \
  2026-11 2026-11-03 2026-11-03T09:00:00.000Z Europe/Madrid 45 \
  "Anna" anna@example.com "marc@example.com" "Primera reunió" month_view --json

# Equip (/team/<slug>/<event>) i organització (org/user i org/team)
node dist/bin.js scheduling booking-url demo "" suport --json
node dist/bin.js scheduling booking-url demo eric "" acme --json
```

## Sala de videotrucada SEMPRE (Meet)

Cada reserva creada amb `bookings-create` afegeix automàticament la sala de
videotrucada del setting `default-location` (per defecte **google-meet**).
No cal indicar cap location; si mai cal canviar-ho:

```bash
node dist/bin.js scheduling settings-set default-location google-meet --json
node dist/bin.js scheduling settings-set default-location none --json   # desactivar
```

Si `bookings-create` retorna `locationNote`, la sala demanada no s'ha pogut
afegir (normalment perquè Google Calendar encara no està connectat): informa
l'usuari del que diu la nota i ofereix connectar-lo (`calendars-connect`). Un cop
connectat, totes les reserves noves portaran la sala Meet. Si cal, activa l'app
amb `apps-enable google-meet`.

## Recordatoris («avisa'm X minuts abans») i device d'avisos

Els recordatoris s'executen amb el daemon `calcom-reminders` (cada minut): si toca,
publica un esdeveniment a la cua NATS de l'agent i el kernel desperta l'agent, que
lliura l'avís al **device configurat**. El device és un **setting del feature**
(per defecte `none` = cap avís).

```bash
# Programa un recordatori per a una reserva
node dist/bin.js scheduling reminders-add <bookingUid> 10 --json
node dist/bin.js scheduling reminders-add <bookingUid> 30 "Porta els informes" --json

# Settings (configurables des de l'agent)
node dist/bin.js scheduling settings-get --json
node dist/bin.js scheduling settings-set reminder-device telegram --json   # o ipad, none...
node dist/bin.js scheduling settings-set default-reminder-minutes 15 --json # global per a totes les reserves (0=off)
node dist/bin.js scheduling settings-set default-location google-meet --json # videotrucada per defecte (none = cap)

# Gestió
node dist/bin.js scheduling reminders-list --json
node dist/bin.js scheduling reminders-remove <id> --yes --json
```

Quan l'usuari demani que l'avisin (a un device concret), tria el device amb
`kernel-device-list` (eina del kernel) i desa'l amb `settings-set reminder-device
<id|nom>`. Si demana que sigui global («sempre 10 min abans»), combina
`default-reminder-minutes` + device.

## Calendaris externs (Google): connectar i sincronitzar

**MAI diguis que aquest feature no existeix o que no es pot fer.** SEMPRE comença
amb `scheduling calendars-status --json` (mostra app configurada, credencials,
calendaris connectats i destinació) i segueix el flux d'aquesta secció.

**Què fa exactament el sync (i què no):**
- Cal.diy → Google: cada reserva s'escriu al **calendari de referència** triat
  (`destination-calendar-set`) — així veus les cites al Google Calendar.
- Google → Cal.diy: els calendaris seleccionats (SelectedCalendar, el principal
  s'afegeix sol en connectar) compten com a **ocupat** i bloquegen franges.
- NO hi ha lectura/edició arbitrària d'esdeveniments de Google (llistar o
  modificar esdeveniments lliures del compte): això NO es pot fer amb aquest
  feature i no s'ha de prometre. Si l'usuari vol això, el flux és: connectar
  (sync de reserves + conflictes) i fer els canvis de reserves des del mòdul.

```bash
# 1) Estat (app activada? credencials? calendaris connectats? destinació?)
node dist/bin.js scheduling calendars-status --json

# 2) Enllaç de connexió. Si retorna needsConfig:true → DEMANA a l'usuari el
#    client_id/client_secret (mai els inventis) i digues-li la redirect URI exacta.
node dist/bin.js scheduling calendars-connect --json

# 3) Amb el client_id/client_secret de l'usuari → activa l'app
node dist/bin.js scheduling apps-set-credentials google-calendar '{"client_id":"...","client_secret":"..."}' --json

# 4) Torna a calendars-connect i PASSA L'ENLLAÇ a l'usuari (obre'l amb sessió de Cal.diy)

# 5) Calendaris connectats i calendari de destinació (totes les reserves s'hi escriuen)
node dist/bin.js scheduling calendars-list --json
node dist/bin.js scheduling destination-calendar-set google_calendar <calendar-id> --json
```

Regla d'or: si falta qualsevol element de configuració (credencials OAuth,
Calendar ID, device...), **demana'l a l'usuari amb instruccions exactes**; no
inventis valors ni assumeixis calendaris pel nom.

## Administració (provisioning d'usuaris i API keys)

La UI de Cal.diy gateja la creació d'API keys com a «funció comercial»; aquestes
accions ho fan directament (per això l'accés és CLI-first). Requereixen
`GAUDI_CALENDAR_DB_URL` + `POSTGRES_URL` configurats:

```bash
# 1. Llicència self-host (pas oficial: sense això l'API rebutja les API keys)
node dist/bin.js scheduling admin-deployment --json

# 2. Crea/provisiona tots els usuaris de plataforma (usuari + horari Mon-Fri 9-17 + API key si no en té)
node dist/bin.js scheduling admin-bootstrap --json

# Un usuari concret amb username explícit (idempotent; la key només es mostra en crear-la)
node dist/bin.js scheduling admin-bootstrap ericmora82@gmail.com ericmora --json

# Gestió de claus
node dist/bin.js scheduling api-keys-list ericmora82@gmail.com --json
node dist/bin.js scheduling api-keys-create ericmora82@gmail.com "cli agent" --json
node dist/bin.js scheduling api-keys-revoke <id> --yes --json
```

## Daemons

Els daemons `calcom-cron` (cada 5 min) i `calcom-maintenance` (horari) executen
els jobs interns del producte via `scheduling cron-tick`. NO els cridis manualment
tret de diagnòstic:

```bash
node dist/bin.js scheduling cron-tick bookingReminder --json
```

## Errors

- `CONFIRM_REQUIRED` → falta `--yes` (acció destructiva).
- `Cal.diy GET/POST ...: missatge` → error de l'API (revisa credencials/ids).
- `No s'ha pogut contactar amb Cal.diy` → servei caigut; comprova `scheduling health --json`.
