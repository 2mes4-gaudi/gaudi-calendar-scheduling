import type { z } from "zod";
import { unwrapData } from "../../ports/calcom.js";
import type { SchedulingContext } from "../../ports/context.js";
import type {
  appsSetCredentialsInput,
  calendarsConnectInput,
  destinationCalendarSetInput,
} from "../model/calendar.js";
import { getDefaultMinutes, getDevice } from "./reminders-service.js";
import { API_VERSIONS } from "./versions.js";

/** Slugs/identificadors de Cal.diy per a Google Calendar. */
export const GOOGLE_APP_SLUG = "google-calendar";
export const GOOGLE_INTEGRATION = "google_calendar";
export const GOOGLE_BACKGROUND_INTEGRATION = "google_calendar"; // DestinationCalendar.integration

/** Scopes exactes del producte (packages/lib/constants.ts de Cal.diy). */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const ADMIN_PARAM = "https://accounts.google.com/o/oauth2/v2/auth";

function admin(ctx: SchedulingContext) {
  if (!ctx.admin) {
    throw new Error("Mòdul d'administració no configurat: cal GAUDI_CALENDAR_DB_URL i POSTGRES_URL.");
  }
  return ctx.admin.calcomDb;
}

function googleCallbackUrl(ctx: SchedulingContext): string {
  return `${ctx.config.publicUrl.replace(/\/$/, "")}/api/integrations/googlecalendar/callback`;
}

/** Construeix l'enllaç d'autorització OAuth de Google per connectar el calendari. */
export function buildGoogleAuthUrl(opts: { clientId: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  return `${ADMIN_PARAM}?${params.toString()}`;
}

/** Estat complet: app configurada, calendaris connectats, calendari de destinació i settings. */
export async function calendarsStatus(_input: unknown, ctx: SchedulingContext) {
  const store = admin(ctx);
  const app = await store.getApp(GOOGLE_APP_SLUG);
  let user: { id: number; username: string; email: string } | undefined;
  let credentials: Array<{ id: number; type: string; appId: string | null; createdAt: Date | null }> = [];
  let destination: unknown = null;
  try {
    const me = unwrapData(await ctx.calcom.get("/v2/me", {}, API_VERSIONS.me)) as {
      id?: number;
      username?: string;
      email?: string;
    } | null;
    if (me?.id) {
      user = { id: me.id, username: me.username ?? "", email: me.email ?? "" };
      credentials = await store.listCalendarCredentials(me.id);
      destination = (await store.getDestinationCalendar(me.id)) ?? null;
    }
  } catch {
    // API no disponible → status parcial (app/admin)
  }
  return {
    user: user ?? { id: 0, username: "", email: "" },
    app: {
      slug: GOOGLE_APP_SLUG,
      enabled: Boolean((app as { enabled?: boolean } | undefined)?.enabled),
      configured: Boolean((app as { keys?: { client_id?: string } } | undefined)?.keys?.client_id),
    },
    calendarCredentials: credentials.map((c) => ({
      id: c.id,
      type: c.type,
      appId: c.appId,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    })),
    destinationCalendar: destination,
    settings: { device: await getDevice(ctx), defaultMinutes: await getDefaultMinutes(ctx) },
  };
}

/**
 * Genera l'enllaç per connectar Google Calendar.
 * Si l'app no està configurada (client_id/secret), retorna needsConfig amb el que cal
 * (l'agent ho ha de DEMANAR a l'usuari; mai ho pot inventar).
 */
export async function calendarsConnect(input: z.infer<typeof calendarsConnectInput>, ctx: SchedulingContext) {
  const store = admin(ctx);
  const redirectUri = googleCallbackUrl(ctx);
  const app = await store.getApp(GOOGLE_APP_SLUG);
  const clientId = (app as { keys?: { client_id?: string } } | undefined)?.keys?.client_id;

  if (!clientId) {
    return {
      ok: false,
      needsConfig: true,
      missing: [
        "Credencials OAuth de Google (client_id + client_secret) a l'app google-calendar",
        `Redirect URI autoritzada a Google Cloud Console: ${redirectUri}`,
      ],
      instructions: [
        `Crea (o reutilitza) un client OAuth 2.0 de tipus "Web application" a Google Cloud Console.`,
        `Afegeix com a "Authorized redirect URI": ${redirectUri}`,
        `Passa'm el client_id i el client_secret (o executa: scheduling apps-set-credentials google-calendar '{"client_id":"...","client_secret":"..."}').`,
        "Després torna a demanar l'enllaç de connexió de calendari.",
      ],
      redirectUri,
    };
  }

  return {
    ok: true,
    url: buildGoogleAuthUrl({ clientId, redirectUri }),
    needsConfig: false,
    missing: [],
    instructions: [
      "Obre l'enllaç a un navegador amb la sessió de Cal.diy iniciada (cal.apps.ona.gaudi.2mes4.com).",
      "Autoritza l'accés al calendari; en tornar, Cal.diy desarà la credencial i seleccionarà el calendari principal.",
      "Després pots fixar el calendari de destinació amb: scheduling destination-calendar-set google_calendar <calendar-id>.",
    ],
    redirectUri,
  };
}

/** Calendaris connectats (credencials) i calendari de destinació actual. */
export async function calendarsList(_input: unknown, ctx: SchedulingContext) {
  const store = admin(ctx);
  const me = unwrapData(await ctx.calcom.get("/v2/me", {}, API_VERSIONS.me)) as {
    id: number;
    username?: string;
    email?: string;
  };
  const credentials = await store.listCalendarCredentials(me.id);
  const destination = await store.getDestinationCalendar(me.id);
  return {
    user: { id: me.id, username: me.username ?? "", email: me.email ?? "" },
    calendarCredentials: credentials.map((c) => ({
      id: c.id,
      type: c.type,
      appId: c.appId,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    })),
    destinationCalendar: destination ?? null,
  };
}

/** Fixa el calendari de destinació (totes les reserves s'hi escriuen) via API v2. */
export async function destinationCalendarSet(
  input: z.infer<typeof destinationCalendarSetInput>,
  ctx: SchedulingContext
) {
  const res = await ctx.calcom.put(
    "/v2/destination-calendars",
    { integration: input.integration, externalId: input.externalId },
    undefined
  );
  return { destination: unwrapData(res) };
}

/** Desa les credencials OAuth de l'app a la BD de Cal.diy i l'activa (pas d'admin). */
export async function appsSetCredentials(
  input: z.infer<typeof appsSetCredentialsInput>,
  ctx: SchedulingContext
) {
  const store = admin(ctx);
  const raw = input.credentialsJson ?? ctx.config.googleCredentialsJson;
  if (!raw) {
    throw new Error(
      "Falten les credencials: passa credentialsJson o defineix GAUDI_CALENDAR_GOOGLE_CREDENTIALS_JSON (client_id/client_secret de Google Cloud)."
    );
  }
  let parsed: { client_id?: string; client_secret?: string; clientId?: string; clientSecret?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("credentialsJson no és JSON vàlid");
  }
  const client_id = parsed.client_id ?? parsed.clientId;
  const client_secret = parsed.client_secret ?? parsed.clientSecret;
  if (!client_id || !client_secret) {
    throw new Error("Credentials incompletes: cal client_id i client_secret");
  }
  const redirectUri = googleCallbackUrl(ctx);
  const slug = input.slug ?? GOOGLE_APP_SLUG;
  const keys = { client_id, client_secret, redirect_uris: [redirectUri] };
  await store.setAppKeys(slug, keys, true);
  return { slug, enabled: true, configured: true, redirectUri };
}
