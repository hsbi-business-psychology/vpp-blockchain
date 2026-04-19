#!/usr/bin/env bash
# Sets up branch-protection on `main` for the VPP Blockchain repo.
#
# Policy:
#   - Require status check `CI` to pass before merge
#   - Require pull request review (1 approval) for non-admins
#   - Block force pushes and branch deletion
#   - Require conversation resolution
#   - Admins (= repo owners) may bypass PR requirement for emergency hotfixes
#     (uncheck "Do not allow bypassing the above settings" if you want
#     hard-locked main for *everyone* including admins).
#
# Prerequisites:
#   - `gh auth login` with admin permission on the target repo
#   - Run from inside a clone of the target repo
#
# Usage:
#   bash scripts/setup-branch-protection.sh [BRANCH]
#
# Default BRANCH: main

set -euo pipefail

BRANCH="${1:-main}"
REPO_FULL="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

echo "→ Configuring branch protection on ${REPO_FULL}@${BRANCH}"

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/${REPO_FULL}/branches/${BRANCH}/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["CI"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON

echo "✓ Branch protection applied. Verify at: https://github.com/${REPO_FULL}/settings/branches"
echo
echo "Current protection state:"
gh api "/repos/${REPO_FULL}/branches/${BRANCH}/protection" \
  --jq '{required_status_checks, required_pull_request_reviews, allow_force_pushes, allow_deletions, required_linear_history, required_conversation_resolution, enforce_admins}'
