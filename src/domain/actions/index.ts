import { z } from "zod";
import { createRegistry, type ActionRegistry, type ServiceContext } from "@gaudi/core";
import type { SchedulingContext } from "../../ports/context.js";
import { healthOutput } from "../model/health.js";
import {
  adminBootstrapInput,
  adminDeploymentInput,
  adminDeploymentOutput,
  adminBootstrapOutput,
  apiKeysCreateInput,
  apiKeysCreateOutput,
  apiKeysListInput,
  apiKeysListOutput,
  apiKeysRevokeInput,
  apiKeysRevokeOutput,
  appsEnableInput,
  appsEnableOutput,
  appsSetCredentialsInput,
  appsSetCredentialsOutput,
  calendarsConnectInput,
  calendarsConnectOutput,
  calendarsListInput,
  calendarsListOutput,
  calendarsStatusInput,
  calendarsStatusOutput,
  destinationCalendarSetInput,
  destinationCalendarSetOutput,
  remindersAddInput,
  remindersAddOutput,
  remindersDispatchInput,
  remindersDispatchOutput,
  remindersListInput,
  remindersListOutput,
  remindersRemoveInput,
  remindersRemoveOutput,
  settingsGetInput,
  settingsGetOutput,
  settingsSetInput,
  settingsSetOutput,
  bookingUrlInput,
  bookingUrlOutput,
  bookingsBySeatInput,
  bookingsCalendarLinksInput,
  bookingsCancelInput,
  bookingsConferencingSessionsInput,
  bookingsConfirmInput,
  bookingsCreateInput,
  bookingsDeclineInput,
  bookingsGetInput,
  bookingsListInput,
  bookingsMarkAbsentInput,
  bookingsRecordingsInput,
  bookingsReferencesInput,
  bookingsRescheduleInput,
  bookingsTranscriptsInput,
  calendarLinksOutput,
  conferencingSessionsOutput,
  cronTickInput,
  cronTickOutput,
  eventTypeDeleteOutput,
  eventTypeOutput,
  eventTypesCreateInput,
  eventTypesDeleteInput,
  eventTypesGetInput,
  eventTypesListInput,
  eventTypesOutput,
  eventTypesUpdateInput,
  meGetInput,
  meOutput,
  recordingsOutput,
  referencesOutput,
  scheduleDeleteOutput,
  scheduleOutput,
  schedulesCreateInput,
  schedulesDefaultInput,
  schedulesDeleteInput,
  schedulesGetInput,
  schedulesListInput,
  schedulesOutput,
  schedulesUpdateInput,
  slotsListInput,
  slotsOutput,
  transcriptsOutput,
  bookingsOutput,
  bookingOutput,
} from "../model/calendar.js";
import { buildBookingUrl } from "../services/booking-url.js";
import { adminBootstrap, adminDeployment, appsEnable, apiKeysCreate, apiKeysList, apiKeysRevoke } from "../services/admin-service.js";
import {
  appsSetCredentials,
  calendarsConnect,
  calendarsList,
  calendarsStatus,
  destinationCalendarSet,
} from "../services/calendars-service.js";
import {
  remindersAdd,
  remindersDispatch,
  remindersList,
  remindersRemove,
  settingsGet,
  settingsSet,
} from "../services/reminders-service.js";
import {
  cancelBooking,
  confirmBooking,
  createBooking,
  declineBooking,
  getBooking,
  getBookingBySeat,
  getBookingRecordings,
  getBookingReferences,
  getBookingTranscripts,
  getCalendarLinks,
  getConferencingSessions,
  listBookings,
  markAbsentBooking,
  rescheduleBooking,
} from "../services/bookings-service.js";
import { cronTick } from "../services/cron-service.js";
import {
  createEventType,
  deleteEventType,
  getEventType,
  listEventTypes,
  updateEventType,
} from "../services/event-types-service.js";
import { checkHealth } from "../services/health-service.js";
import { getMe } from "../services/me-service.js";
import {
  createSchedule,
  deleteSchedule,
  getDefaultSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
} from "../services/schedules-service.js";
import { listSlots } from "../services/slots-service.js";

function register<In, Out>(
  registry: ActionRegistry,
  def: {
    id: string;
    description: string;
    inputSchema: z.ZodType<In>;
    outputSchema: z.ZodType<Out>;
    handler: (input: In, ctx: SchedulingContext) => Promise<Out>;
    meta?: { destructive?: boolean; confirm?: "none" | "required" | "always"; permission?: string };
  }
) {
  registry.register<In, Out>({
    ...def,
    handler: def.handler as unknown as (input: In, ctx: ServiceContext) => Promise<Out>,
  });
}

