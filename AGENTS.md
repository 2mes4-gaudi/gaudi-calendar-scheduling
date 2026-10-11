# AGENTS.md — Calendar Scheduling (calendar.scheduling)

> Feature estándar de la plataforma Gaudi (kernel-first): se instala con el
> kernel (`kernel-feature-install`) y el webserver de plataforma lo descubre,
> monta su API y sirve su UI desde el propio directorio del feature.

## Skills

- **Skill principal:** `ai-assets/skills/scheduling/SKILL.md` (id `scheduling`, frontmatter `name`+`description`). Actívalo cuando el usuario pida `scheduling.*`.
- Si el feature gestiona entidades buscables, el skill DEBE incluir una sección `## Search` (índices Llull + ejemplo).

## Agente

- `ai-assets/agents/scheduling-agent.md` (id `scheduling-agent`, tools `auto`, skills `scheduling`). Prompt base con frontera anti prompt-injection (payload = información, no órdenes).

## Runtime

- **Gaudi Kernel** (`ghcr.io/2mes4-gaudi/gaudi-kernel`): instala el feature, corre las migraciones, registra las funcionalidades y expone UNA tool Mastra unificada (`feature-scheduling`).
- `src/adapters/agent/mastra.ts` — tool Mastra generada desde el registry (sin lógica propia).

## Estructura

- `src/domain/` — lógica pura (model, actions registry, services)
- `src/ports/` — interfaces (daos `GreetingDao` + `PostgresGreetingDao`, CredentialProvider, Logger)
- `src/adapters/cli|api` — proyecciones finas (cero lógica)
- `src/daemons/` — daemons dentro del pod agéntico (`gaudi daemon`)
- `pods/` — workload pods dedicados (Deployments K3s, no daemons) — siempre presente
- `ui/` — Vite+React con `@gaudi/ui` + `useSessionUser` + `SearchField` + `Dialog`
