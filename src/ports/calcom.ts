/** Error de l'API de Cal.diy amb estat HTTP i cos per a diagnòstic. */
export class CalcomError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
    this.name = "CalcomError";
  }
}

export interface CronResult {
  job: string;
  ok: boolean;
  detail?: unknown;
  error?: string;
}

/**
 * Port de l'API de Cal.diy (Cal.com v2).
 * - `get/post/patch/del`: API v2 (/v2/*) amb `Authorization: Bearer <api-key>` i
 *   header `cal-api-version` (per endpoints amb versió).
 * - `cron`: jobs interns del producte (/api/cron/<job>) amb el CRON_API_KEY.
 */
export interface CalcomApi {
  get(path: string, query?: Record<string, unknown>, version?: string): Promise<unknown>;
  post(path: string, body?: unknown, version?: string): Promise<unknown>;
  patch(path: string, body?: unknown, version?: string): Promise<unknown>;
  del(path: string, version?: string): Promise<unknown>;
  /** Crida un job intern del web app (bookingReminder, webhookTriggers...). */
  cron(job: string): Promise<CronResult>;
}

/** Extreu `data` d'una resposta {status, data} de Cal.com (fallback: resposta crua). */
export function unwrapData(res: unknown): unknown {
  if (res && typeof res === "object" && "data" in (res as Record<string, unknown>)) {
    return (res as Record<string, unknown>).data;
  }
  return res;
}
