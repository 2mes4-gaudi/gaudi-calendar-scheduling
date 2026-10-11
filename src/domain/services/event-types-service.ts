import type { z } from "zod";
import { unwrapData } from "../../ports/calcom.js";
import type { SchedulingContext } from "../../ports/context.js";
import type {
  eventTypesCreateInput,
  eventTypesDeleteInput,
  eventTypesGetInput,
  eventTypesListInput,
  eventTypesUpdateInput,
} from "../model/calendar.js";
import { publishSchedulingEvent } from "./events.js";
import { API_VERSIONS, compact } from "./versions.js";

export async function listEventTypes(input: z.infer<typeof eventTypesListInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get("/v2/event-types", compact({ username: input.username }), API_VERSIONS.eventTypes);
  return { eventTypes: unwrapData(res) };
}

export async function getEventType(input: z.infer<typeof eventTypesGetInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get(`/v2/event-types/${input.eventTypeId}`, {}, API_VERSIONS.eventTypes);
  return { eventType: unwrapData(res) };
}

export async function createEventType(input: z.infer<typeof eventTypesCreateInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.post("/v2/event-types", compact(input), API_VERSIONS.eventTypes);
  const eventType = unwrapData(res);
  await publishSchedulingEvent(ctx, "scheduling.event-type-created", {
    eventTypeId: (eventType as { id?: number })?.id,
    title: input.title,
    slug: input.slug,
  });
  return { eventType };
}

export async function updateEventType(input: z.infer<typeof eventTypesUpdateInput>, ctx: SchedulingContext) {
  const { eventTypeId, ...patch } = input;
  const res = await ctx.calcom.patch(`/v2/event-types/${eventTypeId}`, compact(patch), API_VERSIONS.eventTypes);
  return { eventType: unwrapData(res) };
}

export async function deleteEventType(input: z.infer<typeof eventTypesDeleteInput>, ctx: SchedulingContext) {
  await ctx.calcom.del(`/v2/event-types/${input.eventTypeId}`, API_VERSIONS.eventTypes);
  await publishSchedulingEvent(ctx, "scheduling.event-type-deleted", { eventTypeId: input.eventTypeId });
  return { deleted: true, eventTypeId: input.eventTypeId };
}
