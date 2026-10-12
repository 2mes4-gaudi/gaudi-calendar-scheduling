import { z } from "zod";

/**
 * Model del domini calendar.scheduling.
 * Els outputs són deliberadament permissius (passthrough): l'estat és del producte
 * (Cal.diy) i el manifest/CLI no ha de trencar-se si l'API afegeix camps.
 */

const loose = z.record(z.unknown());
const looseArray = z.array(z.unknown());

// ── Inputs ────────────────────────────────────────────────────────────────

export const meGetInput = z.object({});

export const eventTypesListInput = z.object({
  username: z.string().optional().describe("Només els event types públics d'aquest username"),
});

export const eventTypesGetInput = z.object({
  eventTypeId: z.coerce.number().int().describe("ID de l'event type"),
});

export const eventTypeFields = {
  description: z.string().optional(),
  hidden: z.boolean().optional(),
  slotInterval: z.coerce.number().int().optional(),
  minimumBookingNotice: z.coerce.number().int().optional(),
  beforeEventBuffer: z.coerce.number().int().optional(),
  afterEventBuffer: z.coerce.number().int().optional(),
  requiresConfirmation: z.boolean().optional(),
  disableGuests: z.boolean().optional(),
  seatsPerTimeSlot: z.coerce.number().int().optional(),
  seatsShowAttendees: z.boolean().optional(),
  price: z.coerce.number().optional(),
  currency: z.string().optional(),
  scheduleId: z.coerce.number().int().optional(),
  locations: looseArray.optional().describe("JSON array de locations de Cal.diy"),
  bookingFields: looseArray.optional().describe("JSON array de camps de reserva"),
};

export const eventTypesCreateInput = z.object({
  title: z.string(),
  slug: z.string(),
  lengthInMinutes: z.coerce.number().int().positive(),
  ...eventTypeFields,
});

export const eventTypesUpdateInput = z.object({
  eventTypeId: z.coerce.number().int(),
  title: z.string().optional(),
  slug: z.string().optional(),
  lengthInMinutes: z.coerce.number().int().positive().optional(),
  ...eventTypeFields,
});

export const eventTypesDeleteInput = z.object({
  eventTypeId: z.coerce.number().int(),
});

export const slotsListInput = z.object({
  eventTypeId: z.coerce.number().int(),
  start: z.string().describe("Inici del rang (YYYY-MM-DD o ISO)"),
  end: z.string().describe("Fi del rang (YYYY-MM-DD o ISO)"),
  timeZone: z.string().optional().describe("Timezone IANA (ex: Europe/Madrid)"),
  format: z.string().optional().describe("range (per defecte) | time | slots"),
  duration: z.coerce.number().int().optional(),
  username: z.string().optional(),
});

export const bookingsListInput = z.object({
  status: z
    .enum(["upcoming", "recurring", "past", "cancelled", "unconfirmed"])
    .optional()
    .describe("Filtre per estat"),
  eventTypeId: z.coerce.number().int().optional(),
  attendeeEmail: z.string().optional(),
  attendeeName: z.string().optional(),
  bookingUid: z.string().optional(),
  afterStart: z.string().optional().describe("ISO: reserves que comencen després"),
  beforeEnd: z.string().optional().describe("ISO: reserves que acaben abans"),
  limit: z.coerce.number().int().optional(),
  cursor: z.string().optional().describe("Paginació"),
});

export const bookingsGetInput = z.object({
  bookingUid: z.string(),
});

export const bookingsBySeatInput = z.object({
  seatUid: z.string(),
});

export const bookingsCreateInput = z
  .object({
    eventTypeId: z.coerce.number().int().optional(),
    eventTypeSlug: z.string().optional(),
    username: z.string().optional(),
    teamSlug: z.string().optional(),
    organizationSlug: z.string().optional(),
    start: z.string().describe("Inici en UTC ISO (ex: 2026-10-20T09:00:00.000Z)"),
    attendeeName: z.string(),
    attendeeEmail: z.string(),
    attendeeTimeZone: z.string(),
    attendeePhoneNumber: z.string().optional(),
    attendeeLanguage: z.string().optional(),
    guests: z.array(z.string()).optional(),
    notes: z.string().optional(),
    metadata: z.record(z.string()).optional(),
    bookingFieldsResponses: loose.optional(),
    location: loose.optional().describe("Location JSON (si l'event type en permet triar)"),
  })
  .refine((i) => i.eventTypeId !== undefined || (i.eventTypeSlug !== undefined && (i.username !== undefined || i.teamSlug !== undefined)), {
    message: "Cal eventTypeId o bé eventTypeSlug + username/teamSlug",
  });

