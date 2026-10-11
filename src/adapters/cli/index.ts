import { Command } from "commander";
import type { ActionRegistry, ActionDef } from "@gaudi/core";
import type { SchedulingContext } from "../../ports/context.js";

export interface CliOptions {
  json?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

export interface CliInfo {
  name: string;
  description: string;
  version: string;
}

function formatOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function zodTypeName(schema: unknown): string | undefined {
  const s = schema as { _def?: { typeName?: string }; def?: { typeName?: string } } | undefined;
  return s?._def?.typeName ?? s?.def?.typeName;
}

function unwrap(schema: unknown): unknown {
  let current = schema;
  const WRAPPERS = new Set([
    "ZodDefault",
    "ZodOptional",
    "ZodNullable",
    "ZodEffects",
    "ZodPipeline",
    "ZodLazy",
    "ZodCoerce",
    "ZodUnion",
  ]);
  for (let i = 0; i < 8; i++) {
    const name = zodTypeName(current);
    if (!name || !WRAPPERS.has(name)) return current;
    const def = (current as { _def?: { innerType?: unknown; schema?: unknown; options?: unknown[] } })._def;
    const inner = def?.innerType ?? def?.schema ?? (def as { options?: unknown[] })?.options?.[0];
    if (!inner) return current;
    current = inner;
  }
  return current;
}

function isOptional(schema: unknown): boolean {
  const name = zodTypeName(schema);
  return name === "ZodOptional" || name === "ZodDefault" || name === "ZodNullable";
}

/** Shape d'entrada d'una acció, travessant refinements (ZodEffects) i wrappers. */
function inputShapeOf(schema: unknown): Record<string, unknown> {
  const s = schema as { shape?: Record<string, unknown>; _def?: { schema?: unknown; innerType?: unknown } } | undefined;
  if (s?.shape) return s.shape;
  const inner = s?._def?.schema ?? s?._def?.innerType;
  return inner ? inputShapeOf(inner) : {};
}

function coerceArg(schema: unknown, raw: string): unknown {
  const inner = unwrap(schema);
  const name = zodTypeName(inner);
  if (name === "ZodArray" || name === "ZodObject" || name === "ZodRecord") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) return JSON.parse(trimmed);
    if (name === "ZodArray") return raw.split(",").map((s) => s.trim()).filter(Boolean);
    throw new Error(`Argumento JSON inválido: ${raw}`);
  }
  if (name === "ZodBoolean") return raw === "true" || raw === "1";
  return raw;
}

/**
 * CLI agent-friendly generat del registry (UNA font de veritat):
 * `scheduling <action> <args> --json` amb --dry-run i --yes en destructives.
 */
export function buildSchedulingCli(
  registry: ActionRegistry,
  info: CliInfo,
  ctxFactory: () => SchedulingContext,
  programOptions: { exitOverride?: boolean } = {}
) {
  const program = new Command()
    .name(info.name)
    .description(info.description)
    .version(info.version)
    .option("--json", "output JSON (modo agente)")
    .option("--dry-run", "mostrar acciones sin ejecutarlas")
    .option("--yes", "confirmar acciones destructivas");

  if (programOptions.exitOverride) program.exitOverride();

  const groups = new Map<string, Map<string, ActionDef>>();
  for (const action of registry.list()) {
    const [domain, ...rest] = action.id.split(".");
    const subId = rest.join(".");
    if (!groups.has(domain)) groups.set(domain, new Map());
    groups.get(domain)!.set(subId, action);
  }

  const buildActionCommand = (action: ActionDef, subId: string) => {
    const cmd = new Command(subId.split(".").pop() ?? subId).description(action.description);

    const inputShape = inputShapeOf(action.inputSchema);
    for (const key of Object.keys(inputShape)) {
      const schema = inputShape[key];
      const optional = isOptional(schema);
      cmd.argument(optional ? `[${key}]` : `<${key}>`, key);
    }

    cmd.action(async (...args: unknown[]) => {
      const opts = program.opts<CliOptions>();
      const input: Record<string, unknown> = {};
      Object.keys(inputShape).forEach((k, i) => {
        const raw = args[i];
        if (raw === undefined) return;
        // Placeholder per saltar opcionals: "" en un argument opcional = no informat.
        if (raw === "" && isOptional(inputShape[k])) return;
        try {
          input[k] = typeof raw === "string" ? coerceArg(inputShape[k], raw) : raw;
        } catch (err) {
          process.stdout.write(
            formatOutput({ error: `Argumento inválido para ${k}: ${(err as Error).message}`, action: action.id }) + "\n"
          );
          process.exit(1);
        }
      });

      const ctx = ctxFactory();
      ctx.dryRun = opts.dryRun ?? false;

      const isDestructive = action.meta?.destructive ?? false;
      if (isDestructive && !opts.dryRun && !opts.yes) {
        process.stdout.write(
          formatOutput({
            error: "CONFIRM_REQUIRED",
            action: action.id,
            hint: "Reejecuta con --yes (o --dry-run para previsualizar). Los agentes deben pedir confirmación humana.",
          }) + "\n"
        );
        process.exit(2);
      }

      try {
        const result = await registry.run(action.id, input, ctx);
        process.stdout.write(formatOutput(result) + "\n");
      } catch (err) {
        process.stdout.write(formatOutput({ error: (err as Error).message, action: action.id }) + "\n");
        process.exit(1);
      }
    });

    return cmd;
  };

  for (const [domain, actions] of groups) {
    const domainCmd = new Command(domain).description(`Acciones del dominio ${domain}`).allowUnknownOption(false);
    type TreeLevel = Map<string, ActionDef | TreeLevel>;
    const tree: TreeLevel = new Map();
    for (const [subId, action] of actions) {
      const parts = subId.split(".");
      let level: TreeLevel = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!level.has(part)) level.set(part, new Map());
        level = level.get(part) as TreeLevel;
      }
      level.set(parts[parts.length - 1], action);
    }

    type AttachLevel = Map<string, ActionDef | AttachLevel>;
    const attach = (parent: Command, level: AttachLevel) => {
      for (const [name, value] of level) {
        if (value instanceof Map) {
          const sub = new Command(name);
          attach(sub, value);
          parent.addCommand(sub);
        } else {
          parent.addCommand(buildActionCommand(value as ActionDef, name));
        }
      }
    };
    attach(domainCmd, tree);
    program.addCommand(domainCmd);
    // Attach directly to root program so both `scheduling <action>` and `scheduling <domain> <action>` work
    attach(program, tree);
  }

  return program;
}
