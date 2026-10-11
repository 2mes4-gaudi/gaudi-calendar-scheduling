# AGENTS.md — gaudi-calendar-scheduling

Guia per a desenvolupadors i agents que toquin aquest repo.

## Què és

Feature de la plataforma Gaudi (estàndard v1.3): integra **Cal.diy** com a
producte extern i n'exposa tota la superfície rellevant via un **CLI**
agent-friendly generat des del registry d'accions. **No té UI ni API pròpies**:
la interfície humana és Cal.diy; l'agent usa el CLI/skill.

## Arquitectura (3 capes, SPEC §3)

```
src/domain/        # pur: model zod, registry d'accions (font única), serveis
src/ports/         # interfaces: CalcomApi, SchedulingContext
src/adapters/      # calcom/http.ts (fetch), cli/ (commander; sense lògica)
src/config/        # resolució d'env → CalendarConfig + credencials (env chains)
src/runtime.ts     # arrel de composició (únic lloc que llegeix l'entorn)
src/bin.ts         # entrypoint CLI (bin `scheduling`)
```

- **Regla dura**: cap `process.env` fora de `config/` i `runtime.ts`; els
  handlers només usen `ctx.calcom`, `ctx.config`, `ctx.credentials`, `ctx.messageBus`.
- Els **outputs** són passthrough a propòsit: l'estat és de Cal.diy i l'API pot
  afegir camps sense trencar el contracte.

## Afegir una acció

1. Input/output zod a `src/domain/model/calendar.ts`.
2. Lògica a `src/domain/services/<família>-service.ts` (crida `ctx.calcom`).
3. Registra l'acció a `src/domain/actions/index.ts` (id `scheduling.<nom>`).
4. Afegeix-la a `actions[]` del `gaudi-feature.yaml` (permissions/destructive).
5. Tests: unit a `tests/`, cas acceptance a `tests/acceptance/` i, si és
   usable pel skill, documenta-la a `ai-assets/skills/scheduling/SKILL.md`.

## Versions de l'API

Les versions `cal-api-version` viuen a `src/domain/services/versions.ts`:
`me/bookings=2024-08-13`, `event-types=2024-06-14`, `slots=2024-09-04`,
`schedules=2024-06-11`. No les canviïs sense validar contra el Cal.diy pinat.

## Producte (Cal.diy) al manifest

El stack es declara a `platform_services[]` (`calcom-db`, `calcom-cache`,
`calcom-web`, `calcom-api`) seguint SPEC §15c. Les imatges es construeixen per
CI (`.github/workflows/docker.yml`) des de `calcom/cal.diy` pinat. Els jobs
interns del producte són **daemons** del feature (`daemons[]`), mai CronJobs.

## Comandes

```bash
npm install && npm run build       # tsc
npm test                           # node --test (unit)
node tests/mock-calcom.mjs &       # mock API v2 per smoke local
```

## Release

1. Bump `version` al manifest + `CHANGELOG.md`.
2. `git commit && git tag vX.Y.Z && git push origin main --tags`.
3. El registry de plataforma publica la versió i l'instal·lador la desplega.