export const bookingsCancelInput = z.object({
  bookingUid: z.string(),
  reason: z.string().optional().describe("Motiu de cancel·lació"),
});

export const bookingsRescheduleInput = z.object({
  bookingUid: z.string(),
  start: z.string().describe("Nou inici en UTC ISO"),
  reason: z.string().optional(),
});

export const bookingsConfirmInput = z.object({
  bookingUid: z.string(),
});

export const bookingsDeclineInput = z.object({
  bookingUid: z.string(),
  reason: z.string().optional(),
});

export const bookingsMarkAbsentInput = z.object({
  bookingUid: z.string(),
  attendees: z.array(z.string()).optional().describe("Emails d'assistents no presentats"),
  hosts: z.array(z.string()).optional().describe("Emails de hosts no presentats"),
});

export const bookingsCalendarLinksInput = z.object({
  bookingUid: z.string(),
});

export const bookingsReferencesInput = z.object({
  bookingUid: z.string(),
  type: z.string().optional(),
  provider: z.string().optional(),
});

export const bookingsRecordingsInput = z.object({
  bookingUid: z.string(),
});

export const bookingsTranscriptsInput = z.object({
  bookingUid: z.string(),
});

export const bookingsConferencingSessionsInput = z.object({
  bookingUid: z.string(),
});

export const scheduleAvailability = z.object({
  days: z.array(z.string()).describe("Dies: ['Monday',...]"),
  startTime: z.string().describe("HH:MM (24h)"),
  endTime: z.string().describe("HH:MM (24h)"),
});

export const schedulesListInput = z.object({});

export const schedulesGetInput = z.object({
  scheduleId: z.coerce.number().int(),
});

export const schedulesDefaultInput = z.object({});

export const schedulesCreateInput = z.object({
  name: z.string(),
  timeZone: z.string(),
  isDefault: z.boolean().optional(),
  availability: z.array(scheduleAvailability).optional(),
});

export const schedulesUpdateInput = z.object({
  scheduleId: z.coerce.number().int(),
  name: z.string().optional(),
  timeZone: z.string().optional(),
  isDefault: z.boolean().optional(),
  availability: z.array(scheduleAvailability).optional(),
});

export const schedulesDeleteInput = z.object({
  scheduleId: z.coerce.number().int(),
});

export const bookingUrlInput = z.object({
  eventSlug: z.string().describe("Slug de l'event type (ex: 30min)"),
  username: z.string().optional().describe("Perfil que rep la reserva (per defecte GAUDI_CALENDAR_DEFAULT_USERNAME)"),
  teamSlug: z.string().optional().describe("Equip (enllaç /team/<slug>/<event>)"),
  organizationSlug: z.string().optional().describe("Organització (enllaç /<org>/<user|team>/<event>)"),
  baseUrl: z.string().optional().describe("Base URL (per defecte GAUDI_CALENDAR_PUBLIC_URL)"),
  month: z.string().optional().describe("Mes pre-seleccionat (YYYY-MM)"),
  date: z.string().optional().describe("Dia pre-seleccionat (YYYY-MM-DD)"),
  slot: z.string().optional().describe("Slot pre-seleccionat ISO UTC"),
  timeZone: z.string().optional().describe("Timezone de qui reserva (IANA)"),
  duration: z.coerce.number().int().optional().describe("Durada en minuts (event types multi-durada)"),
  name: z.string().optional().describe("Nom de l'assistent (prefill)"),
  email: z.string().optional().describe("Email de l'assistent (prefill)"),
  guests: z.array(z.string()).optional().describe("Convidats (prefill)"),
  notes: z.string().optional().describe("Notes (prefill)"),
  layout: z.enum(["month_view", "week_view", "column_view"]).optional(),
  embed: z.string().optional().describe("embed | embed-type (si s'incrusta)"),
  embedType: z.string().optional(),
  theme: z.enum(["light", "dark", "auto"]).optional(),
  metadata: z.record(z.string()).optional().describe("Precàrrega de metadata (metadata[clau]=valor)"),
});

export const KNOWN_CRON_JOBS = [
  "bookingReminder",
  "calendar-subscriptions",
  "calendar-subscriptions-cleanup",
  "changeTimeZone",
  "selected-calendars",
  "syncAppMeta",
  "webhookTriggers",
] as const;

export const cronTickInput = z.object({
  jobs: z
    .array(z.string())
    .optional()
    .describe(`Jobs interns de Cal.diy (per defecte tots): ${KNOWN_CRON_JOBS.join(", ")}`),
});

// ── Administració (provisioning d'usuaris i API keys; la UI ho gateja com a "comercial") ──

