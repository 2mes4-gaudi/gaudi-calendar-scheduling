import type { z } from "zod";
import type { CalendarAdminStore, PlatformUsersReader } from "../../ports/admin.js";
import type { SchedulingContext } from "../../ports/context.js";
import type {
  adminBootstrapInput,
  adminDeploymentInput,
  appsEnableInput,
  apiKeysCreateInput,
  apiKeysListInput,
  apiKeysRevokeInput,
} from "../model/calendar.js";

/** Deriva un username Cal.diy vàlid d'un email (lowercase, [a-z0-9-]). */
export function deriveUsername(email: string): string {
  const local = email.split("@")[0] ?? email;
  const clean = local
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "user";
}

export const USERNAME_RE = /^[a-z0-9-]{2,}$/;

interface AdminModule {
  calcomDb: CalendarAdminStore;
  platformUsers: PlatformUsersReader;
}

function adminOf(ctx: SchedulingContext): AdminModule {
  if (!ctx.admin) {
    throw new Error(
      "Mòdul d'administració no configurat: cal GAUDI_CALENDAR_DB_URL (BD de Cal.diy) i POSTGRES_URL (usuaris de plataforma)."
    );
  }
  return ctx.admin;
}

async function findUserByEmailOrThrow(calcomDb: CalendarAdminStore, email: string) {
  const user = await calcomDb.findUserByEmail(email);
  if (!user) throw new Error(`No hi ha cap usuari a Cal.diy amb email ${email}. Executa abans: scheduling admin-bootstrap ${email}`);
  return user;
}

/** Llicència self-host documentada per Cal.diy (apps/api/v2/README.md). */
export const SELFHOST_LICENSE_KEY = "00000000-0000-0000-0000-000000000000";

/**
 * Assegura la fila `Deployment` amb la llicència self-host de Cal.diy.
 * Sense aquesta fila (i la env CALCOM_LICENSE_KEY a l'API), l'API v2 rebutja
 * les API keys amb "Invalid or missing CALCOM_LICENSE_KEY" — el «paywall» que
 * la UI presenta com a funció comercial. És el procediment oficial self-host.
 */
export async function adminDeployment(input: z.infer<typeof adminDeploymentInput>, ctx: SchedulingContext) {
  const { calcomDb } = adminOf(ctx);
  const licenseKey = input.licenseKey ?? SELFHOST_LICENSE_KEY;
  const res = await calcomDb.ensureDeploymentLicense(licenseKey);
  return { id: res.id, licenseKey: res.licenseKey, selfHost: res.licenseKey === SELFHOST_LICENSE_KEY };
}

/**
 * Provisiona usuaris de la plataforma a Cal.diy (idempotent):
 * usuari + horari per defecte (Mon-Fri 9-17) + API key (només si no en té cap).
 * Sense `email` → tots els usuaris registrats a la plataforma.
 */
