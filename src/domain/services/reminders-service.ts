import type { z } from "zod";
import { unwrapData } from "../../ports/calcom.js";
import type { SchedulingContext } from "../../ports/context.js";
import type {
  remindersAddInput,
  remindersDispatchInput,
  remindersListInput,
  remindersRemoveInput,
  settingsGetInput,
  settingsSetInput,
  ReminderModel,
} from "../model/calendar.js";
import { API_VERSIONS } from "./versions.js";

/**
 * Recordatoris de reserves: el feature desa la regla i un daemon (calcom-reminders,
 * cada minut) publica un esdeveniment al NATS de l'agent (`scheduling.reminder-due`)
 * quan toca; el motor de proactivitat del kernel desperta l'agent i lliura el
 * missatge al device configurat. Pot haver-hi un recordatori global per defecte
 * (default-reminder-minutes) a més dels recordatoris explícits per reserva.
 */

export const SETTINGS_KEY_DEVICE = "reminder-device";
export const SETTINGS_KEY_DEFAULT_MINUTES = "default-reminder-minutes";
export const DEVICE_NONE = "none";
export const REMINDERS_COLLECTION = "scheduling_reminders";
export const SETTINGS_COLLECTION = "scheduling_settings";

const MAX_MINUTES = 10080; // 7 dies

export async function getSetting(ctx: SchedulingContext, key: string): Promise<string | undefined> {
  const row = await ctx.db.get<{ value: string }>(SETTINGS_COLLECTION, key);
  return row?.value;
}

export async function listSettings(ctx: SchedulingContext): Promise<Record<string, string>> {
  const rows = await ctx.db.listValues<{ key: string; value: string }>(SETTINGS_COLLECTION);
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = (r as { key?: string; value?: string }).key;
    if (k) out[k] = (r as { value?: string }).value ?? "";
  }
  return out;
}

export async function getDevice(ctx: SchedulingContext): Promise<string> {
  return (await getSetting(ctx, SETTINGS_KEY_DEVICE)) ?? DEVICE_NONE;
}

export async function getDefaultMinutes(ctx: SchedulingContext): Promise<number> {
  const raw = await getSetting(ctx, SETTINGS_KEY_DEFAULT_MINUTES);
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function validateSetting(key: string, value: string): string {
  if (key === SETTINGS_KEY_DEVICE) {
    const v = value.trim();
    if (!v) throw new Error("reminder-device no pot ser buit (usa 'none' per desactivar)");
    return v;
  }
  if (key === SETTINGS_KEY_DEFAULT_MINUTES) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > MAX_MINUTES) {
      throw new Error(`default-reminder-minutes ha de ser un enter 0..${MAX_MINUTES}`);
    }
    return String(n);
  }
  throw new Error(`Setting desconegut '${key}'. Claus vàlides: ${SETTINGS_KEY_DEVICE}, ${SETTINGS_KEY_DEFAULT_MINUTES}`);
}

export async function settingsGet(input: z.infer<typeof settingsGetInput>, ctx: SchedulingContext) {
  if (input.key) {
    return { settings: { [input.key]: (await getSetting(ctx, input.key)) ?? "" } };
  }
  const settings = await listSettings(ctx);
  // Defaults efectius: device none i 0 minuts.
  if (settings[SETTINGS_KEY_DEVICE] === undefined) settings[SETTINGS_KEY_DEVICE] = DEVICE_NONE;
  if (settings[SETTINGS_KEY_DEFAULT_MINUTES] === undefined) settings[SETTINGS_KEY_DEFAULT_MINUTES] = "0";
  return { settings };
}

export async function settingsSet(input: z.infer<typeof settingsSetInput>, ctx: SchedulingContext) {
  const value = validateSetting(input.key, input.value);
  await ctx.db.set(SETTINGS_COLLECTION, input.key, { key: input.key, value, updatedAt: ctx.clock().toISOString() });
  return { key: input.key, value };
}

export async function remindersAdd(input: z.infer<typeof remindersAddInput>, ctx: SchedulingContext) {
  const booking = unwrapData(
    await ctx.calcom.get(`/v2/bookings/${input.bookingUid}`, {}, API_VERSIONS.bookings)
  ) as { uid?: string; title?: string; start?: string } | null;
  if (!booking?.uid) throw new Error(`No s'ha trobat la reserva ${input.bookingUid}`);
  const start = booking.start ?? "";
  if (!start || Number.isNaN(Date.parse(start))) {
    throw new Error(`La reserva ${input.bookingUid} no té un inici vàlid (${start})`);
  }

  const reminder: ReminderModel = {
    id: `${input.bookingUid}:${input.minutesBefore}`,
    bookingUid: input.bookingUid,
    title: booking.title,
    start,
    minutesBefore: input.minutesBefore,
    message: input.message,
    device: input.device,
    status: "pending",
    createdAt: ctx.clock().toISOString(),
  };
  await ctx.db.set(REMINDERS_COLLECTION, reminder.id, reminder);
  return { reminder };
}

export async function remindersList(input: z.infer<typeof remindersListInput>, ctx: SchedulingContext) {
  const all = await ctx.db.listValues<ReminderModel>(REMINDERS_COLLECTION);
  const filtered = input.bookingUid ? all.filter((r) => r.bookingUid === input.bookingUid) : all;
  filtered.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return {
    reminders: filtered,
    settings: { device: await getDevice(ctx), defaultMinutes: await getDefaultMinutes(ctx) },
  };
}

