/**
 * CredentialProvider — contrato puro (SPEC §5).
 * El feature nunca lee process.env directamente.
 * Implementación real viene de @gaudi/core (env + secret-manager) inyectada en ctx.
 */
export interface CredentialProvider {
  get(id: string): Promise<string | undefined>;
  has(id: string): Promise<boolean>;
}
