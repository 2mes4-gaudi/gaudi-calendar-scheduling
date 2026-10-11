/**
 * Adapter Mastra — runtime oficial de la plataforma Gaudi.
 * Projecta el registry d'accions de domini a eines Mastra (@mastra/core createTool).
 */
import { toMastraTools, type ServiceContext } from "@gaudi/core";
import { buildRegistry } from "../../domain/actions/index.js";

/**
 * Tools de Mastra — mateixa lògica que CLI/API, font única de veritat domain.
 */
export function mastraTools(ctx: ServiceContext) {
  return toMastraTools(buildRegistry(), ctx);
}

export const featureTools = mastraTools;
