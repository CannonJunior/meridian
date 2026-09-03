# Meridian on Kubernetes — pilot manifests

Scope, deliberately: the stateless tiers (`server`, `web`, the three Kafka
producer processes) plus a self-contained `geoserver` (PVC-backed, but no
clustering/leader-election concerns — see its own file). This is the pilot
slice recommended alongside the container/CI work — see the architecture
review this came out of. It is not a full production cluster.

`server`, `web`, `geoserver`, and the three producers have all been deployed
and exercised against a real (local `kind`) cluster — ConfigMap/Secret
injection via `envFrom`, liveness/readiness probes, `web` reaching `server`
over in-cluster Service DNS, `server` against a Postgres seeded from this
repo's actual `geoserver/postgis-init/*.sql`, `geoserver-init-job.yaml`
actually provisioning a running GeoServer (workspace, datastores, feature
types, styles) end to end, and `base/networkpolicy.yaml`'s rules against a
NetworkPolicy-*enforcing* CNI (Calico — kind's own default CNI doesn't
enforce NetworkPolicy at all, so that specific check needed a non-default
setup) — not just parsed for YAML syntax.

The `server`+`web`+producers+NetworkPolicy slice of that now runs on every
push/PR as `.github/workflows/ci.yml`'s `k8s-smoke-test` job — see
`.github/scripts/k8s-smoke-test.sh`'s own header for exactly what it does
and doesn't cover, and its comments for two real bugs building it caught:
`server-deployment.yaml` had no `strategy: Recreate` (so any rollout
briefly ran two instances of a process that must never have more than
one — the same invariant its own header already documented, just not
actually enforced), and no `startupProbe` (so slow-Postgres contention
during startup could get it killed by its own liveness probe before it
ever finished starting, misread at first as an OOM until measured and
ruled out directly).

## What's here vs. what isn't

