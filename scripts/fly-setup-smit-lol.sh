#!/usr/bin/env bash
# Setup custom domains smit.lol + www.smit.lol and SSL certs for clara-0-1.
# Run from repo root: ./scripts/fly-setup-smit-lol.sh
# Requires: flyctl logged in.

set -e
cd "$(dirname "$0")/.."
APP="${FLY_APP:-clara-0-1}"

echo "→ App: $APP"
flyctl status -a "$APP" || true

echo ""
echo "→ Checking IPs (need both v4 and v6 for certs)..."
flyctl ips list -a "$APP"
read -p "Allocate v4/v6 if missing? [y/N] " ok
if [[ "$ok" =~ ^[yY] ]]; then
  flyctl ips allocate-v4 -a "$APP" 2>/dev/null || true
  flyctl ips allocate-v6 -a "$APP" 2>/dev/null || true
  flyctl ips list -a "$APP"
fi

echo ""
echo "→ Adding custom domains..."
flyctl certs add smit.lol -a "$APP"
flyctl certs add www.smit.lol -a "$APP"

echo ""
echo "→ DNS setup instructions:"
flyctl certs setup smit.lol -a "$APP"
echo "---"
flyctl certs setup www.smit.lol -a "$APP"

echo ""
echo "→ After DNS has propagated, run:"
echo "  flyctl certs check smit.lol -a $APP"
echo "  flyctl certs check www.smit.lol -a $APP"
echo ""
echo "Done. Configure DNS at your registrar, then re-check certs."
