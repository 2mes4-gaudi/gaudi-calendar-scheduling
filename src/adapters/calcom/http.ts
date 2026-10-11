import { CalcomError, type CalcomApi, type CronResult } from "../../ports/calcom.js";

export interface CalcomClientOptions {
  /** Base de l'API v2: s'hi concatena `/v2/<ruta>` (intern: http://calcom-api:8080; públic: https://host/api). */
  apiBase: string;
  /** Base web per als jobs interns (/api/cron/*). */
  webBase: string;
  apiKey?: string;
  cronKey?: string;
  /** Header cal-api-version per defecte si l'acció no n'especifica cap. */
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

function buildQuery(query?: Record<string, unknown>): string {
  if (!query) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, String(v));
    } else {
      search.set(key, String(value));
    }
  }
  const q = search.toString();
  return q ? `?${q}` : "";
}

function isCalcomError(status: number, body: unknown): boolean {
  return status >= 400;
}

/** Client HTTP de l'API de Cal.diy (v2 + cron intern). */
export function createCalcomClient(opts: CalcomClientOptions): CalcomApi {
  const apiBase = opts.apiBase.replace(/\/$/, "");
  const webBase = opts.webBase.replace(/\/$/, "");
  const doFetch = opts.fetchImpl ?? fetch;

  async function request(
    method: string,
    path: string,
    { query, body, version }: { query?: Record<string, unknown>; body?: unknown; version?: string }
  ): Promise<unknown> {
    const url = `${apiBase}${path}${buildQuery(query)}`;
    const headers: Record<string, string> = {};
    if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
    const apiVersion = version ?? opts.apiVersion;
    if (apiVersion) headers["cal-api-version"] = apiVersion;
    if (body !== undefined) headers["content-type"] = "application/json";

    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new CalcomError(0, undefined, `No s'ha pogut contactar amb Cal.diy (${url}): ${(err as Error).message}`);
    }

    const text = await res.text();
    let parsed: unknown = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (isCalcomError(res.status, parsed)) {
      const msg =
        (parsed as { error?: { message?: string }; message?: string })?.error?.message ??
        (parsed as { message?: string })?.message ??
        `HTTP ${res.status}`;
      throw new CalcomError(res.status, parsed, `Cal.diy ${method} ${path}: ${msg}`);
    }
    return parsed;
  }

  return {
    get: (path, query, version) => request("GET", path, { query, version }),
    post: (path, body, version) => request("POST", path, { body, version }),
    patch: (path, body, version) => request("PATCH", path, { body, version }),
    del: (path, version) => request("DELETE", path, { version }),
    async cron(job: string): Promise<CronResult> {
      const url = `${webBase}/api/cron/${job}`;
      try {
        const res = await doFetch(url, {
          method: "POST",
          headers: opts.cronKey ? { authorization: opts.cronKey } : {},
          signal: AbortSignal.timeout(120_000),
        });
        const text = await res.text();
        let parsed: unknown = {};
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
        }
        if (!res.ok) {
          return { job, ok: false, error: `HTTP ${res.status}`, detail: parsed };
        }
        return { job, ok: true, detail: parsed };
      } catch (err) {
        return { job, ok: false, error: (err as Error).message };
      }
    },
  };
}
