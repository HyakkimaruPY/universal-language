#!/usr/bin/env python3
"""Export a GitHub-safe Translator Hell repository.

The output contains only the 15 Master plugins and the common icon. It never
copies factory-data, generated children, learned profiles, or BYOK credentials.
"""
import argparse
import importlib.util
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_distribution_guard():
    spec = importlib.util.spec_from_file_location('translator_hell_distribution_guard', ROOT / 'scripts' / 'distribution_guard.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def load_factory():
    spec = importlib.util.spec_from_file_location('translator_hell_factory_export', ROOT / 'scripts' / 'factory_server.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('base_url', help='Raw base URL that will host the exported tree')
    ap.add_argument('output', nargs='?', default='public-export', help='Output directory')
    args = ap.parse_args()

    base = args.base_url.rstrip('/')
    out = Path(args.output).resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    m = load_factory()
    # Download origin is public; factory operations remain on the device.
    m.BASE_URL = 'http://127.0.0.1:8765'
    m.PROJECT_GITHUB = m.github_repo_from_raw(base) or m.PROJECT_GITHUB
    m.WEBROOT = out
    m.TEMPLATE = ROOT / 'factory-templates' / 'runtime.template.js'
    # Point credentials to a guaranteed-empty location inside the fresh export.
    m.DATA_DIR = out / '.private-never-published'
    m.PROFILES_FILE = m.DATA_DIR / 'profiles.json'
    m.CHILDREN_FILE = m.DATA_DIR / 'children.json'
    m.CREDENTIALS_FILE = m.DATA_DIR / 'credentials.json'
    m.MASTER_ICON = ROOT / 'lnreader-prebuilt' / ('public/static/' + m.MASTER_ICON_REL)

    icon_dst = out / ('public/static/' + m.MASTER_ICON_REL)
    icon_dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(m.MASTER_ICON, icon_dst)

    manifest = [m.master_manifest_entry(k, download_base=base, device_mode=True) for k in m.LANGUAGES]
    dist = out / '.dist'
    dist.mkdir(parents=True, exist_ok=True)
    (dist / 'plugins.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf-8')
    (dist / 'plugins.min.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), 'utf-8')

    # The temporary empty credential directory is not part of the export either.
    if m.DATA_DIR.exists():
        shutil.rmtree(m.DATA_DIR)

    leaked = []
    for path in out.rglob('*'):
        if path.is_file():
            text = path.read_text('utf-8', errors='ignore')
            if 'factory-data' in str(path).lower() or 'LOCAL_SECRET' in text:
                leaked.append(str(path))
    if leaked:
        raise SystemExit('Unsafe export: ' + ', '.join(leaked))

    # Final structural gate: public exports may contain only the 15 Factory
    # Masters. Official-reference plugins and locally generated children are
    # forbidden even if they were accidentally copied by a future exporter.
    guard = load_distribution_guard()
    try:
        guard.verify_webroot(out)
    except guard.GuardError as exc:
        raise SystemExit('Unsafe export: ' + str(exc))

    print(out)
    print(f'Masters: {len(manifest)}')
    print('No children/profiles/credentials exported.')


if __name__ == '__main__':
    main()
