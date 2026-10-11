/**
 * Logger — contrato puro (SPEC §3).
 * El feature lo recibe via ctx.logger (console en dev, Loki en K3s).
 */
export interface Logger {
  log?(...args: unknown[]): void;
  info?(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug?(...args: unknown[]): void;
}
