#!/bin/sh
# Copy the built drawing editor (dist-embed/, from `npm run build:embed`) into a host project.
#   scripts/sync-embed.sh <host-dir>      e.g. ~/dev/arduino/p5comp/public/vendor/ams-editor
# The host serves that folder from its own origin and imports ams-editor.js from it. A VERSION file records
# which commit it was built from.
set -e
here="$(cd "$(dirname "$0")/.." && pwd)"
dest="${1:?usage: sync-embed.sh <host-dir>}"
[ -f "$here/dist-embed/embed.html" ] || { echo "No dist-embed/: run npm run build:embed first" >&2; exit 1; }
rm -rf "$dest"
mkdir -p "$dest"
cp -R "$here/dist-embed/." "$dest/"
{ git -C "$here" rev-parse --short HEAD; git -C "$here" diff --quiet || echo "(built from a working tree with uncommitted changes)"; date -u +%Y-%m-%dT%H:%MZ; } > "$dest/VERSION"
echo "Copied the editor to $dest ($(du -sh "$dest" | cut -f1))"
