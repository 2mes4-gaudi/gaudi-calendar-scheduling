# platform/ — stack Cal.diy (platform_services, SPEC §15c)

Aquest directori documenta el servei de plataforma aportat pel feature. No hi ha
codi de producte propi: el stack és el de **Cal.diy** (MIT) pinat a `v6.2.0` i
les imatges les construeix el CI (`.github/workflows/docker.yml`) des del codi
upstream, amb la URL pública incrustada al build del web.

| Servei | Kind | Recurs K3s | Què és |
|---|---|---|---|
| `calcom-db` | postgres | `calcom-db-postgres` | PostgreSQL dedicat (PVC 2Gi) |
| `calcom-cache` | cache | `calcom-cache` | Redis (rate limiting, cua Bull) |
| `calcom-web` | api | `calcom-web` + `calcom-web-secret` | Next.js amb Ingress TLS `cal.apps.ona.gaudi.2mes4.com` i bootstrap `npx prisma migrate deploy` |
| `calcom-api` | api | `calcom-api` | API v2 standalone (ClusterIP, intern) |

Política d'uninstall: s'eliminen Deployment/Service/Ingress/Certificate; es
conserven **PVCs** (dades) i el **Secret** `calcom-web-secret` (claus de
xifratge NEXTAUTH/CALENDSO — sense elles les dades són inservibles).

Upgrade: bump del tag d'imatge al manifest → `gaudi deploy` redeploya els serveis
amb imatge nova i re-executa el bootstrap idempotent.

## Patches Gaudi (platform/caldiy/patches)

El CI aplica els patches d'aquest directori sobre cal.diy pinat abans de
construir (l'API v2 es publica com `caldiy-api-v2:<ref>-gN`). Actuals:

- `0001-api-v2-license-status-valid.patch` — checkLicense accepta `{valid}`
  (resposta de console.cal.com) a més de `{status}`.