export const adminDeploymentInput = z.object({
  licenseKey: z
    .string()
    .optional()
    .describe("Llicència (per defecte la self-host de Cal.diy: 00000000-0000-0000-0000-000000000000)"),
});

export const adminDeploymentOutput = z.object({
  id: z.number(),
  licenseKey: z.string(),
  selfHost: z.boolean().describe("true si és la llicència self-host documentada"),
});

export const adminBootstrapInput = z.object({
  email: z.string().optional().describe("Email de l'usuari Cal.diy (per defecte: tots els usuaris registrats a la plataforma)"),
  username: z.string().optional().describe("Username Cal.diy (per defecte derivat de l'email; només amb email explícit)"),
  name: z.string().optional().describe("Nom visible (per defecte el del perfil de plataforma o el username)"),
  timeZone: z.string().optional().describe("Timezone IANA (per defecte la del perfil o GAUDI_CALENDAR_DEFAULT_TIMEZONE)"),
});

export const adminBootstrapOutput = z.object({
  users: z.array(
    z.object({
      email: z.string(),
      username: z.string(),
      created: z.boolean(),
      scheduleId: z.number().optional(),
      apiKey: z.string().optional().describe("Clau en pla (només es mostra en crear-la)"),
      apiKeyId: z.string().optional(),
    })
  ),
});

export const apiKeysListInput = z.object({
  email: z.string().describe("Email de l'usuari Cal.diy"),
});

export const apiKeysListOutput = z.object({
  user: z.object({ id: z.number(), username: z.string(), email: z.string() }),
  keys: z.array(
    z.object({
      id: z.string(),
      note: z.string().nullish(),
      createdAt: z.string().nullish(),
      lastUsedAt: z.string().nullish(),
      expiresAt: z.string().nullish(),
    })
  ),
});

export const apiKeysCreateInput = z.object({
  email: z.string().describe("Email de l'usuari Cal.diy"),
  note: z.string().optional().describe("Nota identificativa de la clau"),
});

export const apiKeysCreateOutput = z.object({
  user: z.object({ id: z.number(), username: z.string(), email: z.string() }),
  id: z.string(),
  note: z.string(),
  apiKey: z.string().describe("Clau en pla (només es mostra ara)"),
});

export const apiKeysRevokeInput = z.object({
  id: z.string().describe("Id de la clau (scheduling api-keys-list)"),
});

export const apiKeysRevokeOutput = z.object({ revoked: z.boolean(), id: z.string() });

// ── Recordatoris (NATS wake → agent → device) i settings del feature ──────

export const reminderSchema = z.object({
  id: z.string(),
  bookingUid: z.string(),
  title: z.string().optional(),
  start: z.string().describe("Inici de la reserva (ISO UTC)"),
  minutesBefore: z.number(),
  message: z.string().optional(),
  device: z.string().optional().describe("Device per aquest recordatori ('' o 'none' = cap)"),
  status: z.enum(["pending", "dispatched", "skipped", "expired"]),
  skipReason: z.string().optional(),
  createdAt: z.string(),
  dispatchedAt: z.string().optional(),
});
export type ReminderModel = z.infer<typeof reminderSchema>;

export const remindersAddInput = z.object({
  bookingUid: z.string().describe("UID de la reserva"),
  minutesBefore: z.coerce.number().int().min(1).max(10080).describe("Minuts abans de l'inici (1..10080)"),
  message: z.string().optional().describe("Missatge propi per al recordatori (si no, l'agent el redacta)"),
  device: z.string().optional().describe("Device per aquest recordatori (per defecte: setting reminder-device)"),
});

export const remindersAddOutput = z.object({ reminder: reminderSchema });

export const remindersListInput = z.object({
  bookingUid: z.string().optional().describe("Filtra per reserva"),
});

export const remindersListOutput = z.object({
  reminders: z.array(reminderSchema),
  settings: z.object({ device: z.string(), defaultMinutes: z.number() }),
});

export const remindersRemoveInput = z.object({ id: z.string() });
export const remindersRemoveOutput = z.object({ removed: z.boolean(), id: z.string() });

export const remindersDispatchInput = z.object({
  now: z.string().optional().describe("Instant de referència ISO (diagnòstic; per defecte ara)"),
});

export const remindersDispatchOutput = z.object({
  ok: z.boolean(),
  device: z.string(),
  defaultMinutes: z.number(),
  dispatched: z.array(
    z.object({ id: z.string(), bookingUid: z.string(), title: z.string().optional(), start: z.string(), minutesBefore: z.number() })
  ),
  skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
  expired: z.number(),
});

export const settingsGetInput = z.object({
  key: z.string().optional().describe("Clau del setting (per defecte: tots)"),
});

