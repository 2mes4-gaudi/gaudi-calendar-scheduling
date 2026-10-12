import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  CalendarAdminStore,
  CalendarApiKeyRow,
  CalendarUserRow,
  PlatformUser,
  PlatformUsersReader,
} from "../../ports/admin.js";

/** sha256(hex) — idèntic a l'esquema de Cal.diy (apps/api/v2 lib/api-key). */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Genera { key presentada `cal_...`, hashedKey } com fa el producte. */
export function generateApiKey(prefix = "cal_"): { apiKey: string; hashedKey: string } {
  const plain = randomBytes(16).toString("hex");
  return { apiKey: `${prefix}${plain}`, hashedKey: sha256Hex(plain) };
}

interface PgPoolLike {
  query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

async function createPool(connectionString: string): Promise<PgPoolLike> {
  const { Pool } = await import("pg");
  return new Pool({ connectionString }) as unknown as PgPoolLike;
}

export async function createCalendarAdminStore(connectionString: string): Promise<CalendarAdminStore> {
  const pool = await createPool(connectionString);

  const toUser = (r: { id: number; username: string | null; email: string; defaultScheduleId: number | null }): CalendarUserRow => ({
    id: r.id,
    username: r.username,
    email: r.email,
    defaultScheduleId: r.defaultScheduleId,
  });

  return {
    async ensureDeploymentLicense(licenseKey) {
      const { rows } = await pool.query<{ id: number; licenseKey: string | null }>(
        `INSERT INTO "Deployment" (id, "licenseKey", "agreedLicenseAt")
         VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE
           SET "licenseKey" = EXCLUDED."licenseKey",
               "agreedLicenseAt" = COALESCE("Deployment"."agreedLicenseAt", EXCLUDED."agreedLicenseAt")
         RETURNING id, "licenseKey"`,
        [licenseKey]
      );
      return { id: rows[0].id, licenseKey: rows[0].licenseKey ?? licenseKey };
    },

    async getApp(slug) {
      const { rows } = await pool.query<{ slug: string; enabled: boolean | null; keys: Record<string, unknown> | null }>(
        `SELECT slug, enabled, keys FROM "App" WHERE slug = $1 LIMIT 1`,
        [slug]
      );
      if (!rows[0]) return undefined;
      return { slug: rows[0].slug, enabled: Boolean(rows[0].enabled), keys: rows[0].keys ?? null };
    },

    async setAppKeys(slug, keys, enabled = true) {
      const { rows } = await pool.query<{ slug: string; enabled: boolean | null }>(
        `INSERT INTO "App" (slug, "dirName", categories, keys, enabled)
         VALUES ($1, $1, ARRAY[]::text[], $2::jsonb, $3)
         ON CONFLICT (slug) DO UPDATE SET keys = EXCLUDED.keys, enabled = EXCLUDED.enabled
         RETURNING slug, enabled`,
        [slug, JSON.stringify(keys), enabled]
      );
      return { slug: rows[0].slug, enabled: Boolean(rows[0].enabled) };
    },

    async setAppEnabled(slug, enabled) {
      const { rows } = await pool.query<{ slug: string; enabled: boolean | null }>(
        `UPDATE "App" SET enabled = $2 WHERE slug = $1 RETURNING slug, enabled`,
        [slug, enabled]
      );
      if (!rows[0]) throw new Error(`No existeix cap app amb slug '${slug}' a la BD de Cal.diy`);
      return { slug: rows[0].slug, enabled: Boolean(rows[0].enabled) };
    },

    async listCalendarCredentials(userId) {
      const { rows } = await pool.query<{ id: number; type: string; appId: string | null; createdAt: Date | null }>(
        `SELECT id, type, "appId", "createdAt" FROM "Credential"
         WHERE "userId" = $1 AND (type LIKE '%calendar%' OR "appId" = 'google-calendar' OR "appId" = 'office365')
         ORDER BY id DESC`,
        [userId]
      );
      return rows;
    },

    async getDestinationCalendar(userId) {
      const { rows } = await pool.query<{
        id: number;
        integration: string;
        externalId: string;
        userId: number | null;
        eventTypeId: number | null;
        credentialId: number | null;
      }>(
        `SELECT id, integration, "externalId", "userId", "eventTypeId", "credentialId"
         FROM "DestinationCalendar" WHERE "userId" = $1 ORDER BY id LIMIT 1`,
        [userId]
      );
      return rows[0];
    },

    async findUserByEmail(email) {
      const { rows } = await pool.query<{ id: number; username: string | null; email: string; defaultScheduleId: number | null }>(
        `SELECT id, username, email, "defaultScheduleId" FROM users WHERE lower(email) = lower($1) LIMIT 1`,
        [email]
      );
      return rows[0] ? toUser(rows[0]) : undefined;
    },

    async findUserByUsername(username) {
      const { rows } = await pool.query<{ id: number; username: string | null; email: string; defaultScheduleId: number | null }>(
        `SELECT id, username, email, "defaultScheduleId" FROM users WHERE lower(username) = lower($1) LIMIT 1`,
        [username]
      );
      return rows[0] ? toUser(rows[0]) : undefined;
    },

    async isUsernameTaken(username) {
      const { rows } = await pool.query<{ id: number }>(`SELECT id FROM users WHERE lower(username) = lower($1) LIMIT 1`, [username]);
      return rows.length > 0;
    },

    async createUser({ username, email, name, timeZone, role }) {
      const { rows } = await pool.query<{ id: number; username: string; email: string; defaultScheduleId: number | null }>(
        `INSERT INTO users (uuid, username, name, email, "emailVerified", "completedOnboarding", "timeZone", locale, role)
         VALUES (gen_random_uuid(), $1, $2, $3, now(), true, $4, 'en', $5)
         RETURNING id, username, email, "defaultScheduleId"`,
        [username, name ?? username, email, timeZone, role]
      );
      return toUser(rows[0]);
    },

    async ensureDefaultSchedule(userId, timeZone) {
      const { rows: existing } = await pool.query<{ id: number }>(
        `SELECT id FROM "Schedule" WHERE "userId" = $1 ORDER BY id LIMIT 1`,
        [userId]
      );
      let scheduleId = existing[0]?.id;
      if (!scheduleId) {
        const { rows } = await pool.query<{ id: number }>(
          `INSERT INTO "Schedule" ("userId", name, "timeZone") VALUES ($1, 'Working Hours', $2) RETURNING id`,
          [userId, timeZone]
        );
        scheduleId = rows[0].id;
        await pool.query(
          `INSERT INTO "Availability" ("userId", "scheduleId", days, "startTime", "endTime")
           VALUES ($1, $2, ARRAY[1,2,3,4,5], '09:00'::time, '17:00'::time)`,
          [userId, scheduleId]
        );
      }
      await pool.query(`UPDATE users SET "defaultScheduleId" = $2 WHERE id = $1 AND "defaultScheduleId" IS NULL`, [
        userId,
        scheduleId,
      ]);
      return scheduleId;
    },

    async listApiKeys(userId) {
      const { rows } = await pool.query<CalendarApiKeyRow>(
        `SELECT id, note, "createdAt", "lastUsedAt", "expiresAt" FROM "ApiKey" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
        [userId]
      );
      return rows;
    },

    async createApiKey(userId, note) {
      const { apiKey, hashedKey } = generateApiKey();
      const id = randomUUID();
      await pool.query(`INSERT INTO "ApiKey" (id, "userId", note, "hashedKey") VALUES ($1, $2, $3, $4)`, [
        id,
        userId,
        note,
        hashedKey,
      ]);
      return { apiKey, id };
    },

    async revokeApiKey(id) {
      const { rows } = await pool.query<{ id: string }>(`DELETE FROM "ApiKey" WHERE id = $1 RETURNING id`, [id]);
      return rows.length > 0;
    },

    async close() {
      await pool.end();
    },
  };
}

/** Lector d'usuaris de la plataforma (POSTGRES_URL). Fallback a portal_auth_users. */
export async function createPlatformUsersReader(connectionString: string): Promise<PlatformUsersReader> {
  const pool = await createPool(connectionString);

  return {
    async listUsers(): Promise<PlatformUser[]> {
      try {
        const { rows } = await pool.query<{ email: string; name: string | null; role: string | null; timezone: string | null; language: string | null }>(
          `SELECT email, name, role, timezone, language FROM kernel_user_profiles WHERE email IS NOT NULL ORDER BY id`
        );
        return rows.map((r) => ({
          email: r.email,
          name: r.name ?? undefined,
          role: r.role ?? undefined,
          timezone: r.timezone ?? undefined,
          language: r.language ?? undefined,
        }));
      } catch {
        const { rows } = await pool.query<{ email: string; name: string | null }>(
          `SELECT email, name FROM portal_auth_users WHERE email IS NOT NULL ORDER BY uid`
        );
        return rows.map((r) => ({ email: r.email, name: r.name ?? undefined }));
      }
    },
    async close() {
      await pool.end();
    },
  };
}
