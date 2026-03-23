#!/usr/bin/env bash
set -euo pipefail

# Extension deploy script
# Builds the extension, copies to the extension repo, commits, and pushes.

EXTENSION_REPO="c:/Users/tckam/otalogin-extension"
DIST_DIR="apps/extension/dist"

# 1. Verify extension repo exists
if [ ! -d "$EXTENSION_REPO/.git" ]; then
  echo "ERROR: Extension repo not found at $EXTENSION_REPO"
  exit 1
fi

# 2. Build extension
echo "==> Building extension..."
pnpm build:extension

if [ ! -d "$DIST_DIR" ]; then
  echo "ERROR: Build output not found at $DIST_DIR"
  exit 1
fi

# 3. Get OTAlogin source commit hash
SOURCE_HASH=$(git rev-parse --short HEAD)
echo "==> Source commit: $SOURCE_HASH"

# 4. Sync dist to extension repo (preserve .git and README.md)
echo "==> Syncing to extension repo..."
# Remove old files (except .git and README.md)
find "$EXTENSION_REPO" -mindepth 1 -maxdepth 1 -not -name '.git' -not -name 'README.md' -exec rm -rf {} +
# Copy new build output
cp -r "$DIST_DIR"/* "$EXTENSION_REPO/"

# 5. Stage and check for actual changes (ignores CRLF-only diffs)
cd "$EXTENSION_REPO"
git add -A
if git diff --cached --quiet; then
  echo "==> No changes to deploy."
  exit 0
fi

# 6. Commit and push
echo "==> Committing..."
git commit -m "build: Update extension to $SOURCE_HASH"
echo "==> Pushing..."
git push origin main
echo "==> Done! Extension deployed (source: $SOURCE_HASH)"
