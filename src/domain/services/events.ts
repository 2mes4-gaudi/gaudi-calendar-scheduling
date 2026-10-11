import type { SchedulingContext } from "../../ports/context.js";

export type SchedulingEventType =
  | "scheduling.booking-created"
  | "scheduling.booking-cancelled"
  | "scheduling.booking-rescheduled"
  | "scheduling.booking-confirmed"
  | "scheduling.booking-declined"
  | "scheduling.event-type-created"
  | "scheduling.event-type-deleted";

/**
 * Publica un event de cicle de vida a la cua única (gaudi.<agent>.notifications).
 * Best-effort: si el bus no està disponible, l'acció no es trenca.
 */
export async function publishSchedulingEvent(
  ctx: SchedulingContext,
  type: SchedulingEventType,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await ctx.messageBus.publish({
      type,
      correlationId: String(payload.bookingUid ?? payload.eventTypeId ?? ctx.clock().toISOString()),
      payload,
    });
  } catch {
    // bus opcional (CLI standalone)
  }
}
