---
name: "scheduling"
description: "Domain skill for feature calendar.scheduling: Gestió de calendari i reserves sobre Cal.diy (Cal.com): event types, disponibilitat, bookings, URLs de reserva i operació via CLI per agents. Integració de producte open source (SPEC 15c).. Activate when the user asks to greet, list greetings, check health or operate feature scheduling."
---

# Calendar Scheduling — calendar.scheduling

## When to Activate

| User intent | Action |
|---|---|
| "Greet X" / "create a greeting" | `scheduling.hello` |
| "List greetings" / "what greetings are there" | `scheduling.greetings.list` |
| "Search greetings containing X" | `scheduling.greetings.search` |
| "How is the feature" / health | `scheduling.health` |

## How to Execute Actions (CLI — Single Source)

The feature exposes an agent-friendly CLI via `node dist/bin.js`. **Always `--json`**.

```bash
# List available actions
node dist/bin.js --help

# Health (SPEC §18 N1) — always available
node dist/bin.js scheduling health --json

# Execute actions (non-destructive)
node dist/bin.js scheduling hello "world" --json
node dist/bin.js scheduling greetings list --json

# With dry-run (if the action is destructive)
node dist/bin.js scheduling <action> --dry-run --json
```

**CLI/API Parity:** `POST /api/actions/scheduling.hello` with the same body produces the same result (same source: registry + buildRuntime). See `src/adapters/api/index.ts`.

## Search (SPEC §16b — How to Find Feature Information)

Feature information is **indexed in Llull** (platform search engine). Before listing everything, search:

- **Index**: `gaudi-calendar-scheduling` (canonical naming §16).
- **What is indexed**: stored greetings (`title` = greeting message, `content` = "Greeting to <name>").
- **How to search**:

```bash
node dist/bin.js scheduling greetings search "text to search" --json
```

  Results sorted by relevance (`score`); `indexed: false` = Llull not available (graceful degradation).

## Confirmation Policy (SPEC §7)

- `destructive: false` → autonomous.
- `destructive: true, confirm: required` → propose with `--dry-run`, show plan, wait for `--yes`.
- `confirm: always` → always requires human confirmation + snapshot.

## Database (postgres only, K3s ONLY)

DAO `GreetingDao` (interface) + `PostgresGreetingDao` (Drizzle/pool `platform-postgres:5432`, schema `scheduling` per agent). Do not specify DB from the agent; it is chosen by `~/.gaudi/gaudi.yaml`. Pivotable interface for the future.

## Credentials and Environment

Declared in `gaudi-feature.yaml` `environment[]` (`GAUDI_SCHEDULING_*`, `secret`, `scope`). Values in `public.environment_variables` → `gaudi env set` → `gaudi env sync-k8s`. Never `process.env` in code.

## Messaging and Daemons

- Inbound toward user/agent → `ctx.messageBus.publish({ type: "scheduling.<event>", correlationId, payload })` (NATS `gaudi.<agent_id>.notifications`).
- Outbound to third parties → direct (SMTP), not via queue.
- Periodic/reactive work → `daemons[]` in `src/daemons/` (runs inside the agentic pod), not on Cloud Functions.

## Pods (full product)

If the feature integrates a heavy product/API, declare `pods[]` (see `pods/README.md`) → K3s Deployment with canonical pattern `feature-{feature}-{qualifier}` and `/healthz`. Do not confuse with daemons.

## Common Errors

- `CREDENTIAL_MISSING` → `gaudi env set GAUDI_SCHEDULING_EXAMPLE_TOKEN ... --scope feature`
- `CONFIRM_REQUIRED` → re-run with `--yes` after showing plan
- `DAO unavailable` → check `scheduling.health` components (dao)
