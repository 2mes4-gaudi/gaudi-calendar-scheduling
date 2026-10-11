import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import type { DbConfig } from "@gaudi/core";

export interface FpConfig {
  database: {
    provider: "postgres";
    postgres?: { url: string; schema?: string };
  };
  credentials?: {
    backend: "env" | "secret-manager";
  };
}

const DEFAULT_PATH = join(homedir(), ".gaudi", "gaudi.yaml");

/** Config global de la plataforma: ~/.gaudi/gaudi.yaml. El usuario elige DAO y backend una vez. */
export function loadFpConfig(path = DEFAULT_PATH): FpConfig {
  try {
    const raw = readFileSync(path, "utf8");
    return YAML.parse(raw) as FpConfig;
  } catch {
    throw new Error(
      `No se encuentra ${path}. Ejecuta 'gaudi init' para crear la configuración global.`
    );
  }
}

export function toDbConfig(cfg: FpConfig): DbConfig {
  return {
    provider: cfg.database.provider,
    postgres: cfg.database.postgres,
  };
}
