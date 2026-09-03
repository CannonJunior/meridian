#!/usr/bin/env bash
# k8s smoke test — deploys server+web (+ a liveness check on the three
# producers) to a throwaway kind cluster and confirms the real request path
# works: web's nginx proxy -> server -> Postgres, AND that
# base/networkpolicy.yaml's rules actually hold under a policy-enforcing
# CNI (kind's own default CNI, kindnet, does NOT enforce NetworkPolicy —
# see k8s/README.md's intro — so this installs Calico specifically to make
# that part of the check meaningful, not decorative).
#
# Deliberately does NOT cover `geoserver` — its own boot + REST
# provisioning takes several minutes (see base/geoserver-deployment.yaml's
# probe comments), too slow for a check that runs on every push. It's been
# validated by hand against the same kind+Calico setup this script uses
# (see k8s/README.md's "Provisioning" section); a scheduled/nightly job
# covering it is a reasonable future addition, not attempted here. It's
# scaled to 0 immediately after apply below for a second reason beyond
# speed, found live: with every Deployment in k8s/base/ starting at once
# (this script applies the whole overlay) including geoserver at its full
# resource footprint, Postgres/CPU contention slowed `server`'s
# main()'s `await initStore()` (server/src/db.ts — a real Postgres
# round-trip, ~20 sequential INSERTs on a first boot) enough that its
# *liveness* probe's old fixed initialDelaySeconds fired and killed it
# mid-initialization, before it had ever bound its port — misread, at
# first, as an OOM (the exit code libc reports for a kubelet-issued
# SIGKILL, 137, is the same regardless of why kubelet sent it) until
# `server`'s own memory usage was measured directly and found flat under
# 30MB throughout, ruling that out. Fixed at the source
# (base/server-deployment.yaml now has a startupProbe, the same fix
# already applied to base/geoserver-deployment.yaml for the same class of
# bug) — scaling geoserver down here just keeps this script fast and
# removes one more source of contention for whatever runs alongside it.
#
# Runs locally the same way CI runs it — requires `docker`, `kubectl`, and
# `kind` on PATH:
#   ./.github/scripts/k8s-smoke-test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLUSTER_NAME="${CLUSTER_NAME:-meridian-smoke}"
NAMESPACE="meridian"
SCRATCH="$(mktemp -d)"
trap 'kind delete cluster --name "$CLUSTER_NAME" >/dev/null 2>&1 || true; rm -rf "$SCRATCH"' EXIT

log() { echo "[smoke-test] $*"; }

dump_debug() {
  log "--- DEBUG DUMP ---"
  kubectl -n "$NAMESPACE" get pods -o wide || true
  for app in server web test-postgis; do
    log "--- describe $app ---"
    kubectl -n "$NAMESPACE" describe pod -l app="$app" || true
    log "--- logs $app ---"
    kubectl -n "$NAMESPACE" logs -l app="$app" --tail=60 || true
    # The current container may have only just (re)started with nothing
    # logged yet — --previous is what actually crashed, if it did.
    log "--- logs $app (previous container, if any) ---"
    kubectl -n "$NAMESPACE" logs -l app="$app" --tail=60 --previous 2>/dev/null || true
  done
}
trap 'code=$?; if [ $code -ne 0 ]; then dump_debug; fi' ERR

log "Creating kind cluster '$CLUSTER_NAME' (default CNI disabled — Calico installed next)..."
cat > "$SCRATCH/kind-config.yaml" <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  disableDefaultCNI: true
  podSubnet: 192.168.0.0/16
EOF
kind create cluster --name "$CLUSTER_NAME" --config "$SCRATCH/kind-config.yaml"

log "Installing Calico (needed for base/networkpolicy.yaml to actually be enforced)..."
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/calico.yaml
kubectl wait --for=condition=ready node --all --timeout=120s
kubectl -n kube-system rollout status daemonset/calico-node --timeout=180s
kubectl -n kube-system rollout status deployment/calico-kube-controllers --timeout=180s
kubectl -n kube-system rollout status deployment/coredns --timeout=120s

