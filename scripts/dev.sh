#!/usr/bin/env bash
# Windows, macOS, and Linux all go through the Node script. Git Bash on
# Windows has no lsof, and cmd.exe has no bash, so this file only delegates.
cd "$(dirname "$0")/.."
exec node scripts/dev.mjs
