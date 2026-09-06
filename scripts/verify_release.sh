#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[release] 1/5 self-test Python"
python scripts/self_test.py
python scripts/retranslation_self_test.py
python scripts/publish_masters.py

echo "[release] 2/5 runtime Node"
node scripts/runtime_self_test.js

echo "[release] 3/5 arquiteturas com DOM real"
node scripts/architecture_self_test.js

echo "[release] 4/5 sintaxe dos 15 Masters"
for f in lnreader-prebuilt/.js/src/plugins/multi/translatorHellMaster_*.js; do
  node --check "$f" >/dev/null
done

echo "[release] 5/5 distribution guard"
python scripts/distribution_guard.py --package "$ROOT"

echo "[release] OK — árvore segura para empacotar/publicar."
