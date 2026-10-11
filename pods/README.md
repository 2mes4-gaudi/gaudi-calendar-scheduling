# Pods — WORKLOAD PODS dedicats (SPEC §15b)

> **Sempre present** com a arquitectura base (exemple desactivable). Un pod és
> per a **computació dedicada** (executors, batch), NO un daemon ni mai per
> servir la UI/API del feature.

| Concepte | On corre | Declaració | Exemple |
|---|---|---|---|
| **Daemon** `daemons[]` | **Dins del pod agèntic** (`gaudi-platform`, pod `ona`/`jan`), supervisat per `gaudi daemon` | `command`, `schedule`, `events`, `enabled`, `restart` | `example-watcher` cada 15m |
| **Pod** `pods[]` | **Deployment K3s dedicat** a `gaudi-platform` | `build.dockerfile`, `image`, `replicas`, `health.httpGet`, `resources`, `volumes`, `messaging` | `opencode-runner`, `example-pod` |

**Quan usar pod:**
- Comput intensiu, sandboxes, executors OpenCode, batch
- Executor autònom amb cicle de vida propi
- Necessitat d'escalar `replicas: 3` amb NATS Queue Group

**Estructura:** `pods/<pod-id>/Dockerfile` + `pods/<pod-id>/src/` + `package.json` propi.
El worker del pod usa SEMPRE `createPodWorker` de `@gaudi/core` (SPEC §14b:
prohibit el client nats raw) — queue-group + concurrència 1 + `/healthz` inclosos.

**Naming (SPEC §14a):**
- Queue: `gaudi.<domini>.<feature>.<propòsit>` (p. ex. `gaudi.calendar.scheduling.tasks`)
- Group: kebab-case (`tasks-executors`)

**Deploy automàtic (SPEC §10c):** `gaudi feature install` construeix la imatge,
aplica el Deployment+Service generat i espera Ready; `feature verify` comprova
l'estat i `feature uninstall` elimina els recursos.

**Manifest (exemple actiu al manifest del template):**

```yaml
pods:
  - id: example-pod
    name: Example Workload Pod
    build:
      dockerfile: pods/example-pod/Dockerfile
      context: pods/example-pod
    image: ghcr.io/2mes4-gaudi/gaudi-calendar-scheduling-example-pod
    replicas: 1
    health:
      httpGet: { path: /healthz, port: 8080 }
    messaging:
      input: { queue: gaudi.calendar.scheduling.tasks, group: tasks-executors }
      output: { topic: gaudi.calendar.scheduling.results }
```

**Salut:** cada pod exposa `GET /healthz` (inclòs a `createPodWorker`) → el
`feature.health` el consulta best-effort (component `pod:<id>`) i el core
(`gaudi health`) verifica l'estat Ready del Deployment.
