#!/usr/bin/env bash
# ============================================================
# Publish this repository to GitHub with the gh CLI.
#
# Usage:
#   bash scripts/publish-to-github.sh [repo-name] [--public]
#
# Defaults: repo name "TraderBOT", private visibility, remote "origin".
#
# Requires an authenticated gh CLI. If you are not logged in yet:
#   gh auth login --hostname github.com --git-protocol https --web
#
# The script is idempotent:
#   * repo does not exist -> creates it and pushes (gh repo create --source --push)
#   * repo already exists -> adds/updates the "origin" remote and pushes
# ============================================================
set -euo pipefail

REPO_NAME="${1:-TraderBOT}"
VISIBILITY="--private"
REMOTE="origin"
BRANCH="main"

# gh may live outside PATH (e.g. ~/.local/bin/gh on a headless box).
GH="${GH_BIN:-}"
if [ -z "${GH}" ]; then
  if command -v gh >/dev/null 2>&1; then
    GH="$(command -v gh)"
  else
    GH="${HOME}/.local/bin/gh"
  fi
fi

if [ ! -x "${GH}" ]; then
  echo "error: gh CLI not found. Install it or set GH_BIN=/path/to/gh" >&2
  exit 1
fi

if ! "${GH}" auth status >/dev/null 2>&1; then
  echo "error: gh is not authenticated. Run:" >&2
  echo "  ${GH} auth login --hostname github.com --git-protocol https --web" >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "note: working tree has uncommitted changes; they will NOT be pushed."
fi

# Let gh supply the HTTPS credentials to git.
"${GH}" auth setup-git

OWNER="$("${GH}" api user --jq .login)"
echo "authenticated as: ${OWNER}"

if "${GH}" repo view "${OWNER}/${REPO_NAME}" >/dev/null 2>&1; then
  echo "repository ${OWNER}/${REPO_NAME} already exists -> pushing"
  if git remote get-url "${REMOTE}" >/dev/null 2>&1; then
    git remote set-url "${REMOTE}" "https://github.com/${OWNER}/${REPO_NAME}.git"
  else
    git remote add "${REMOTE}" "https://github.com/${OWNER}/${REPO_NAME}.git"
  fi
  git push -u "${REMOTE}" "${BRANCH}"
else
  echo "creating ${OWNER}/${REPO_NAME} (${VISIBILITY#--})"
  "${GH}" repo create "${REPO_NAME}" "${VISIBILITY}" \
    --source=. --remote="${REMOTE}" --push \
    --description "Market-data collection, analytics and decision-support system for crypto and macro data (Node.js)"
fi

echo
echo "done: https://github.com/${OWNER}/${REPO_NAME}"