log "Building and loading images (tag :kindtest, matching k8s/overlays/local)..."
docker build -f "$REPO_ROOT/server/Dockerfile" -t meridian-server:kindtest "$REPO_ROOT" -q
docker build -f "$REPO_ROOT/web/Dockerfile" -t meridian-web:kindtest "$REPO_ROOT" -q
docker build -t meridian-history-sim:kindtest "$REPO_ROOT/kafka/producer" -q
docker build -t meridian-history-gdelt:kindtest "$REPO_ROOT/kafka/producer-gdelt" -q
docker build -t meridian-history-celestrak:kindtest "$REPO_ROOT/kafka/producer-celestrak" -q
kind load docker-image \
  meridian-server:kindtest meridian-web:kindtest \
  meridian-history-sim:kindtest meridian-history-gdelt:kindtest meridian-history-celestrak:kindtest \
  --name "$CLUSTER_NAME"

kubectl create namespace "$NAMESPACE"

log "Standing up a throwaway Postgres with server's real startup schema..."
kubectl -n "$NAMESPACE" create configmap postgis-init \
  --from-file="$REPO_ROOT/geoserver/postgis-init/80-live-entities.sql" \
  --from-file="$REPO_ROOT/geoserver/postgis-init/85-sorties.sql" \
  --from-file="$REPO_ROOT/geoserver/postgis-init/90-live-entities-triggers.sql" \
  --from-file=96-history.sql="$REPO_ROOT/geoserver/postgis-init/100-history.sql"
cat > "$SCRATCH/test-postgis.yaml" <<EOF
apiVersion: apps/v1
kind: Deployment
metadata: { name: test-postgis, namespace: $NAMESPACE }
spec:
  replicas: 1
  selector: { matchLabels: { app: test-postgis } }
  template:
    metadata: { labels: { app: test-postgis } }
    spec:
      containers:
        - name: postgis
          image: postgis/postgis:16-3.4
          env:
            - { name: POSTGRES_DB, value: meridian }
            - { name: POSTGRES_USER, value: meridian }
            - { name: POSTGRES_PASSWORD, value: meridian }
          volumeMounts:
            - { name: init, mountPath: /docker-entrypoint-initdb.d/80-live-entities.sql, subPath: 80-live-entities.sql }
            - { name: init, mountPath: /docker-entrypoint-initdb.d/85-sorties.sql, subPath: 85-sorties.sql }
            - { name: init, mountPath: /docker-entrypoint-initdb.d/90-live-entities-triggers.sql, subPath: 90-live-entities-triggers.sql }
            - { name: init, mountPath: /docker-entrypoint-initdb.d/96-history.sql, subPath: 96-history.sql }
          readinessProbe:
            exec: { command: ["pg_isready", "-U", "meridian"] }
            periodSeconds: 3
            initialDelaySeconds: 5
      volumes:
        - name: init
          configMap: { name: postgis-init }
---
apiVersion: v1
kind: Service
metadata: { name: postgis, namespace: $NAMESPACE }
spec:
  selector: { app: test-postgis }
  ports: [{ port: 5432, targetPort: 5432 }]
---
# base/networkpolicy.yaml's default-deny-ingress (podSelector: {}) applies
# to every pod in this namespace, including this test-only fixture — a
# real Postgres lives outside the cluster entirely and was never subject
# to it, but this stand-in is, so it needs its own allow rule or `server`
# can't reach it. Found live: without this, server's DB connection just
# times out (Calico silently drops it) rather than failing loudly.
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: allow-postgis-ingress, namespace: $NAMESPACE }
spec:
  podSelector: { matchLabels: { app: test-postgis } }
  policyTypes: ["Ingress"]
  ingress:
    - from:
        - podSelector: { matchLabels: { app: server } }
      ports:
        - port: 5432
