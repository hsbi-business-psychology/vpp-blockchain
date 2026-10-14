#!/usr/bin/env bash
# Uploads deploy/ to the Plesk host over FTPS, changed files only.
#
# hosting.hsbi.de completes the FTPS handshake (AUTH TLS) only for clients
# inside the HSBI network or VPN. From elsewhere, GitHub-hosted runners
# included, it answers FEAT but never AUTH TLS (measured 2026-10-14), so run
# this from the HSBI network or VPN.
#
#   FTP_USERNAME, FTP_PASSWORD   required
#   FTP_HOST      default hosting.hsbi.de
#   FTP_ROOT      default /httpdocs
#   FTP_CA_FILE   CA bundle to verify TLS against; by default the system
#                 bundle plus the chain the host presents. No upload happens
#                 without a verified connection.
#   SITE_URL      default https://vpstunden.hsbi.de
#   BUILD_ID      when set, wait until /api/v1/health/live reports this build
#   DRY_RUN=1     only print the plan
#
# Order: assets, backend, Passenger restart, HTML entry points, manifest,
# then delete files retired by the previous deploy. A browser therefore never
# gets an index.html whose chunks are missing.
set -euo pipefail

: "${FTP_USERNAME:?FTP_USERNAME is required}"
: "${FTP_PASSWORD:?FTP_PASSWORD is required}"
FTP_HOST="${FTP_HOST:-hosting.hsbi.de}"
FTP_ROOT="${FTP_ROOT:-/httpdocs}"
SITE_URL="${SITE_URL:-https://vpstunden.hsbi.de}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="$ROOT/deploy"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Time limit for one command: GNU timeout on Linux, perl on macOS.
limit() {
  local seconds=$1
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  else
    perl -e 'alarm shift; exec @ARGV' "$seconds" "$@"
  fi
}

if [ -z "${FTP_CA_FILE:-}" ]; then
  # hosting.hsbi.de chains up to a HARICA root that the usual bundles carry.
  # The presented chain is added in case an intermediate is missing there.
  FTP_CA_FILE="$STAGE/ca.pem"
  for bundle in /etc/ssl/certs/ca-certificates.crt /etc/ssl/cert.pem; do
    if [ -s "$bundle" ]; then cat "$bundle" > "$FTP_CA_FILE"; break; fi
  done
  limit 20 openssl s_client -connect "$FTP_HOST:21" -starttls ftp -showcerts \
    -servername "$FTP_HOST" </dev/null 2>/dev/null \
    | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' >> "$FTP_CA_FILE" || true
fi
if [ ! -s "$FTP_CA_FILE" ]; then
  echo "::error::No TLS certificate chain for $FTP_HOST, refusing to upload unverified"
  exit 1
fi

SETTINGS="set ftp:ssl-allow yes; set ftp:ssl-force yes; set ftp:ssl-protect-data yes;"
SETTINGS+=" set ftp:passive-mode yes; set net:timeout 30; set net:max-retries 2;"
SETTINGS+=" set net:reconnect-interval-base 5;"
SETTINGS+=" set ssl:verify-certificate yes; set ssl:ca-file $FTP_CA_FILE;"
export LFTP_PASSWORD="$FTP_PASSWORD"
OPEN="open --env-password -u $FTP_USERNAME ftp://$FTP_HOST;"

ftp() { lftp -c "$SETTINGS $OPEN $1"; }

started=$(date +%s)
# A missing manifest means first deploy (full upload). Any other failure
# (TLS, login, network) must stop here: planning against an empty manifest
# would drop the pending deletions.
if ! ftp "cat $FTP_ROOT/.deploy-manifest.json" > "$STAGE/remote.json" 2> "$STAGE/cat.err"; then
  if grep -qiE '550|no such file|not found|does not exist' "$STAGE/cat.err"; then
    echo '{}' > "$STAGE/remote.json"
  else
    echo "::error::Could not read the server manifest: $(tr '\n' ' ' < "$STAGE/cat.err")"
    echo "If this is a timeout: FTPS to $FTP_HOST only works from the HSBI network or VPN."
    exit 1
  fi
fi
node "$ROOT/scripts/deploy-manifest.mjs" plan "$DEPLOY" "$STAGE/remote.json" "$STAGE"

if [ "${DRY_RUN:-}" = "1" ]; then
  for phase in assets backend entry; do
    [ -d "$STAGE/$phase" ] && (cd "$STAGE/$phase" && find . -type f | sed "s#^\.#$phase: #")
  done
  sed 's#^#delete: #' "$STAGE/delete.txt"
  exit 0
fi

upload() {
  if [ -d "$STAGE/$1" ]; then
    # --transfer-all: the stage holds only files that must go up; without it
    # lftp may skip one whose size matches and whose local copy looks older.
    ftp "mirror --reverse --no-perms --transfer-all --parallel=5 $STAGE/$1 $FTP_ROOT"
  fi
}

upload assets
upload backend
if [ -f "$STAGE/restart" ]; then
  ftp "mkdir -p -f $FTP_ROOT/packages/backend/tmp; put /dev/null -o $FTP_ROOT/packages/backend/tmp/restart.txt"
fi
upload entry
ftp "put $STAGE/manifest.json -o $FTP_ROOT/.deploy-manifest.json"

if [ -s "$STAGE/delete.txt" ]; then
  commands="set cmd:fail-exit no;"
  while IFS= read -r path; do
    commands+=" rm -f \"$FTP_ROOT/$path\";"
  done < "$STAGE/delete.txt"
  ftp "$commands" || true
fi
echo "Upload finished in $(( $(date +%s) - started )) s"

if [ -n "${BUILD_ID:-}" ]; then
  echo "Waiting for $SITE_URL to serve build $BUILD_ID ..."
  for _ in $(seq 1 36); do
    live="$(curl -fsS -m 10 "$SITE_URL/api/v1/health/live" 2>/dev/null || true)"
    if printf '%s' "$live" | grep -q "\"build\":\"$BUILD_ID\""; then
      echo "Live: $live"
      break
    fi
    sleep 5
  done
  if ! printf '%s' "$live" | grep -q "\"build\":\"$BUILD_ID\""; then
    echo "::error::$SITE_URL does not report build $BUILD_ID (last answer: ${live:-none})"
    exit 1
  fi
fi

entry_js="$(curl -fsS -m 10 "$SITE_URL/" | grep -o -m 1 '/assets/index-[A-Za-z0-9_-]*\.js' || true)"
if [ -z "$entry_js" ] || ! curl -fsS -m 10 -o /dev/null "$SITE_URL$entry_js"; then
  echo "::error::index.html does not load its entry chunk (${entry_js:-not found})"
  exit 1
fi
curl -sS -m 30 "$SITE_URL/api/v1/health" || true
echo
echo "Deploy finished in $(( $(date +%s) - started )) s"
