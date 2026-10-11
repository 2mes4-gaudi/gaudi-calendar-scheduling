import type { z } from "zod";
import { unwrapData } from "../../ports/calcom.js";
import type { SchedulingContext } from "../../ports/context.js";
import type {
  schedulesCreateInput,
  schedulesDeleteInput,
  schedulesGetInput,
  schedulesUpdateInput,
} from "../model/calendar.js";
import { API_VERSIONS, compact } from "./versions.js";

export async function listSchedules(_input: unknown, ctx: SchedulingContext) {
  const res = await ctx.calcom.get("/v2/schedules", {}, API_VERSIONS.schedules);
  return { schedules: unwrapData(res) };
}

export async function getSchedule(input: z.infer<typeof schedulesGetInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.get(`/v2/schedules/${input.scheduleId}`, {}, API_VERSIONS.schedules);
  return { schedule: unwrapData(res) };
}

export async function getDefaultSchedule(_input: unknown, ctx: SchedulingContext) {
  const res = await ctx.calcom.get("/v2/schedules/default", {}, API_VERSIONS.schedules);
  return { schedule: unwrapData(res) };
}

export async function createSchedule(input: z.infer<typeof schedulesCreateInput>, ctx: SchedulingContext) {
  const res = await ctx.calcom.post("/v2/schedules", compact(input), API_VERSIONS.schedules);
  return { schedule: unwrapData(res) };
}

export async function updateSchedule(input: z.infer<typeof schedulesUpdateInput>, ctx: SchedulingContext) {
  const { scheduleId, ...patch } = input;
  const res = await ctx.calcom.patch(`/v2/schedules/${scheduleId}`, compact(patch), API_VERSIONS.schedules);
  return { schedule: unwrapData(res) };
}

export async function deleteSchedule(input: z.infer<typeof schedulesDeleteInput>, ctx: SchedulingContext) {
  await ctx.calcom.del(`/v2/schedules/${input.scheduleId}`, API_VERSIONS.schedules);
  return { deleted: true as const, scheduleId: input.scheduleId };
}
