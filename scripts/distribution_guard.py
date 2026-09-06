#!/usr/bin/env python3
"""Release/distribution guard for Factory - Ance.

Purpose:
  * The official LNReader plugin repository is REFERENCE ONLY.
  * A distributable Factory tree may contain only the 15 Factory Masters.
  * Generated children, learned profiles and BYOK credentials are local runtime
    state and must never ship in a release or public GitHub export.

This script deliberately validates structure, not filenames mentioned in docs.
Research notes may name official plugins (for example NOVA.ts); actual plugin
source files may not be bundled.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

LANGS = (
    'id', 'en', 'es', 'fr', 'pl', 'pt', 'vi', 'tr', 'ru', 'uk',
    'ar', 'th', 'zh', 'ja', 'ko',
)
MASTER_IDS = {f'translatorhell_master_{x}' for x in LANGS}
MASTER_FILES = {f'translatorHellMaster_{x}.js' for x in LANGS}


class GuardError(RuntimeError):
    pass


def _load_json(path: Path):
    try:
        return json.loads(path.read_text('utf-8'))
    except FileNotFoundError:
        raise GuardError(f'arquivo obrigatório ausente: {path}')
    except Exception as exc:
        raise GuardError(f'JSON inválido em {path}: {exc}')


def _assert_empty_runtime_state(root: Path) -> None:
    data = root / 'factory-data'
    if not data.exists():
        # GitHub public source trees may intentionally omit ignored runtime state.
        return

    children = _load_json(data / 'children.json')
    profiles = _load_json(data / 'profiles.json')
    credentials = _load_json(data / 'credentials.json')

    if children != []:
        raise GuardError('release contém filhos pré-gerados em factory-data/children.json')
    if profiles != {}:
        raise GuardError('release contém perfis aprendidos em factory-data/profiles.json')
    if not isinstance(credentials, dict):
        raise GuardError('factory-data/credentials.json precisa ser um objeto JSON')
    if credentials.get('keys') not in ({}, None):
        raise GuardError('release contém chaves BYOK em factory-data/credentials.json')
    if credentials.get('models') not in ({}, None):
        raise GuardError('release contém configuração privada de modelos')
    if credentials.get('order') not in ([], None):
        raise GuardError('release contém ordem privada de provedores')


def _assert_no_generated_artifacts(webroot: Path) -> None:
    generated_roots = (
        webroot / '.js/src/plugins/generated',
        webroot / 'public/static/src/generated',
    )
    for folder in generated_roots:
        if not folder.exists():
            continue
        leaked = [p for p in folder.rglob('*') if p.is_file()]
        if leaked:
            sample = ', '.join(str(x.relative_to(webroot)) for x in leaked[:8])
            raise GuardError(f'release contém artefatos gerados localmente: {sample}')


def _assert_master_plugin_tree(webroot: Path) -> None:
    plugin_root = webroot / '.js/src/plugins'
    if not plugin_root.is_dir():
        raise GuardError(f'diretório de plugins ausente: {plugin_root}')

    js_files = sorted(p for p in plugin_root.rglob('*.js') if p.is_file())
    expected_paths = {
        plugin_root / 'multi' / filename for filename in MASTER_FILES
    }
    actual_paths = set(js_files)

    extra = sorted(actual_paths - expected_paths)
    missing = sorted(expected_paths - actual_paths)
    if extra:
        sample = ', '.join(str(x.relative_to(webroot)) for x in extra[:12])
        raise GuardError(
            'plugin não-Master detectado no pacote (plugins oficiais/filhos são referência/local apenas): '
            + sample
        )
    if missing:
        sample = ', '.join(str(x.relative_to(webroot)) for x in missing[:12])
        raise GuardError('Master obrigatório ausente: ' + sample)
    if len(js_files) != 15:
        raise GuardError(f'esperados 15 Masters; encontrados {len(js_files)} arquivos JS de plugin')

    # Extra defense: every shipped plugin must self-identify as a Factory Master.
    for path in js_files:
        text = path.read_text('utf-8', errors='replace')
        if '"mode":"master"' not in text:
            raise GuardError(f'plugin distribuído não está em mode=master: {path.relative_to(webroot)}')
        if '"id":"translatorhell_master_' not in text:
            raise GuardError(f'ID de Master inválido: {path.relative_to(webroot)}')


def _assert_manifest(path: Path, webroot: Path) -> None:
    manifest = _load_json(path)
    if not isinstance(manifest, list):
        raise GuardError(f'manifesto precisa ser uma lista: {path}')
    if len(manifest) != 15:
        raise GuardError(f'{path.name}: esperados 15 Masters; encontrados {len(manifest)} registros')

    ids = {str(x.get('id', '')) for x in manifest if isinstance(x, dict)}
    if ids != MASTER_IDS:
        extra = sorted(ids - MASTER_IDS)
        missing = sorted(MASTER_IDS - ids)
        raise GuardError(f'{path.name}: IDs inválidos; extras={extra}, ausentes={missing}')

    for item in manifest:
        if not isinstance(item, dict):
            raise GuardError(f'{path.name}: entrada não é objeto')
        pid = str(item.get('id', ''))
        url = str(item.get('url', ''))
        if pid.startswith('th_') or '/generated/' in url:
            raise GuardError(f'{path.name}: filho gerado vazou para o manifesto: {pid}')
        m = re.fullmatch(r'translatorhell_master_([a-z]{2})', pid)
        if not m or m.group(1) not in LANGS:
            raise GuardError(f'{path.name}: ID não permitido: {pid}')
        expected_name = f'translatorHellMaster_{m.group(1)}.js'
        if not url.endswith('/.js/src/plugins/multi/' + expected_name) and not url.endswith('/.js/src/plugins/multi/' + expected_name):
            # URLs in this project normally omit the slash before .js after host,
            # so endswith is the relevant invariant.
            if not url.endswith('/.js/src/plugins/multi/' + expected_name):
                raise GuardError(f'{path.name}: URL de Master inesperada para {pid}: {url}')


def verify_webroot(webroot: Path) -> None:
    webroot = webroot.resolve()
    _assert_no_generated_artifacts(webroot)
    _assert_master_plugin_tree(webroot)
    _assert_manifest(webroot / '.dist/plugins.json', webroot)
    _assert_manifest(webroot / '.dist/plugins.min.json', webroot)


def verify_package(root: Path) -> None:
    root = root.resolve()
    webroot = root / 'lnreader-prebuilt'
    if not webroot.is_dir():
        raise GuardError(f'lnreader-prebuilt ausente em {root}')
    _assert_empty_runtime_state(root)
    verify_webroot(webroot)


def main() -> int:
    ap = argparse.ArgumentParser(description='Bloqueia releases que incluam plugins/filhos/dados locais.')
    group = ap.add_mutually_exclusive_group()
    group.add_argument('--package', metavar='ROOT', help='raiz completa da Factory (default: projeto atual)')
    group.add_argument('--webroot', metavar='ROOT', help='webroot exportado (.dist/.js/public)')
    args = ap.parse_args()

    try:
        if args.webroot:
            verify_webroot(Path(args.webroot))
            target = Path(args.webroot).resolve()
        else:
            target = Path(args.package).resolve() if args.package else Path(__file__).resolve().parent.parent
            verify_package(target)
    except GuardError as exc:
        print(f'[distribution-guard] FALHOU: {exc}', file=sys.stderr)
        return 2

    print(f'[distribution-guard] OK: {target}')
    print('[distribution-guard] 15 Masters apenas; nenhum filho/plugin oficial/perfil/chave distribuído.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
