#!/usr/bin/env python3
"""Generate/check public downloads independently from the local Factory API."""
import argparse,json,re,shutil,subprocess,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
BASE='https://raw.githubusercontent.com/HyakkimaruPY/universal-language/main/lnreader-prebuilt'
ap=argparse.ArgumentParser();ap.add_argument('--write',action='store_true');args=ap.parse_args()
with tempfile.TemporaryDirectory() as td:
 out=Path(td)/'public'
 subprocess.run([sys.executable,str(ROOT/'scripts/export_public_repo.py'),BASE,str(out)],check=True)
 manifest=json.loads((out/'.dist/plugins.min.json').read_text())
 assert len(manifest)==15
 for item in manifest:
  for key in ('url','iconUrl'):
   assert item[key].startswith(BASE+'/'),(key,item[key])
   assert (out/item[key][len(BASE)+1:]).is_file()
  js=(out/item['url'][len(BASE)+1:]).read_text()
  cfg=json.loads(re.search(r'^const CONFIG = (.*);$',js,re.M).group(1))
  assert cfg['factoryBase']=='http://127.0.0.1:8765'
  assert not (cfg.get('localTranslationConfig') or {}).get('keys')
 for src in out.rglob('*'):
  if not src.is_file():continue
  dest=ROOT/'lnreader-prebuilt'/src.relative_to(out)
  if args.write:
   dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
  elif not dest.exists() or src.read_bytes()!=dest.read_bytes():
   raise SystemExit('Public export stale: '+str(dest.relative_to(ROOT))+'; run python scripts/publish_masters.py --write')
print('PASS public repository: 15 downloadable Masters, existing assets, local API, no keys')
