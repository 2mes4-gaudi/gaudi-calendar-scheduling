import type { GreetingDao } from "./GreetingDao.js";
import type { Greeting } from "../../domain/model/greeting.js";

/**
 * PostgresGreetingDao — implementación Postgres (Drizzle/KVStore) para Greeting.
 * Wrapper tipado sobre el KVStore genérico de @gaudi/core (que ya usa postgres).
 * Mantiene compatibilidad con health (list) y con el store genérico (listCollections etc.).
 */
export class PostgresGreetingDao implements GreetingDao {
  kind: "postgres" = "postgres";
  name = "postgres";

  constructor(private readonly store: any) {}

  async get(id: string): Promise<Greeting | null> {
    return (await this.store.get("greetings", id)) as Greeting | null;
  }

  async set(greeting: Greeting): Promise<void> {
    await this.store.set("greetings", greeting.id, greeting);
  }

  async list(): Promise<Greeting[]> {
    return (await this.store.listValues("greetings")) as Greeting[];
  }

  async delete(id: string): Promise<void> {
    if (this.store.delete) await this.store.delete("greetings", id);
    else await this.store.set("greetings", id, undefined);
  }

  async listCollections(): Promise<string[]> {
    return this.store.listCollections ? await this.store.listCollections() : ["greetings"];
  }

  async getRaw(collection: string, key: string): Promise<unknown> {
    return this.store.get(collection, key);
  }

  async setRaw(collection: string, key: string, value: unknown): Promise<void> {
    return this.store.set(collection, key, value);
  }

  async listRaw(collection: string): Promise<string[]> {
    return this.store.list(collection);
  }

  async listValuesRaw<T>(collection: string): Promise<T[]> {
    return this.store.listValues(collection);
  }
}
