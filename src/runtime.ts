import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  createFeatureLogger,
  createLocalMessageBus,
  createNatsMessageBus,
  type CredentialProvider,
  type DatabaseAdapter,
  type Logger,
  type MessageBus,
} from "@gaudi/core";
import type { CalcomApi } from "./ports/calcom.js";
import type { CalendarConfig, SchedulingContext } from "./ports/context.js";
import { buildRegistry } from "./domain/actions/index.js";
import { createCalendarAdminStore, createPlatformUsersReader } from "./adapters/admin/pg.js";
import {
  createClientFromCredentials,
  createEnvCredentialProvider,
  loadCalendarConfig,
  noopCredentials,
} from "./config/index.js";

function readManifestMeta(): { id: string; version: string } {
  try {
    const file = fileURLToPath(new URL("../gaudi-feature.yaml", import.meta.url));
    const m = YAML.parse(readFileSync(file, "utf8")) as { id?: string; version?: string };
    return { id: m.id ?? "calendar.scheduling", version: m.version ?? "0.0.0" };
  } catch {
    return { id: "calendar.scheduling", version: "0.0.0" };
  }
}

/** DAO de memòria: el feature NO té dades pròpies (l'estat viu a Cal.diy);
 *  només satisfà el contracte ServiceContext de l'SDK. */
export function makeMemoryDb(): DatabaseAdapter {
  const store = new Map<string, Map<string, unknown>>();
  return {
    kind: "postgres",
    name: "memory",
    async listCollections() {
      return [...store.keys()];
    },
    async get<T>(collection: string, key: string) {
      return (store.get(collection)?.get(key) as T) ?? null;
    },
    async set(collection: string, key: string, value: unknown) {
      if (!store.has(collection)) store.set(collection, new Map());
      store.get(collection)!.set(key, value);
    },
    async delete(collection: string, key: string) {
      store.get(collection)?.delete(key);
    },
    async list(collection: string) {
      return [...(store.get(collection)?.keys() ?? [])];
    },
    async listValues<T>(collection: string) {
      return [...(store.get(collection)?.values() ?? [])] as T[];
    },
  };
}

export interface RuntimeOptions {
  credentials?: CredentialProvider;
  logger?: Logger;
  calcom?: CalcomApi;
  config?: CalendarConfig;
  messageBus?: MessageBus;
  clock?: () => Date;
  noConfig?: boolean;
  fetchImpl?: typeof fetch;
  /** Mòdul d'administració injectable (tests). */
  admin?: SchedulingContext["admin"];
}

export interface SchedulingRuntime {
  registry: ReturnType<typeof buildRegistry>;
  ctx: SchedulingContext;
}

/** Arrel de composició (l'únic lloc que llegeix l'entorn via config/credentials). */
export async function buildRuntime(opts: RuntimeOptions = {}): Promise<SchedulingRuntime> {
  const logger = opts.logger ?? createFeatureLogger("calendar-scheduling");
  const credentials = opts.credentials ?? (opts.noConfig ? noopCredentials : createEnvCredentialProvider());
  const config = opts.config ?? loadCalendarConfig();
  const calcom = opts.calcom ?? (await createClientFromCredentials(credentials, config, opts.fetchImpl));
  const manifest = readManifestMeta();
  const natsUrl = process.env.GAUDI_NATS_URL ?? process.env.NATS_URL;
  const messageBus =
    opts.messageBus ??
    (opts.noConfig || !natsUrl
      ? createLocalMessageBus({ source: manifest.id, version: manifest.version })
      : createNatsMessageBus({ source: manifest.id, version: manifest.version, logger }));

  const ctx: SchedulingContext = {
    credentials,
    logger,
    dryRun: false,
    db: makeMemoryDb(),
    calcom,
    config,
    messageBus,
    clock: opts.clock ?? (() => new Date()),
  };

  // Mòdul d'administració (usuaris/API keys): només si hi ha les BDs configurades.
  if (opts.admin) {
    ctx.admin = opts.admin;
  } else if (!opts.noConfig && config.calendarDbUrl && config.platformDbUrl) {
    ctx.admin = {
      calcomDb: await createCalendarAdminStore(config.calendarDbUrl),
      platformUsers: await createPlatformUsersReader(config.platformDbUrl),
    };
  }

  return { registry: buildRegistry(), ctx };
}
