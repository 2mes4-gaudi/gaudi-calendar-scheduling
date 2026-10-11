import type { Greeting } from "../../domain/model/greeting.js";

/**
 * GreetingDao — interfaz pura del dominio (SPEC §3b).
 * Contrat: get / set / list / delete con id estable y round-trip idempotente.
 * Implementación Postgres única (K3s ONLY) en PostgresGreetingDao.
 * Futuro pivot: añadir MongoGreetingDao, etc., sin tocar domain/services.
 */
export interface GreetingDao {
  kind: "postgres";
  name: string;
  get(id: string): Promise<Greeting | null>;
  set(greeting: Greeting): Promise<void>;
  list(): Promise<Greeting[]>;
  delete(id: string): Promise<void>;
  // Compatibilidad con KVStore genérico de @gaudi/core (usado por health)
  listCollections?(): Promise<string[]>;
  getRaw?(collection: string, key: string): Promise<unknown>;
  setRaw?(collection: string, key: string, value: unknown): Promise<void>;
  listRaw?(collection: string): Promise<string[]>;
  listValuesRaw?<T>(collection: string): Promise<T[]>;
}
