# Meridian on Kubernetes — pilot manifests

Scope, deliberately: **only the stateless tiers** — `server`, `web`, and the
three Kafka producer processes (`history-sim`, `history-gdelt`,
`history-celestrak`). This is the pilot slice recommended alongside the
container/CI work — see the architecture review this came out of. It is not
a full production cluster.

## What's here vs. what isn't

| Component | Here? | Why |
|---|---|---|
| `server` (API/WS) | Yes — Deployment + Service | Stateless (state lives in Postgres), scales cleanly, already has `/healthz`. |
| `web` (nginx + SPA) | Yes — Deployment + Service + Ingress | Static content behind a reverse proxy; trivially horizontal. |
| `history-sim` / `history-gdelt` / `history-celestrak` | Yes — Deployment (1 replica each) | Long-running processes with their own internal poll/tick loop (`restart: unless-stopped` in `kafka/docker-compose.yml`) — a `Deployment`, not a `CronJob`, is the right primitive; nothing about them is a run-to-completion batch job. |
| PostGIS | **No** | Prefer a managed Postgres+PostGIS (RDS/Cloud SQL) over a hand-rolled StatefulSet — backups/failover/patching are exactly the ops burden k8s doesn't remove for you. If self-hosting is unavoidable, that's a `StatefulSet` + PVC + backup job this repo doesn't attempt to template blind. |
| Kafka broker | **No** | Same reasoning — use a managed broker, or the **Strimzi operator** if self-hosting. Hand-rolling Kafka as a bare `StatefulSet` is where the `kafka/docker-compose.yml` dual-listener trap (see that file's comments) gets *worse*, not better: advertised listeners need to be correct per-pod, which is exactly what Strimzi automates and a bare manifest won't. |
| GeoServer | **No** | Not yet templated here. A single-replica `Deployment` + PVC for `data_dir` is the natural next piece once there's a cluster to point it at — deliberately left out of this first pass rather than templated speculatively. |

## Config surface

Everything here reads config the same way the app already does locally —
env vars, no code changes needed. Two objects carry them:

- **`configmap.yaml`** — everything non-secret: `GEOSERVER_WFS_URL`,
  `KAFKA_BROKER`, the `KAFKA_*_ENABLED` feature flags, producer tuning
  vars. Fill in real hostnames for wherever Postgres/GeoServer/Kafka
  actually live in your environment — there is no `host.docker.internal`
  equivalent here, unlike `docker-compose.yml` at the repo root; these must
  be real, reachable addresses (managed service endpoints, or in-cluster
  Service DNS if those pieces get containerized too).
- **`secret.example.yaml`** — a *template*, not a real Secret (same
  convention as `.env.example` elsewhere in this repo — see the root
  `.gitignore`). Copy it, fill in real values, and `kubectl apply -f` the
  copy — never commit the filled-in version. `PGPASSWORD` and
  `GOOGLE_MAPS_API_KEY` live here. For anything beyond a personal/dev
  cluster, replace this pattern with a real secret manager (External
  Secrets Operator, Sealed Secrets, or your cloud provider's native one) —
  a plain `Secret` object is only base64, not encryption at rest by itself.

## Images

Manifests reference `meridian-server:latest` / `meridian-web:latest` /
`meridian-history-sim:latest` / etc. — placeholders. These need to be built
(the Dockerfiles CI now validates on every push — see
`.github/workflows/ci.yml`) and pushed to a real registry, then the `image:`
fields here updated to the registry path + a real tag (not `:latest` — pin
by tag or digest once there's a release process). No registry is wired up
yet; that's the next prerequisite before any of this actually deploys
anywhere.

## Applying

```
kubectl apply -k k8s/
```

(`kustomization.yaml` just lists the plain manifests — no overlays/patches
yet. Add environment overlays (`k8s/overlays/staging`, `.../prod`, or one
per AO per the product's worldwide/region-by-region trajectory) once there's
a second environment to actually differentiate.)