/**
 * Registry del feature: UNA acció = UNA font de veritat.
 * El CLI, les tools d'agent i la documentació del skill es generen d'aquí.
 * Cobreix tota la superfície de l'API v2 de Cal.diy rellevant per a agents.
 */
export function buildRegistry(): ActionRegistry {
  const registry = createRegistry();

  register(registry, {
    id: "scheduling.health",
    description: "Salut del feature: API v2, app web i credencials de Cal.diy (SPEC §18).",
    inputSchema: z.object({}),
    outputSchema: healthOutput,
    handler: async (_input, ctx) => checkHealth(ctx),
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.me-get",
    description: "Perfil de l'usuari autenticat a Cal.diy (id, username, email, timeZone) — útil abans de reservar.",
    inputSchema: meGetInput,
    outputSchema: meOutput,
    handler: getMe,
    meta: { destructive: false },
  });

  // ── Event types ─────────────────────────────────────────────────────────
  register(registry, {
    id: "scheduling.event-types-list",
    description: "Llista els event types (tipus de cita reservables) de l'usuari.",
    inputSchema: eventTypesListInput,
    outputSchema: eventTypesOutput,
    handler: listEventTypes,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.event-types-get",
    description: "Detall d'un event type pel seu id.",
    inputSchema: eventTypesGetInput,
    outputSchema: eventTypeOutput,
    handler: getEventType,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.event-types-create",
    description: "Crea un event type (tipus de cita): títol, slug, durada i opcions (confirmation, buffers, seats...).",
    inputSchema: eventTypesCreateInput,
    outputSchema: eventTypeOutput,
    handler: createEventType,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.event-types-update",
    description: "Actualitza un event type (només els camps indicats).",
    inputSchema: eventTypesUpdateInput,
    outputSchema: eventTypeOutput,
    handler: updateEventType,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.event-types-delete",
    description: "Elimina un event type (les reserves existents no s'esborren).",
    inputSchema: eventTypesDeleteInput,
    outputSchema: eventTypeDeleteOutput,
    handler: deleteEventType,
    meta: { destructive: true, confirm: "required", permission: "scheduling.delete" },
  });

  // ── Disponibilitat ──────────────────────────────────────────────────────
  register(registry, {
    id: "scheduling.slots-list",
    description:
      "Franges disponibles (slots) d'un event type en un rang de dates, creuant els calendaris connectats.",
    inputSchema: slotsListInput,
    outputSchema: slotsOutput,
    handler: listSlots,
    meta: { destructive: false },
  });

  // ── Bookings ────────────────────────────────────────────────────────────
  register(registry, {
    id: "scheduling.bookings-list",
    description: "Llista reserves amb filtres (estat, email d'assistent, event type, dates, paginació).",
    inputSchema: bookingsListInput,
    outputSchema: bookingsOutput,
    handler: listBookings,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.bookings-get",
    description: "Detall d'una reserva pel seu UID (o totes les recurrències d'una reserva recurrent).",
    inputSchema: bookingsGetInput,
    outputSchema: bookingOutput,
    handler: getBooking,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.bookings-by-seat",
    description: "Reserva per seatUid (bookings amb seients).",
    inputSchema: bookingsBySeatInput,
    outputSchema: bookingOutput,
    handler: getBookingBySeat,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.bookings-create",
    description:
      "Crea una reserva per a un event type (id o slug+username) en una data UTC, amb assistent (nom/email/timezone), convidats, notes i metadata.",
    inputSchema: bookingsCreateInput,
    outputSchema: bookingOutput,
    handler: createBooking,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.bookings-reschedule",
    description: "Reprograma una reserva a un nou inici (UTC ISO).",
    inputSchema: bookingsRescheduleInput,
    outputSchema: bookingOutput,
    handler: rescheduleBooking,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.bookings-cancel",
    description: "Cancel·la una reserva amb motiu opcional.",
    inputSchema: bookingsCancelInput,
    outputSchema: bookingOutput,
    handler: cancelBooking,
    meta: { destructive: true, confirm: "required", permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.bookings-confirm",
    description: "Confirma una reserva pendent (event types amb requiresConfirmation).",
    inputSchema: bookingsConfirmInput,
    outputSchema: bookingOutput,
    handler: confirmBooking,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.bookings-decline",
    description: "Rebutja una reserva pendent amb motiu opcional.",
    inputSchema: bookingsDeclineInput,
    outputSchema: bookingOutput,
    handler: declineBooking,
    meta: { destructive: true, confirm: "required", permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.bookings-mark-absent",
    description: "Marca no-presentats (attendees/hosts per email) en una reserva passada.",
    inputSchema: bookingsMarkAbsentInput,
    outputSchema: bookingOutput,
    handler: markAbsentBooking,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.bookings-calendar-links",
    description: "Enllaços «Afegir al calendari» d'una reserva (Google, Outlook, Office, ICS).",
    inputSchema: bookingsCalendarLinksInput,
    outputSchema: calendarLinksOutput,
    handler: getCalendarLinks,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.bookings-references",
    description: "Referències externes d'una reserva (calendaris/videotrucada) amb filtres.",
    inputSchema: bookingsReferencesInput,
    outputSchema: referencesOutput,
    handler: getBookingReferences,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.bookings-recordings",
    description: "Gravacions de Cal Video d'una reserva.",
    inputSchema: bookingsRecordingsInput,
    outputSchema: recordingsOutput,
    handler: getBookingRecordings,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.bookings-transcripts",
    description: "Enllaços de transcripció de Cal Video d'una reserva (caducen en 1h).",
    inputSchema: bookingsTranscriptsInput,
    outputSchema: transcriptsOutput,
    handler: getBookingTranscripts,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.bookings-conferencing-sessions",
    description: "Sessions de videotrucada d'una reserva (Cal Video).",
    inputSchema: bookingsConferencingSessionsInput,
    outputSchema: conferencingSessionsOutput,
    handler: getConferencingSessions,
    meta: { destructive: false },
  });

  // ── Schedules (disponibilitat recurrent) ───────────────────────────────
  register(registry, {
    id: "scheduling.schedules-list",
    description: "Llista els horaris (schedules) de l'usuari.",
    inputSchema: schedulesListInput,
    outputSchema: schedulesOutput,
    handler: listSchedules,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.schedules-get",
    description: "Detall d'un horari pel seu id.",
    inputSchema: schedulesGetInput,
    outputSchema: scheduleOutput,
    handler: getSchedule,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.schedules-default",
    description: "Horari per defecte de l'usuari.",
    inputSchema: schedulesDefaultInput,
    outputSchema: scheduleOutput,
    handler: getDefaultSchedule,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.schedules-create",
    description: "Crea un horari (nom, timezone, disponibilitat setmanal) i opcionalment el marca per defecte.",
    inputSchema: schedulesCreateInput,
    outputSchema: scheduleOutput,
    handler: createSchedule,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.schedules-update",
    description: "Actualitza un horari (nom, timezone, disponibilitat, per defecte).",
    inputSchema: schedulesUpdateInput,
    outputSchema: scheduleOutput,
    handler: updateSchedule,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.schedules-delete",
    description: "Elimina un horari (no pot ser el darrer/únic).",
    inputSchema: schedulesDeleteInput,
    outputSchema: scheduleDeleteOutput,
    handler: deleteSchedule,
    meta: { destructive: true, confirm: "required", permission: "scheduling.delete" },
  });

  // ── Enllaços de reserva i jobs interns ─────────────────────────────────
  register(registry, {
    id: "scheduling.booking-url",
    description:
      "Genera l'enllaç públic de reserva amb opcions: mes/dia/slot, timezone, durada, prefill (nom/email/convidats/notes), layout, embed, tema i metadata.",
    inputSchema: bookingUrlInput,
    outputSchema: bookingUrlOutput,
    handler: async (input, ctx) =>
      buildBookingUrl(input, {
        publicUrl: ctx.config.publicUrl,
        defaultUsername: ctx.config.defaultUsername,
        defaultTimeZone: ctx.config.defaultTimeZone,
      }),
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.cron-tick",
    description:
      "Executa els jobs interns de Cal.diy (recordatoris, subscripcions, triggers de webhooks). Els invoquen els daemons calcom-cron/calcom-maintenance.",
    inputSchema: cronTickInput,
    outputSchema: cronTickOutput,
    handler: cronTick,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  // ── Administració (provisioning; la UI ho gateja com a "funció comercial") ──
  register(registry, {
    id: "scheduling.admin-deployment",
    description:
      "Assegura la fila Deployment amb la llicència self-host de Cal.diy (sense això l'API v2 rebutja les API keys: 'Invalid or missing CALCOM_LICENSE_KEY'). Procediment oficial self-host.",
    inputSchema: adminDeploymentInput,
    outputSchema: adminDeploymentOutput,
    handler: adminDeployment,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.admin-bootstrap",
    description:
      "Provisiona a Cal.diy els usuaris registrats a la plataforma (usuari + horari per defecte Mon-Fri 9-17 + API key si no en té): idempotent. Sense email → tots; amb email/username → un de concret.",
    inputSchema: adminBootstrapInput,
    outputSchema: adminBootstrapOutput,
    handler: adminBootstrap,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.api-keys-list",
    description: "Llista les API keys d'un usuari de Cal.diy (id, nota, creació, darrer ús).",
    inputSchema: apiKeysListInput,
    outputSchema: apiKeysListOutput,
    handler: apiKeysList,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.api-keys-create",
    description:
      "Crea una API key per a un usuari de Cal.diy i la mostra en pla (només un cop). Mecànica del producte: hashedKey=sha256(key sense prefix).",
    inputSchema: apiKeysCreateInput,
    outputSchema: apiKeysCreateOutput,
    handler: apiKeysCreate,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.api-keys-revoke",
    description: "Revoca (elimina) una API key pel seu id.",
    inputSchema: apiKeysRevokeInput,
    outputSchema: apiKeysRevokeOutput,
    handler: apiKeysRevoke,
    meta: { destructive: true, confirm: "required", permission: "scheduling.delete" },
  });

  // ── Recordatoris i settings (device configurable; default 'none') ────────
  register(registry, {
    id: "scheduling.reminders-add",
    description:
      "Programa un recordatori per a una reserva: X minuts abans, el feature publica un esdeveniment a la cua de l'agent i el kernel desperta l'agent perquè avisi el device configurat (settings reminder-device).",
    inputSchema: remindersAddInput,
    outputSchema: remindersAddOutput,
    handler: remindersAdd,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.reminders-list",
    description: "Llista els recordatoris programats (i els settings efectius de device/minuts per defecte).",
    inputSchema: remindersListInput,
    outputSchema: remindersListOutput,
    handler: remindersList,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.reminders-remove",
    description: "Elimina un recordatori pel seu id.",
    inputSchema: remindersRemoveInput,
    outputSchema: remindersRemoveOutput,
    handler: remindersRemove,
    meta: { destructive: true, confirm: "required", permission: "scheduling.delete" },
  });

  register(registry, {
    id: "scheduling.reminders-dispatch",
    description:
      "Comprova els recordatoris vençuts i publica els avisos al bus de l'agent. L'executa el daemon calcom-reminders cada minut.",
    inputSchema: remindersDispatchInput,
    outputSchema: remindersDispatchOutput,
    handler: remindersDispatch,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.settings-get",
    description: "Llegeix els settings del feature (reminder-device, default-reminder-minutes).",
    inputSchema: settingsGetInput,
    outputSchema: settingsGetOutput,
    handler: settingsGet,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.settings-set",
    description:
      "Configura un setting del feature: reminder-device (device id/name per als avisos; 'none' = cap) i default-reminder-minutes (recordatori global X min abans de cada reserva; 0 = off).",
    inputSchema: settingsSetInput,
    outputSchema: settingsSetOutput,
    handler: settingsSet,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  // ── Calendaris externs (Google) ─────────────────────────────────────────
  register(registry, {
    id: "scheduling.calendars-status",
    description:
      "Estat de la integració de calendaris: app google-calendar (activada/configurada), calendaris connectats, calendari de destinació i settings.",
    inputSchema: calendarsStatusInput,
    outputSchema: calendarsStatusOutput,
    handler: calendarsStatus,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.calendars-connect",
    description:
      "Retorna l'enllaç OAuth per connectar Google Calendar. Si falta configuració (client_id/secret), retorna needsConfig amb el que cal demanar a l'usuari — mai inventar credencials.",
    inputSchema: calendarsConnectInput,
    outputSchema: calendarsConnectOutput,
    handler: calendarsConnect,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.calendars-list",
    description: "Calendaris connectats (credencials de Google/Outlook) i calendari de destinació actual.",
    inputSchema: calendarsListInput,
    outputSchema: calendarsListOutput,
    handler: calendarsList,
    meta: { destructive: false },
  });

  register(registry, {
    id: "scheduling.destination-calendar-set",
    description:
      "Fixa el calendari de destinació (totes les reserves s'hi escriuen). Necessita integration (ex: google_calendar) i externalId (a Google: 'Calendar ID' del calendari).",
    inputSchema: destinationCalendarSetInput,
    outputSchema: destinationCalendarSetOutput,
    handler: destinationCalendarSet,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.apps-enable",
    description: "Activa (o desactiva) una app de Cal.diy existent (ex: google-meet per a videotrucades).",
    inputSchema: appsEnableInput,
    outputSchema: appsEnableOutput,
    handler: appsEnable,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  register(registry, {
    id: "scheduling.apps-set-credentials",
    description:
      "Desa les credencials OAuth (client_id/secret) de l'app google-calendar a la BD de Cal.diy i l'activa. Pas previ a calendars-connect.",
    inputSchema: appsSetCredentialsInput,
    outputSchema: appsSetCredentialsOutput,
    handler: appsSetCredentials,
    meta: { destructive: false, permission: "scheduling.write" },
  });

  return registry;
}