export const settingsGetOutput = z.object({ settings: z.record(z.string()) });

export const settingsSetInput = z.object({
  key: z
    .string()
    .describe("Setting: reminder-device (device id/name o 'none'), default-reminder-minutes (0=off)"),
  value: z.string(),
});

export const settingsSetOutput = z.object({ key: z.string(), value: z.string() });

// ── Calendaris externs (Google) ───────────────────────────────────────────

export const calendarsStatusInput = z.object({});

export const calendarsStatusOutput = z.object({
  user: z.object({ id: z.number(), username: z.string(), email: z.string() }),
  app: z.object({
    slug: z.string(),
    enabled: z.boolean(),
    configured: z.boolean().describe("true si l'app té client_id/secret a la BD"),
  }),
  calendarCredentials: z.array(
    z.object({ id: z.number(), type: z.string(), appId: z.string().nullish(), createdAt: z.string().nullish() })
  ),
  destinationCalendar: z.unknown().nullish(),
  settings: z.object({ device: z.string(), defaultMinutes: z.number() }),
});

export const calendarsConnectInput = z.object({
  integration: z.string().optional().describe("google_calendar (per defecte)"),
});

export const calendarsConnectOutput = z.object({
  ok: z.boolean(),
  url: z.string().optional().describe("Enllaç d'autorització OAuth (obre'l al navegador amb la sessió de Cal.diy)"),
  needsConfig: z.boolean(),
  missing: z.array(z.string()),
  instructions: z.array(z.string()),
  redirectUri: z.string(),
});

export const calendarsListInput = z.object({});

export const calendarsListOutput = z.object({
  user: z.object({ id: z.number(), username: z.string(), email: z.string() }),
  calendarCredentials: z.array(
    z.object({ id: z.number(), type: z.string(), appId: z.string().nullish(), createdAt: z.string().nullish() })
  ),
  destinationCalendar: z.unknown().nullish(),
});

export const destinationCalendarSetInput = z.object({
  integration: z.string().describe("Integració del calendari (ex: google_calendar)"),
  externalId: z.string().describe("Id extern del calendari (a Google: Settings del calendari → 'Calendar ID')"),
});

export const destinationCalendarSetOutput = z.object({ destination: z.unknown() });

export const appsSetCredentialsInput = z.object({
  slug: z.string().optional().describe("Slug de l'app (per defecte google-calendar)"),
  credentialsJson: z
    .string()
    .optional()
    .describe("JSON {client_id, client_secret} (per defecte: env GAUDI_CALENDAR_GOOGLE_CREDENTIALS_JSON)"),
});

export const appsSetCredentialsOutput = z.object({
  slug: z.string(),
  enabled: z.boolean(),
  configured: z.boolean(),
  redirectUri: z.string(),
});

// ── Outputs ───────────────────────────────────────────────────────────────

export const meOutput = z.object({ user: z.unknown() });
export const eventTypesOutput = z.object({ eventTypes: z.unknown() });
export const eventTypeOutput = z.object({ eventType: z.unknown() });
export const eventTypeDeleteOutput = z.object({ deleted: z.boolean(), eventTypeId: z.number() });
export const slotsOutput = z.object({
  eventTypeId: z.number(),
  start: z.string(),
  end: z.string(),
  timeZone: z.string().optional(),
  slots: z.unknown(),
});
export const bookingsOutput = z.object({ bookings: z.unknown(), pagination: z.unknown().optional() });
export const bookingOutput = z.object({ booking: z.unknown() });
export const calendarLinksOutput = z.object({ calendarLinks: z.unknown() });
export const referencesOutput = z.object({ references: z.unknown() });
export const recordingsOutput = z.object({ recordings: z.unknown() });
export const transcriptsOutput = z.object({ transcripts: z.unknown() });
export const conferencingSessionsOutput = z.object({ sessions: z.unknown() });
export const schedulesOutput = z.object({ schedules: z.unknown() });
export const scheduleOutput = z.object({ schedule: z.unknown() });
export const scheduleDeleteOutput = z.object({ deleted: z.boolean(), scheduleId: z.number() });
export const bookingUrlOutput = z.object({
  url: z.string(),
  path: z.string(),
  eventSlug: z.string(),
  username: z.string().optional(),
  teamSlug: z.string().optional(),
  organizationSlug: z.string().optional(),
  params: z.record(z.string()),
});
export const cronTickOutput = z.object({
  ok: z.boolean(),
  results: z.array(
    z.object({
      job: z.string(),
      ok: z.boolean(),
      detail: z.unknown().optional(),
      error: z.string().optional(),
    })
  ),
});
