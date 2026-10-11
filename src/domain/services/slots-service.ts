import type { z } from "zod";
import { unwrapData } from "../../ports/calcom.js";
import type { SchedulingContext } from "../../ports/context.js";
import type { slotsListInput } from "../model/calendar.js";
import { API_VERSIONS, compact } from "./versions.js";

/** Disponibilitat (slots) d'un event type en un rang, creuant calendaris connectats. */
export async function listSlots(input: z.infer<typeof slotsListInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get(
    "/v2/slots",
    compact({
      eventTypeId: input.eventTypeId,
      start: input.start,
      end: input.end,
      timeZone: input.timeZone ?? ctx.config.defaultTimeZone,
      format: input.format,
      duration: input.duration,
      username: input.username,
    }),
    API_VERSIONS.slots
  );
  return {
    eventTypeId: input.eventTypeId,
    start: input.start,
    end: input.end,
    timeZone: input.timeZone ?? ctx.config.defaultTimeZone,
    slots: unwrapData(res),
  };
}