export async function adminBootstrap(input: z.infer<typeof adminBootstrapInput>, ctx: SchedulingContext) {
  const { calcomDb, platformUsers } = adminOf(ctx);
  const defaultTz = ctx.config.defaultTimeZone ?? "Europe/Madrid";

  const targets: Array<{ email: string; name?: string; role?: string; timezone?: string }> = input.email
    ? [{ email: input.email, name: input.name, timezone: input.timeZone }]
    : (await platformUsers.listUsers()).map((u) => ({
        email: u.email,
        name: u.name,
        role: u.role,
        timezone: u.timezone,
      }));

  if (targets.length === 0) {
    throw new Error("Cap usuari registrat a la plataforma (kernel_user_profiles buit).");
  }

  const results: Array<{
    email: string;
    username: string;
    created: boolean;
    scheduleId?: number;
    apiKey?: string;
    apiKeyId?: string;
  }> = [];

  for (const t of targets) {
    const timeZone = t.timezone ?? defaultTz;
    const existing = await calcomDb.findUserByEmail(t.email);
    if (existing) {
      const scheduleId = await calcomDb.ensureDefaultSchedule(existing.id, timeZone);
      const keys = await calcomDb.listApiKeys(existing.id);
      let apiKey: string | undefined;
      let apiKeyId: string | undefined;
      if (keys.length === 0) {
        const k = await calcomDb.createApiKey(existing.id, "gaudi calendar.scheduling (bootstrap)");
        apiKey = k.apiKey;
        apiKeyId = k.id;
      }
      results.push({
        email: existing.email,
        username: existing.username ?? "",
        created: false,
        scheduleId,
        apiKey,
        apiKeyId,
      });
      continue;
    }

    // Username: explícit (només amb email únic) o derivat de l'email, amb desempat.
    let username = (input.email ? input.username : undefined) ?? deriveUsername(t.email);
    if (!USERNAME_RE.test(username)) {
      throw new Error(`Username invàlid '${username}' (cal [a-z0-9-], mínim 2 caràcters).`);
    }
    if (await calcomDb.isUsernameTaken(username)) {
      const owner = await calcomDb.findUserByUsername(username);
      if (owner && owner.email.toLowerCase() !== t.email.toLowerCase()) {
        if (input.email && input.username) {
          throw new Error(`El username '${username}' ja existeix (${owner.email}). Tria'n un altre.`);
        }
        let candidate = username;
        for (let i = 2; i <= 20; i++) {
          candidate = `${username}-${i}`;
          if (!(await calcomDb.isUsernameTaken(candidate))) break;
        }
        username = candidate;
      }
    }

    const user = await calcomDb.createUser({
      username,
      email: t.email,
      name: t.name ?? input.name,
      timeZone,
      role: t.role === "owner" ? "ADMIN" : "USER",
    });
    const scheduleId = await calcomDb.ensureDefaultSchedule(user.id, timeZone);
    const k = await calcomDb.createApiKey(user.id, "gaudi calendar.scheduling (bootstrap)");
    results.push({ email: user.email, username: user.username ?? username, created: true, scheduleId, apiKey: k.apiKey, apiKeyId: k.id });
  }

  return { users: results };
}

/** Activa/desactiva una app de Cal.diy (p. ex. google-meet per a sales de videotrucada). */
export async function appsEnable(input: z.infer<typeof appsEnableInput>, ctx: SchedulingContext) {
  const { calcomDb } = adminOf(ctx);
  const enabled = input.enabled ?? true;
  const res = await calcomDb.setAppEnabled(input.slug, enabled);
  return { slug: res.slug, enabled: res.enabled };
}

export async function apiKeysList(input: z.infer<typeof apiKeysListInput>, ctx: SchedulingContext) {
  const { calcomDb } = adminOf(ctx);
  const user = await findUserByEmailOrThrow(calcomDb, input.email);
  const keys = await calcomDb.listApiKeys(user.id);
  return {
    user: { id: user.id, username: user.username ?? "", email: user.email },
    keys: keys.map((k) => ({
      id: k.id,
      note: k.note,
      createdAt: k.createdAt?.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString(),
      expiresAt: k.expiresAt?.toISOString(),
    })),
  };
}

export async function apiKeysCreate(input: z.infer<typeof apiKeysCreateInput>, ctx: SchedulingContext) {
  const { calcomDb } = adminOf(ctx);
  const user = await findUserByEmailOrThrow(calcomDb, input.email);
  const note = input.note ?? `gaudi cli (${ctx.clock().toISOString().slice(0, 10)})`;
  const { apiKey, id } = await calcomDb.createApiKey(user.id, note);
  return {
    user: { id: user.id, username: user.username ?? "", email: user.email },
    id,
    note,
    apiKey,
  };
}

export async function apiKeysRevoke(input: z.infer<typeof apiKeysRevokeInput>, ctx: SchedulingContext) {
  const { calcomDb } = adminOf(ctx);
  const revoked = await calcomDb.revokeApiKey(input.id);
  if (!revoked) throw new Error(`No existeix cap API key amb id ${input.id}`);
  return { revoked: true, id: input.id };
}
