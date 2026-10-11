# Calendar Scheduling

Gestió de calendari i reserves sobre Cal.diy (Cal.com): event types, disponibilitat, bookings, URLs de reserva i operació via CLI per agents. Integració de producte open source (SPEC 15c).

> Template del estándar @gaudi (manifest v1.1). Generado por el constructor
> `gaudi` desde el repo `core`. Toda la documentación del estándar vive en
> `workspace/core/docs/` (MANIFESTO.md, SPEC.md, schema/).

## Estructura estándar

> `platform/` contiene el código de los SERVICIOS DE PLATAFORMA COMPARTIDOS que
> el feature aporta (repositorios centrales, DBs multi-agent, APIs públicas).
> Se desplegan en el ámbito de plataforma (`platform.k8s.namespace`) —
> declarados en `platform_services[]` del manifest.
> El primer feature que los instala los despliega; los demás verifican.


```
.
├── gaudi-feature.yaml       # CONTRATO: manifest v1.1 (id, deps, acciones, credenciales, datos, AI harness, lifecycle)
├── ai-assets/               # AI harness: todo lo que el feature expone al agente
│   ├── agents/              # agentes propios (<id>.md, frontmatter name+description+tools+skills)
│   └── skills/              # skills propios (<id>/SKILL.md, frontmatter name+description)
├── src/
│   ├── domain/              # CAPA 1 · lógica pura: model (zod), actions (registry), services — sin frameworks
│   ├── ports/               # CAPA 2 · interfaces: DAOs (postgres) + CredentialProvider
│   ├── adapters/            # CAPA 3 · CLI agente-friendly + tools Mastra/MCP (desde el registry)
│   ├── config/              # carga ~/.gaudi/gaudi.yaml (DAO y credenciales globales)
│   ├── index.ts             # exports públicos del feature
│   ├── bin.ts               # entry CLI (dist/bin.js)
│   └── server.ts            # entry API + UI (dist/server.js) — Hono serveix /api + / (UI embeguda)
├── packages/core/           # runtime @gaudi/core local (vía file:) — el esqueleto de las 3 capas
├── scripts/                 # hooks lifecycle (install.sh, uninstall.sh, verify.sh)
├── tests/                   # tests de las capas
└── ui/                      # (opcional) UI schema-driven (React+Vite, embeguda a la imatge de l'API)
```

Reglas: los features NUNCA leen `process.env` (usan `ctx.credentials`); la
lógica de negocio NUNCA importa commander/express/hono; cada acción declarada
en el manifest tiene UNA fuente de verdad en el registry.
Toda la computación y daemons corren exclusivamente en K3s (prohibido el uso
de Cloud Functions o App Engine).

## Manifest

```yaml
id: calendar.scheduling
version: 0.1.0
```

## Acciones

| Acción | Descripción | Destructiva | Confirmación |
|---|---|---|---|
| (generado desde el registry — ver `src/domain/actions/`) | | | |

## Uso (CLI)

```bash
npm install
npm run build

# Sin config global: usa memoria
node dist/bin.js scheduling.hello mundo --json

# Con config global (~/.gaudi/gaudi.yaml): usa postgres
npx scheduling scheduling.hello mundo --json
```

## Integración con agentes (Mastra/MCP)

```ts
import { buildRegistry, toMastraTools } from "@gaudi/calendar.scheduling";
const tools = toMastraTools(buildRegistry(), ctx); // mismo contrato que el CLI
```

## Arquitectura

```
src/
├── domain/       # lógica pura: model (zod) + actions (registry) + services
├── ports/        # DAOs (postgres) + CredentialProvider (en @gaudi/core)
├── adapters/     # cli (agente-friendly) + agent (mastra/mcp) — en @gaudi/core
└── config/       # carga ~/.gaudi/gaudi.yaml (DAOs y credenciales globales)
```

## Tests

