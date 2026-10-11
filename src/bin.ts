#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildRuntime } from "./runtime.js";
import { buildSchedulingCli } from "./adapters/cli/index.js";

const manifestFile = fileURLToPath(new URL("../gaudi-feature.yaml", import.meta.url));
let info = { name: "scheduling", description: "Calendar Scheduling (calendar.scheduling)", version: "0.1.0" };
try {
  const m = YAML.parse(readFileSync(manifestFile, "utf8")) as { description?: string; version?: string };
  info = { name: "scheduling", description: m.description ?? info.description, version: m.version ?? info.version };
} catch {
  // defaults
}

const isHelpOrVersion = process.argv.some((a) => ["--help", "-h", "--version", "-V"].includes(a));
let runtime: Awaited<ReturnType<typeof buildRuntime>>;
try {
  runtime = await buildRuntime(isHelpOrVersion ? { noConfig: true } : {});
} catch (err) {
  process.stderr.write(`✗ calendar.scheduling no pot arrencar: ${(err as Error).message}\n`);
  process.exit(1);
}
const { registry, ctx } = runtime;
const program = buildSchedulingCli(registry, info, () => ctx);
try {
  await program.parseAsync(process.argv);
  // El CLI d'agent MAI ha de quedar viu: el bus NATS manté l'event loop obert
  // i el runner d'executors esperaria indefinidament.
  process.exit(0);
} catch (err) {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
}
