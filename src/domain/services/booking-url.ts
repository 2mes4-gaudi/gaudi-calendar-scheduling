import type { z } from "zod";
import type { bookingUrlInput } from "../model/calendar.js";

export type BookingUrlInput = z.infer<typeof bookingUrlInput>;

export interface BookingUrlResult {
  url: string;
  path: string;
  eventSlug: string;
  username?: string;
  teamSlug?: string;
  organizationSlug?: string;
  params: Record<string, string>;
}

/**
 * Construeix l'enllaç públic de reserva de Cal.diy amb TOTES les opcions
 * (deep-link): mes/dia/slot, timezone, durada, prefill d'assistent
 * (nom/email/convidats/notes), layout, embed, tema i metadata.
 *
 * Pura: no fa I/O. Font de veritat de la semàntica de links del feature.
 */
export function buildBookingUrl(
  input: BookingUrlInput,
  defaults: { publicUrl: string; defaultUsername?: string; defaultTimeZone?: string }
): BookingUrlResult {
  const organizationSlug = input.organizationSlug;
  const teamSlug = input.teamSlug;
  const username = input.username ?? (teamSlug ? undefined : defaults.defaultUsername);

  if (!username && !teamSlug) {
    throw new Error(
      "Cal username (o GAUDI_CALENDAR_DEFAULT_USERNAME) o bé teamSlug per construir l'enllaç de reserva"
    );
  }

  const path = organizationSlug
    ? teamSlug
      ? `/${organizationSlug}/team/${teamSlug}/${input.eventSlug}`
      : `/${organizationSlug}/${username}/${input.eventSlug}`
    : teamSlug
    ? `/team/${teamSlug}/${input.eventSlug}`
    : `/${username}/${input.eventSlug}`;

  const params: Record<string, string> = {};
  if (input.month) params.month = input.month;
  if (input.date) params.date = input.date;
  if (input.slot) params.slot = input.slot;
  const timeZone = input.timeZone ?? defaults.defaultTimeZone;
  if (timeZone) params.timeZone = timeZone;
  if (input.duration !== undefined) params.duration = String(input.duration);
  if (input.name) params.name = input.name;
  if (input.email) params.email = input.email;
  if (input.notes) params.notes = input.notes;
  if (input.layout) params.layout = input.layout;
  if (input.embed) params.embed = input.embed;
  if (input.embedType) params.embedType = input.embedType;
  if (input.theme) params.theme = input.theme;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) search.set(key, value);
  for (const guest of input.guests ?? []) search.append("guests", guest);
  for (const [key, value] of Object.entries(input.metadata ?? {})) search.set(`metadata[${key}]`, value);

  const base = (input.baseUrl ?? defaults.publicUrl).replace(/\/$/, "");
  const query = search.toString();
  const url = `${base}${path}${query ? `?${query}` : ""}`;

  const allParams: Record<string, string> = { ...params };
  if (input.guests?.length) allParams.guests = input.guests.join(",");
  for (const [key, value] of Object.entries(input.metadata ?? {})) allParams[`metadata[${key}]`] = value;

  return { url, path, eventSlug: input.eventSlug, username, teamSlug, organizationSlug, params: allParams };
}