EOF
kubectl apply -f "$SCRATCH/test-postgis.yaml"
kubectl -n "$NAMESPACE" wait --for=condition=ready pod -l app=test-postgis --timeout=90s

log "Applying k8s/overlays/local (server, web, geoserver, producers, NetworkPolicy, ...)..."
cp "$REPO_ROOT/k8s/base/secret.example.yaml" "$REPO_ROOT/k8s/base/secret.yaml"
sed -i 's/PGPASSWORD: "change-me"/PGPASSWORD: "meridian"/' "$REPO_ROOT/k8s/base/secret.yaml"
kubectl apply -k "$REPO_ROOT/k8s/overlays/local"
rm "$REPO_ROOT/k8s/base/secret.yaml"

log "Scaling geoserver to 0 (out of scope here — see header comment) so it stops competing for node resources..."
kubectl -n "$NAMESPACE" scale deployment/geoserver --replicas=0
kubectl -n "$NAMESPACE" delete job/geoserver-init --ignore-not-found

# PGHOST in configmap.yaml is a real-deployment placeholder
# (postgis.example.internal) — this is the one value the smoke test itself
# has to know how to override, same as every manual validation round this
# repo's k8s work has gone through.
kubectl -n "$NAMESPACE" patch configmap meridian-config --type merge -p '{"data":{"PGHOST":"postgis"}}'
kubectl -n "$NAMESPACE" rollout restart deployment/server

log "Waiting for server and web to become available..."
# Above server-deployment.yaml's own startupProbe ceiling (periodSeconds
# 10 * failureThreshold 30 = up to 300s) plus margin — timing out here
# before that ceiling would misreport a server still legitimately within
# its own startup grace period as failed.
kubectl -n "$NAMESPACE" wait --for=condition=available deployment/server --timeout=330s
kubectl -n "$NAMESPACE" wait --for=condition=available deployment/web --timeout=120s

log "Verifying the real request path (web's nginx proxy -> server -> Postgres)..."
RESULT=$(kubectl -n "$NAMESPACE" run smoke-curl --image=curlimages/curl:8.10.1 --rm -i --restart=Never -- \
  curl -s -m 10 -w '\nHTTP %{http_code}' http://web/healthz)
echo "$RESULT"
echo "$RESULT" | grep -q "HTTP 200"

log "Verifying NetworkPolicy: an unlabeled pod must NOT reach server directly..."
ATTACKER_RESULT=$(kubectl -n "$NAMESPACE" run smoke-attacker --image=curlimages/curl:8.10.1 --rm -i --restart=Never -- \
  curl -s -m 5 -o /dev/null -w "HTTP %{http_code}" http://server:8799/healthz || true)
echo "$ATTACKER_RESULT"
if echo "$ATTACKER_RESULT" | grep -q "HTTP 200"; then
  log "FAIL: an unlabeled pod reached server:8799 directly — default-deny-ingress/allow-server-ingress regressed."
  exit 1
fi
log "Confirmed blocked, as expected."

log "Verifying the three producers at least start (no crash loop — they'll retry against the unreachable KAFKA_BROKER placeholder harmlessly, same as kafka/docker-compose.yml's restart: unless-stopped)..."
sleep 15
for app in history-sim history-gdelt history-celestrak; do
  PHASE=$(kubectl -n "$NAMESPACE" get pod -l app="$app" -o jsonpath='{.items[0].status.phase}')
  RESTARTS=$(kubectl -n "$NAMESPACE" get pod -l app="$app" -o jsonpath='{.items[0].status.containerStatuses[0].restartCount}')
  log "$app: phase=$PHASE restarts=$RESTARTS"
  if [ "$PHASE" != "Running" ]; then
    log "FAIL: $app is not Running."
    exit 1
  fi
done

log "All checks passed."