export async function remindersRemove(input: z.infer<typeof remindersRemoveInput>, ctx: SchedulingContext) {
  const existing = await ctx.db.get<ReminderModel>(REMINDERS_COLLECTION, input.id);
  if (!existing) throw new Error(`No existeix cap recordatori amb id ${input.id}`);
  await ctx.db.delete(REMINDERS_COLLECTION, input.id);
  return { removed: true, id: input.id };
}

interface DispatchCandidate {
  id: string;
  bookingUid: string;
  title?: string;
  start: string;
  minutesBefore: number;
  message?: string;
  device?: string;
  explicit: boolean;
}

/**
 * Executa el dispatch de recordatoris (daemon calcom-reminders, cada minut):
 * 1. Recordatoris explícits pendents + recordatoris globals per a les properes reserves.
 * 2. Si toca (ara >= inici - minuts) i l'inici és futur → publica `scheduling.reminder-due`
 *    al bus de l'agent (el kernel desperta l'agent i lliura al device configurat).
 * 3. Device 'none' → es marca saltat (cal configurar-lo: `settings-set reminder-device <id>`).
 */
export async function remindersDispatch(input: z.infer<typeof remindersDispatchInput>, ctx: SchedulingContext) {
  const now = input.now ? Date.parse(input.now) : ctx.clock().getTime();
  const device = await getDevice(ctx);
  const defaultMinutes = await getDefaultMinutes(ctx);
  const results = { dispatched: [] as Array<{ id: string; bookingUid: string; title?: string; start: string; minutesBefore: number }>, skipped: [] as Array<{ id: string; reason: string }>, expired: 0 };
  const known = await ctx.db.listValues<ReminderModel>(REMINDERS_COLLECTION);
  const byId = new Map(known.map((r) => [r.id, r]));
  const candidates: DispatchCandidate[] = [];

  // Explícits pendents
  for (const r of known) {
    if (r.status !== "pending") continue;
    candidates.push({
      id: r.id,
      bookingUid: r.bookingUid,
      title: r.title,
      start: r.start,
      minutesBefore: r.minutesBefore,
      message: r.message,
      device: r.device,
      explicit: true,
    });
  }

  // Global per defecte: properes reserves (24h) sense recordatori explícit
  if (defaultMinutes > 0) {
    try {
      const res = (await ctx.calcom.get("/v2/bookings", { status: "upcoming" }, API_VERSIONS.bookings)) as {
        data?: unknown;
      };
      const list = (unwrapData(res) as Array<{ uid?: string; title?: string; start?: string }> | null) ?? [];
      for (const b of Array.isArray(list) ? list : []) {
        if (!b.uid || !b.start) continue;
        const startMs = Date.parse(b.start);
        if (Number.isNaN(startMs) || startMs - now > 24 * 3600 * 1000) continue;
        const id = `auto:${b.uid}`;
        if (byId.has(id)) continue; // ja gestionat (dispatched/skipped)
        // Si hi ha un recordatori explícit per aquesta reserva, mana l'explícit.
        if ([...byId.keys()].some((k) => k.startsWith(`${b.uid}:`) )) continue;
        candidates.push({
          id,
          bookingUid: b.uid,
          title: b.title,
          start: b.start,
          minutesBefore: defaultMinutes,
          explicit: false,
        });
      }
    } catch {
      // Sense reserves consultables → només explícits
    }
  }

  let expired = 0;
  for (const c of candidates) {
    const startMs = Date.parse(c.start);
    if (Number.isNaN(startMs)) continue;
    const dueMs = startMs - c.minutesBefore * 60_000;
    const targetDevice = (c.device ?? device).trim() || DEVICE_NONE;

    if (startMs <= now) {
      // Ja ha començat/passat sense dispatch → expirem (només explícits; els auto no es guarden)
      if (c.explicit) {
        const r = byId.get(c.id)!;
        r.status = "expired";
        await ctx.db.set(REMINDERS_COLLECTION, r.id, r);
      }
      expired++;
      continue;
    }

    if (now < dueMs) continue; // encara no toca

    if (targetDevice === DEVICE_NONE) {
      results.skipped.push({ id: c.id, reason: "device 'none' (configura'l amb settings-set reminder-device <device>)" });
      if (c.explicit) {
        const r = byId.get(c.id)!;
        r.status = "skipped";
        r.skipReason = "device none";
        await ctx.db.set(REMINDERS_COLLECTION, r.id, r);
      }
      continue;
    }

    try {
      await ctx.messageBus.publish({
        type: "scheduling.reminder-due",
        correlationId: c.id,
        payload: {
          bookingUid: c.bookingUid,
          title: c.title,
          start: c.start,
          minutesBefore: c.minutesBefore,
          message: c.message,
          deviceId: targetDevice,
          agentId: "ona",
        },
      });
      results.dispatched.push({ id: c.id, bookingUid: c.bookingUid, title: c.title, start: c.start, minutesBefore: c.minutesBefore });
    } catch (err) {
      results.skipped.push({ id: c.id, reason: `publicació fallida: ${(err as Error).message}` });
      continue;
    }

    if (c.explicit) {
      const r = byId.get(c.id)!;
      r.status = "dispatched";
      r.dispatchedAt = new Date(now).toISOString();
      await ctx.db.set(REMINDERS_COLLECTION, r.id, r);
    } else {
      // Bookkeeping del global: no re-disparar
      const r: ReminderModel = {
        id: c.id,
        bookingUid: c.bookingUid,
        title: c.title,
        start: c.start,
        minutesBefore: c.minutesBefore,
        status: "dispatched",
        createdAt: new Date(now).toISOString(),
        dispatchedAt: new Date(now).toISOString(),
      };
      await ctx.db.set(REMINDERS_COLLECTION, r.id, r);
    }
  }

  results.expired = expired;
  return { ok: true, device, defaultMinutes, ...results };
}