| Component | Here? | Why |
|---|---|---|
| `server` (API/WS) | Yes — Deployment + Service | Stateless (state lives in Postgres), scales cleanly, already has `/healthz`. Pinned to **1 replica** — see `server-deployment.yaml`'s comment for why more would corrupt data, not just duplicate load. |
| `web` (nginx + SPA) | Yes — Deployment + Service + Ingress + HPA + PodDisruptionBudget | Static content behind a reverse proxy; the one tier here actually safe to autoscale. |
| `history-sim` / `history-gdelt` / `history-celestrak` | Yes — Deployment (1 replica each) | Long-running processes with their own internal poll/tick loop (`restart: unless-stopped` in `kafka/docker-compose.yml`) — a `Deployment`, not a `CronJob`, is the right primitive; nothing about them is a run-to-completion batch job. |
| `geoserver` | Yes — Deployment + PVC + Service + init Job | Pinned to 1 replica for a real reason (its PVC is ReadWriteOnce and GeoServer doesn't coordinate concurrent writers to `data_dir`), not just caution. `geoserver-init-job.yaml` runs the same `provision.sh` docker-compose's `geoserver-init` service does — see "Provisioning" below. |
| PostGIS | **No** | Prefer a managed Postgres+PostGIS (RDS/Cloud SQL) over a hand-rolled StatefulSet — backups/failover/patching are exactly the ops burden k8s doesn't remove for you. If self-hosting is unavoidable, that's a `StatefulSet` + PVC + backup job this repo doesn't attempt to template blind. |
| Kafka broker | **No** | Same reasoning — use a managed broker, or the **Strimzi operator** if self-hosting. Hand-rolling Kafka as a bare `StatefulSet` is where the `kafka/docker-compose.yml` dual-listener trap (see that file's comments) gets *worse*, not better: advertised listeners need to be correct per-pod, which is exactly what Strimzi automates and a bare manifest won't. |

## Provisioning

`base/geoserver-init-job.yaml` is a `Job` that runs `geoserver/geoserver-init/
provision.sh` (workspace → datastores → feature types → styles) against
the `geoserver` Deployment — the same script `geoserver/docker-compose.yml`'s
own `geoserver-init` service runs, unmodified. It reads `provision.sh` and
every `*.sld` file from `base/geoserver-init-configmap.yaml`, a **generated
snapshot** (not hand-maintained — see that file's header for the
regeneration command) checked in because kustomize's default load
restrictions block a `configMapGenerator` from reading files outside `k8s/`
under plain `kubectl apply -k`. The Job is idempotent (every step in
`provision.sh` is create-or-no-op) — safe to re-run, e.g. after
regenerating the ConfigMap for a style change.

One real bug surfaced while validating this: `base/geoserver-deployment.yaml`'s
probes originally pointed at `/geoserver/web/` (the admin UI, same path
`docker-compose.yml`'s healthcheck uses) — but Kubernetes' `httpGet` prober
*follows* redirects, and that path 302s to `./?0` with a fresh session
cookie on every request that doesn't carry the previous one back. A
cookieless prober bounces on that forever ("stopped after 10 redirects"),
where `docker-compose.yml` never notices because plain `curl -sf` (no `-L`)
doesn't follow redirects at all — a 302 isn't a curl failure. Fixed to
probe `/geoserver/ows?service=wms&version=1.3.0&request=GetCapabilities`
instead (no session involved, a clean `200`). See that file's own comment
for the full story.

## Security

**NetworkPolicy** (`base/networkpolicy.yaml`): default-deny ingress across
the namespace, then explicit allows — `web` from anywhere on :80 (it's the
public entry point), `server` only from `web` on :8799, `geoserver` only
from `server` and from `geoserver-init-job.yaml`'s Job pod on :8080. The
three producers get no allow rule at all, matching them already having no
Service (`base/producers.yaml`'s header comment) — nothing should be
reaching them regardless. Egress is deliberately *not* restricted: Postgres/
Kafka/Google Static Maps all live at addresses this repo only knows as
placeholders, and a correct egress policy needs the real network topology
of wherever this deploys — see the file's own closing comment. Requires a
NetworkPolicy-enforcing CNI to actually do anything (most managed
clusters' default CNI does; plain `kind`'s does not — see the intro above).

**TLS**: none configured — `base/ingress.yaml` is plain HTTP, deliberately,
because meaningful TLS needs a real DNS hostname pointed at wherever this
runs and a cert source, neither of which exist yet. That file's header
comment has the exact 3-step addition (cert-manager + a ClusterIssuer +
a `tls:` block) for whenever both do.

## Config surface

Everything here reads config the same way the app already does locally —
env vars, no code changes needed. Two objects carry them:

- **`base/configmap.yaml`** — everything non-secret: `GEOSERVER_WFS_URL`,
  `KAFKA_BROKER`, the `KAFKA_*_ENABLED` feature flags, producer tuning
  vars. Fill in real hostnames for wherever Postgres/GeoServer/Kafka
  actually live in your environment — there is no `host.docker.internal`
  equivalent here, unlike `docker-compose.yml` at the repo root; these must
  be real, reachable addresses (managed service endpoints, or in-cluster
  Service DNS if those pieces get containerized too).
- **`base/secret.example.yaml`** — a *template*, not a real Secret (same
  convention as `.env.example` elsewhere in this repo — see the root
  `.gitignore`). Copy it to `base/secret.yaml`, fill in real values —
  never commit the filled-in copy. `PGPASSWORD`,
  `GOOGLE_MAPS_API_KEY`, and `GEOSERVER_ADMIN_PASSWORD` live here. For
  anything beyond a personal/dev cluster, replace this pattern with a real
  secret manager (External Secrets Operator, Sealed Secrets, or your cloud
  provider's native one) — a plain `Secret` object is only base64, not
  encryption at rest by itself.

## Images

`.github/workflows/ci.yml`'s `docker-build` job builds every image on every
push/PR, and — only on a push to `main` — pushes `server`, `web`, and the
three producers to `ghcr.io/cannonjunior/meridian-<name>`, tagged both
`:latest` and `:<git-sha>`. The manifests here reference `:latest`, which
moves with `main`; pin a Deployment's `image:` to a specific `:<sha>` tag
instead once there's an actual release process to gate what "deployed"
means.

GHCR packages default to **private**. Every Deployment here sets
`imagePullSecrets: [{name: ghcr-pull}]` for that reason — create it once
per cluster:

```
kubectl create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=<your-github-username> \
  --docker-password=<a classic PAT with read:packages> \
  -n meridian
```

Against a local `kind` cluster (loaded via `kind load docker-image`) this
secret doesn't need to exist at all — confirmed directly (a pod referencing
a nonexistent `imagePullSecrets` entry still pulls and runs a public image
fine, just logs a `FailedToRetrieveImagePullSecret` warning event). The
`local` overlay below relies on exactly that: it doesn't strip
`imagePullSecrets`, it just retags the images kind already has loaded.

## Layout

```
k8s/
  base/               # everything in "What's here vs. what isn't" above
  overlays/
    local/            # kind-only: retags this repo's own 5 images to
                       # locally-built :kindtest tags (kind never touches
                       # ghcr.io) — see its own header comment
```

No `staging`/`prod` overlay yet — there's no second real environment to
differentiate them from (see the "Stay local for now" call this repo's
history records). Add one the same way `local` was added, once there is.

## Applying

Against a real cluster, once `base/secret.yaml` exists (see "Config
surface" above) and images have been pushed by CI:

```
kubectl apply -k k8s/base
```

Against a local `kind` cluster — the path this entire pilot has actually
been validated against:

```
docker build -f server/Dockerfile -t meridian-server:kindtest .
docker build -f web/Dockerfile -t meridian-web:kindtest .
docker build -t meridian-history-sim:kindtest kafka/producer
docker build -t meridian-history-gdelt:kindtest kafka/producer-gdelt
docker build -t meridian-history-celestrak:kindtest kafka/producer-celestrak
kind load docker-image meridian-server:kindtest meridian-web:kindtest \
  meridian-history-sim:kindtest meridian-history-gdelt:kindtest \
  meridian-history-celestrak:kindtest --name <your-cluster-name>

cp k8s/base/secret.example.yaml k8s/base/secret.yaml   # fill in real values
kubectl apply -k k8s/overlays/local
```

This still needs a real (or throwaway, kind-hosted) Postgres reachable at
whatever `base/configmap.yaml`'s `PGHOST` is set to, and — for
`geoserver-init-job.yaml` to have anything to publish — that Postgres
needs the schema from `geoserver/postgis-init/*.sql`. Neither is templated
here on purpose (see "What's here vs. what isn't" — self-hosted Postgres is
deliberately out of scope), so a local smoke test currently means standing
one up by hand for the duration of the test, the way this pilot's own
validation did.
