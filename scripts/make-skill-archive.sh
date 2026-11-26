#!/usr/bin/env bash
# Zip the sample skill pack so it can be imported through the UI.
#
# Committing a .zip would be committing an opaque binary; building it from a
# readable folder keeps the demo material reviewable in a diff.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/docs/skills/api-contract-pack"
out="$root/dist"

[ -d "$src" ] || { echo "missing $src" >&2; exit 1; }

mkdir -p "$out"
rm -f "$out/api-contract-pack.zip"

# -r recurse, -X drop extra file attributes so the archive is reproducible.
( cd "$root/docs/skills" && zip -rqX "$out/api-contract-pack.zip" api-contract-pack )

echo "✓ $out/api-contract-pack.zip"
echo "  Import it: Skills → Add Skill → Import from file"
