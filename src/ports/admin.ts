/** Ports del mòdul d'administració (provisioning d'usuaris i API keys).
 *
 * Motiu: la UI de Cal.diy gateja la creació d'API keys com a "funció comercial";
 * com que l'accés és CLI-first, el feature provisiona usuaris i claus
 * directament a la BD de Cal.diy (mecànica idèntica a la del producte:
 * hashedKey = sha256(key sense prefix), key presentada = `<prefix><key>`).
 */

export interface PlatformUser {
  email: string;
  name?: string;
  role?: string;
  timezone?: string;
  language?: string;
}

/** Lector d'usuaris registrats a la PLATAFORMA (kernel_user_profiles / portal_auth_users). */
export interface PlatformUsersReader {
  listUsers(): Promise<PlatformUser[]>;
  close(): Promise<void>;
}

export interface CalendarUserRow {
  id: number;
  username: string | null;
  email: string;
  defaultScheduleId: number | null;
}

export interface CalendarApiKeyRow {
  id: string;
  note: string | null;
  createdAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

/** Store d'administració sobre la BD de Cal.diy (PostgreSQL del producte). */
export interface CalendarAdminStore {
  findUserByEmail(email: string): Promise<CalendarUserRow | undefined>;
  findUserByUsername(username: string): Promise<CalendarUserRow | undefined>;
  isUsernameTaken(username: string): Promise<boolean>;
  createUser(input: {
    username: string;
    email: string;
    name?: string;
    timeZone: string;
    role: "USER" | "ADMIN";
  }): Promise<CalendarUserRow>;
  /** Crea l'horari per defecte (Working Hours, Mon-Fri 9-17) si l'usuari no en té. */
  ensureDefaultSchedule(userId: number, timeZone: string): Promise<number>;
  listApiKeys(userId: number): Promise<CalendarApiKeyRow[]>;
  /** Crea una API key; retorna la clau en PLA (només un cop) i el seu id. */
  createApiKey(userId: number, note: string): Promise<{ apiKey: string; id: string }>;
  revokeApiKey(id: string): Promise<boolean>;
  close(): Promise<void>;
}
