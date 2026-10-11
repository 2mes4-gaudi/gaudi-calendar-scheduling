import type { ServiceContext, MessageBus } from "@gaudi/core";
import type { CalcomApi } from "./calcom.js";

/** Configuració del feature (resolta de l'entorn pel runtime — mai als handlers). */
export interface CalendarConfig {
  /** Base de l'API v2 de Cal.diy (ex: http://calcom-api:8080 o https://.../api/v2). */
  apiBase: string;
  /** Base web de Cal.diy per als jobs interns (ex: http://calcom-web:3000). */
  webBase: string;
  /** URL pública de Cal.diy (ex: https://cal.apps.ona.gaudi.2mes4.com). */
  publicUrl: string;
  /** Username per defecte per als enllaços de reserva. */
  defaultUsername?: string;
  /** Timezone per defecte (IANA). */
  defaultTimeZone?: string;
  /** Valor per defecte de l'header cal-api-version. */
  apiVersion: string;
}

/**
 * Context del feature calendar.scheduling.
 * No hi ha DAO: l'estat viu a Cal.diy; el feature és un adaptador (CLI/skill → API v2).
 */
export interface SchedulingContext extends ServiceContext {
  /** Port de l'API v2 de Cal.diy (HTTP). */
  calcom: CalcomApi;
  /** Config del feature (env). */
  config: CalendarConfig;
  /** Cua única de la plataforma (gaudi.<agent>.notifications). */
  messageBus: MessageBus;
  /** Rellotge injectable (tests). */
  clock: () => Date;
}
