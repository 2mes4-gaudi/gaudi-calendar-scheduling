import type { CredentialProvider } from "@gaudi/core";
import { createChainedCredentialProvider } from "@gaudi/core";
import { createCalcomClient } from "../adapters/calcom/http.js";
import type { CalendarConfig, SchedulingContext } from "../ports/context.js";
import { API_VERSIONS } from "../domain/services/versions.js";

/** Cadena de credencials del feature: env (secret de plataforma) → res. */
const CREDENTIAL_CHAINS: Record<string, string[]> = {
  "calendar.api-key": ["GAUDI_CALENDAR_API_KEY"],
  "calendar.cron-key": ["GAUDI_CALENDAR_CRON_KEY"],
};

export function createEnvCredentialProvider(): CredentialProvider {
  return createChainedCredentialProvider(CREDENTIAL_CHAINS);
}

export const noopCredentials: CredentialProvider = {
  get: async () => undefined,
  has: async () => false,
};

/**
 * Config del feature des de l'entorn (l'ÚNIC lloc on es llegeix process.env).
 * Conveni de l'API base: s'hi concatena `/v2/<ruta>`.
 *  - intern: http://calcom-api:8080
 *  - públic (via rewrite): https://cal.apps.ona.gaudi.2mes4.com/api
 */
export function loadCalendarConfig(env: NodeJS.ProcessEnv = process.env): CalendarConfig {
  const publicUrl = env.GAUDI_CALENDAR_PUBLIC_URL ?? "http://localhost:3000";
  return {
    apiBase: env.GAUDI_CALENDAR_API_BASE ?? "http://localhost:3000/api",
    webBase: env.GAUDI_CALENDAR_WEB_BASE ?? publicUrl,
    publicUrl,
    defaultUsername: env.GAUDI_CALENDAR_DEFAULT_USERNAME,
    defaultTimeZone: env.GAUDI_CALENDAR_DEFAULT_TIMEZONE,
    apiVersion: env.GAUDI_CALENDAR_API_VERSION ?? API_VERSIONS.bookings,
  };
}

/** Crea el client de Cal.diy resolent les credencials declarades al manifest. */
export async function createClientFromCredentials(
  credentials: CredentialProvider,
  config: CalendarConfig,
  fetchImpl?: typeof fetch
) {
  const apiKey = (await credentials.get("calendar.api-key")) as string | undefined;
  const cronKey = (await credentials.get("calendar.cron-key")) as string | undefined;
  return createCalcomClient({
    apiBase: config.apiBase,
    webBase: config.webBase,
    apiKey,
    cronKey,
    apiVersion: config.apiVersion,
    fetchImpl,
  });
}

export type { SchedulingContext };
