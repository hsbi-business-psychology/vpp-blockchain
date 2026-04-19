#!/usr/bin/env bash
# scan-secrets.sh — search the working tree for raw 64-hex strings prefixed
# with "0x" that are likely Ethereum private keys, role hashes, or other
# 32-byte secrets accidentally committed in plaintext.
#
# Defends against incidents like the local-only `probe.mjs` that contained
# the live Mainnet minter private key (Audit M1 / F2.1, see
# docs/audit/v2/02-bereich-2-key-management.md).
#
# Usage:
#   scripts/scan-secrets.sh                # scan tracked + untracked files
#   scripts/scan-secrets.sh --staged       # scan only files staged for commit
#   scripts/scan-secrets.sh path1 path2    # scan explicit paths
#
# Exit codes:
#   0  no findings
#   1  one or more candidate hex strings found that are not allowlisted
#   2  invocation error
#
# Allowlist:
#   scripts/scan-secrets-allowlist.txt — one 0x… hex string per line.
#   Lines starting with "#" and blank lines are ignored.
#
# Compatibility: bash 3.2+ (works on macOS default /bin/bash).

set -eu
set -o pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOWLIST="${ROOT}/scripts/scan-secrets-allowlist.txt"

# 0x followed by exactly 64 hex chars. Anchored on word boundaries so we
# don't pick up 65-hex strings (signatures) or longer runs of hex inside
# bytecode blobs.
PATTERN='\b0x[0-9a-fA-F]{64}\b'

mode="all"
explicit_files=""

while [ $# -gt 0 ]; do
  case "$1" in
    --staged)
      mode="staged"
      shift
      ;;
    --help|-h)
      sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
      exit 0
      ;;
    --)
      shift
      mode="explicit"
      while [ $# -gt 0 ]; do
        explicit_files="${explicit_files}${1}
"
        shift
      done
      break
      ;;
    -*)
      echo "scan-secrets.sh: unknown flag $1" >&2
      exit 2
      ;;
    *)
      mode="explicit"
      explicit_files="${explicit_files}${1}
"
      shift
      ;;
  esac
done

cd "$ROOT"

case "$mode" in
  staged)
    file_list="$(git diff --cached --name-only --diff-filter=ACMR || true)"
    ;;
  explicit)
    file_list="${explicit_files%$'\n'}"
    ;;
  all)
    # Tracked + untracked, respecting .gitignore. This excludes
    # node_modules/, dist/, coverage/, artifacts/, cache/, typechain-types/
    # automatically because they are in .gitignore.
    file_list="$(git ls-files --cached --others --exclude-standard || true)"
    ;;
esac

if [ -z "$file_list" ]; then
  echo "scan-secrets: no files to scan"
  exit 0
fi

# Skip lockfiles, binary blobs, and the scanner's own files. Build a
# newline-separated list of paths that actually exist and aren't filtered out.
filtered=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    pnpm-lock.yaml|package-lock.json|yarn.lock|*.lock) continue ;;
    *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.pdf|*.zip) continue ;;
    scripts/scan-secrets.sh|scripts/scan-secrets-allowlist.txt) continue ;;
    # OpenZeppelin upgrades plugin manifest: public on-chain transaction
    # hashes for deployment + upgrade history, never secrets.
    packages/contracts/.openzeppelin/*.json) continue ;;
    # Forge / Hardhat artifact directories occasionally not in .gitignore.
    *.openzeppelin/*.json) continue ;;
  esac
  if [ -f "$f" ]; then
    filtered="${filtered}${f}
"
  fi
done <<EOF
$file_list
EOF

filtered="${filtered%$'\n'}"

if [ -z "$filtered" ]; then
  echo "scan-secrets: no scannable files after filter"
  exit 0
fi

# Run the regex. -E for ERE, -n for line numbers, -H for filename, -I to skip
# binary files. We tolerate "no matches" via the `|| true` because grep exits 1
# when nothing matches, which we treat as the success path.
matches="$(echo "$filtered" | tr '\n' '\0' | xargs -0 grep -EHnI "$PATTERN" 2>/dev/null || true)"

if [ -z "$matches" ]; then
  echo "scan-secrets: 0 candidate 0x… hex strings found"
  exit 0
fi

# Apply allowlist. Each allowlist entry is a literal hex string; we drop any
# match line that contains an allowlisted value.
if [ -f "$ALLOWLIST" ]; then
  tmp_allow="$(mktemp)"
  trap 'rm -f "$tmp_allow"' EXIT
  grep -E -v '^[[:space:]]*(#|$)' "$ALLOWLIST" > "$tmp_allow" || true

  if [ -s "$tmp_allow" ]; then
    matches="$(echo "$matches" | grep -v -F -f "$tmp_allow" || true)"
  fi
fi

if [ -z "$matches" ]; then
  echo "scan-secrets: only allowlisted hex constants found"
  exit 0
fi

echo "scan-secrets: found candidate 0x… hex strings (potential private keys / hashes)"
echo "----------------------------------------------------------------------"
echo "$matches"
echo "----------------------------------------------------------------------"
echo "If these are legitimate role hashes or test fixtures, add them to"
echo "  scripts/scan-secrets-allowlist.txt"
echo "with a comment explaining what they are."
exit 1
