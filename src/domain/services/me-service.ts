import { unwrapData } from "../../ports/calcom.js";
import type { SchedulingContext } from "../../ports/context.js";
import { API_VERSIONS } from "./versions.js";

/** Perfil de l'usuari autenticat a Cal.diy (qui és l'amfitrió per defecte). */
export async function getMe(_input: unknown, ctx: SchedulingContext) {
  const res = await ctx.calcom.get("/v2/me", {}, API_VERSIONS.me);
  return { user: unwrapData(res) };
}
