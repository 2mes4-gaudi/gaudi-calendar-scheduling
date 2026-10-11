/** Versions de l'API v2 (header `cal-api-version`) per família d'endpoints. */
export const API_VERSIONS = {
  me: "2024-08-13",
  eventTypes: "2024-06-14",
  slots: "2024-09-04",
  bookings: "2024-08-13",
  schedules: "2024-06-11",
} as const;

/** Elimina claus undefined d'un objecte (per a bodies/query). */
export function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
