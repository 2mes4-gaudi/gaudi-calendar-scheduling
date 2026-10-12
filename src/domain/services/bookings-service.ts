import type { z } from "zod";
import { unwrapData } from "../../ports/calcom.js";
import type { SchedulingContext } from "../../ports/context.js";
import type {
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
} from "../model/calendar.js";
import { publishSchedulingEvent } from "./events.js";
import { API_VERSIONS, compact } from "./versions.js";

export async function listBookings(input: z.infer<typeof bookingsListInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get("/v2/bookings", compact(input), API_VERSIONS.bookings);
  const pagination = (res as { pagination?: unknown })?.pagination;
  return { bookings: unwrapData(res), pagination };
}

export async function getBooking(input: z.infer<typeof bookingsGetInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get(`/v2/bookings/${input.bookingUid}`, {}, API_VERSIONS.bookings);
  return { booking: unwrapData(res) };
}

export async function getBookingBySeat(input: z.infer<typeof bookingsBySeatInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get(`/v2/bookings/by-seat/${input.seatUid}`, {}, API_VERSIONS.bookings);
  return { booking: unwrapData(res) };
}

export async function createBooking(input: z.infer<typeof bookingsCreateInput>, ctx: SchedulingContext) {
  const body = compact({
    eventTypeId: input.eventTypeId,
    eventTypeSlug: input.eventTypeSlug,
    username: input.username,
    teamSlug: input.teamSlug,
    organizationSlug: input.organizationSlug,
    start: input.start,
    attendee: compact({
      name: input.attendeeName,
      email: input.attendeeEmail,
      timeZone: input.attendeeTimeZone,
      phoneNumber: input.attendeePhoneNumber,
      language: input.attendeeLanguage,
    }),
    guests: input.guests,
    metadata: input.metadata,
    bookingFieldsResponses: input.bookingFieldsResponses,
    location: input.location,
  });
  const res = await ctx.calcom.post("/v2/bookings", body, API_VERSIONS.bookings);
  const booking = unwrapData(res);
  const bookingUid = (booking as { uid?: string })?.uid;
  await publishSchedulingEvent(ctx, "scheduling.booking-created", {
    bookingUid,
    start: input.start,
    attendeeEmail: input.attendeeEmail,
    attendeeName: input.attendeeName,
    eventTypeId: input.eventTypeId,
    eventTypeSlug: input.eventTypeSlug,
  });
  return { booking };
}

export async function cancelBooking(input: z.infer<typeof bookingsCancelInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.post(
    `/v2/bookings/${input.bookingUid}/cancel`,
    // L'API v2 d'aquesta versió EXIGEIX motiu: si no n'hi ha, se n'hi posa un de genèric.
    compact({ cancellationReason: input.reason?.trim() || "Cancelled by organizer (Gaudi CLI)" }),
    API_VERSIONS.bookings
  );
  await publishSchedulingEvent(ctx, "scheduling.booking-cancelled", {
    bookingUid: input.bookingUid,
    reason: input.reason,
  });
  return { booking: unwrapData(res) };
}

export async function rescheduleBooking(input: z.infer<typeof bookingsRescheduleInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.post(
    `/v2/bookings/${input.bookingUid}/reschedule`,
    compact({ start: input.start, reschedulingReason: input.reason }),
    API_VERSIONS.bookings
  );
  await publishSchedulingEvent(ctx, "scheduling.booking-rescheduled", {
    bookingUid: input.bookingUid,
    start: input.start,
    reason: input.reason,
  });
  return { booking: unwrapData(res) };
}

export async function confirmBooking(input: z.infer<typeof bookingsConfirmInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.post(`/v2/bookings/${input.bookingUid}/confirm`, undefined, API_VERSIONS.bookings);
  await publishSchedulingEvent(ctx, "scheduling.booking-confirmed", { bookingUid: input.bookingUid });
  return { booking: unwrapData(res) };
}

export async function declineBooking(input: z.infer<typeof bookingsDeclineInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.post(
    `/v2/bookings/${input.bookingUid}/decline`,
    compact({ reason: input.reason }),
    API_VERSIONS.bookings
  );
  await publishSchedulingEvent(ctx, "scheduling.booking-declined", {
    bookingUid: input.bookingUid,
    reason: input.reason,
  });
  return { booking: unwrapData(res) };
}

export async function markAbsentBooking(input: z.infer<typeof bookingsMarkAbsentInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.post(
    `/v2/bookings/${input.bookingUid}/mark-absent`,
    compact({ attendees: input.attendees, hosts: input.hosts }),
    API_VERSIONS.bookings
  );
  return { booking: unwrapData(res) };
}

export async function getCalendarLinks(input: z.infer<typeof bookingsCalendarLinksInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get(`/v2/bookings/${input.bookingUid}/calendar-links`, {}, API_VERSIONS.bookings);
  return { calendarLinks: unwrapData(res) };
}

export async function getBookingReferences(input: z.infer<typeof bookingsReferencesInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get(
    `/v2/bookings/${input.bookingUid}/references`,
    compact({ type: input.type, provider: input.provider }),
    API_VERSIONS.bookings
  );
  return { references: unwrapData(res) };
}

export async function getBookingRecordings(input: z.infer<typeof bookingsRecordingsInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get(`/v2/bookings/${input.bookingUid}/recordings`, {}, API_VERSIONS.bookings);
  return { recordings: unwrapData(res) };
}

export async function getBookingTranscripts(input: z.infer<typeof bookingsTranscriptsInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get(`/v2/bookings/${input.bookingUid}/transcripts`, {}, API_VERSIONS.bookings);
  return { transcripts: unwrapData(res) };
}

export async function getConferencingSessions(
  input: z.infer<typeof bookingsConferencingSessionsInput>,
  ctx: SchedulingContext
) {
  const res = await ctx.calcom.get(`/v2/bookings/${input.bookingUid}/conferencing-sessions`, {}, API_VERSIONS.bookings);
  return { sessions: unwrapData(res) };
}