- **Unitarios de capas** (`tests/`): `npm test` (ciclo de vida base del core).
- **Aceptación E2E** (`tests/acceptance/*.test.yaml`): prompts cortos + acción +
  resultado esperado, ejecutados con el skill `gaudi-feature-tester` en el
  sandbox Docker (opencode + skills mapeados + CLI + postgres aislado por test):
  ```bash
  bash workspace/core/sandbox/run-tests.sh <feature-dir>
  ```

## Mensajería de plataforma (cua única)

TODOS los features publican sus comunicaciones hacia el usuario/agente principal
en la **MISMA cua** (`gaudi.notifications`, port `MessageBus` de `@gaudi/core`,
transport NATS JetStream):

- **Hacia el usuario/agente** (inbound, fin de procesos, errores) → SIEMPRE por
  la cua: `ctx.messageBus.publish({ type: "<feature>.<evento>", correlationId, payload })`.
- **Acciones hacia fuera** (emails a terceros: invitaciones, cancelaciones) →
  directas (SMTP), no pasan por la cua.

Declarar en el manifest:

```yaml
messaging:
  queue: gaudi.notifications
  topics:
    - name: gaudi.notifications
      mode: publish
```

Sin conexión NATS, el bus se degrada con gracia (`{ published: false }`).
La suscripción de agentes (`subscribe`) es contrato futuro.

## Versions i release (sistema de versionat)

- **Semver per tags**: cada versió publicada és un tag `v<major>.<minor>.<patch>`
  que coincideix amb `version` del manifest. L'installer resol: `version` →
  tag; sense versió → `HEAD` de `main`.
- **Release = acció del DEVELOPER** (mai de l'installer): `gaudi feature release`
  talla el tag `v<version>` + changelog i el hook del registry publica la versió
  al catàleg CENTRAL. **No hi ha imatges per feature** (SPEC §1): el feature és
  un mòdul; l'API la munta el gateway i la UI la copia l'installer.
- **Deploy = acció de l'INSTALLER** (automàtic): el daemon `release-watcher` del
  registry detecta la versió nova i `registry.apply-updates` delega en
  `installer.update` (re-copia CLI/UI al webserver) + `installer.deploy-platform`
  (gateway amb el tag nou si usa deps fixes).

## API + UI (model gateway — un sol origen)

Quan el feature té `architecture.api: true` i `ui/`, exposa `createXxxApp`
(API) i construeix `ui/dist` (UI). La plataforma les publica sota
`/<feature>/api` (API, muntada pel GATEWAY) i `/<feature>/` (UI, servida pel
WEBSERVER des de `GAUDI_UI_DIR/<feature>`). El server local serveix API+UI
només per desenvolupament/tests; en producció corre el gateway, mai el server
del feature.
- **Dependències entre features**: al manifest
  (`dependencies.features[]` → `{id, repository, version?}`). La resolució i
  instal·lació topològica la fa l'installer; aquí només es declaren.

## Dependencias

Ver `gaudi-feature.yaml` → `dependencies` (features, packages, mcp).

## Ciclo de vida (base en el core)

El core integra la base del ciclo de vida — los scripts de `scripts/` son hooks
**complementarios** que el core invoca tras el paso base si existen:

```bash
gaudi feature install <dir>     # 1. validar manifest · 2. npm install (preinstall build-core) · 3. npm run build · 4. hook install · 5. catálogo
gaudi feature uninstall <dir>   # 1. hook uninstall · 2. baja del catálogo core.registry
gaudi feature verify <dir>      # 1. validar manifest · 2. npm test · 3. hook verify · 4. estado en el catálogo
gaudi feature publish <id>      # registra el feature instalado en core.registry
```

- `scripts/install.sh` → pasos específicos tras instalar (colecciones/tablas, seeds).
- `scripts/uninstall.sh` → limpieza específica tras desinstalar.
- `scripts/verify.sh` → chequeos específicos tras el test base (smoke tests propios).
- `scripts/build-core.js` → bootstrap del `packages/core` local (preinstall de
  `npm install`; el core lo dispara igualmente al instalar).
