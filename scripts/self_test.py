#!/usr/bin/env python3
import importlib.util
import json
import shutil
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('factory_server_test', ROOT / 'scripts' / 'factory_server.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)
M.urlopen = lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError('network disabled in self-test'))

assert len(M.LANGUAGES) == 15
assert M.domain_label('m.zongheng.com') == 'Zongheng'
assert M.domain_label('t.shuqi.com') == 'Shuqi'
assert M.domain_label('www.exemplo.com.br') == 'Exemplo'
assert M.domain_label('reader.foo.co.uk') == 'Foo'

# Test fallback without network.
_original_read_credentials = M.read_credentials
M.read_credentials = lambda: {
    'keys': {'pollinations': 'x', 'groq': 'y'},
    'models': {},
    'order': ['pollinations', 'groq'],
}
seen = []
def fake_ai(provider, key, model, text, target):
    seen.append(provider)
    if provider == 'pollinations':
        raise RuntimeError('simulated outage')
    return 'AI:' + text
M.ai_translate = fake_ai
M.google_translate = lambda text, lang: 'GOOGLE:' + text
value, provider = M.translate_with_fallback('abc', 'pt', 'Português')
assert value == 'AI:abc' and provider == 'groq'
assert seen == ['pollinations', 'groq']

M.PROVIDER_HEALTH.clear()
M.ai_translate = lambda *a, **k: (_ for _ in ()).throw(RuntimeError('all down'))
value, provider = M.translate_with_fallback('abc', 'pt', 'Português')
assert value == 'GOOGLE:abc' and provider == 'google'
M.read_credentials = _original_read_credentials

# Test manifest/child generation in an isolated temp tree without touching user data.
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    M.DATA_DIR = td / 'factory-data'
    M.PROFILES_FILE = M.DATA_DIR / 'profiles.json'
    M.CHILDREN_FILE = M.DATA_DIR / 'children.json'
    M.CREDENTIALS_FILE = M.DATA_DIR / 'credentials.json'
    M.WEBROOT = td / 'webroot'
    M.TEMPLATE = ROOT / 'factory-templates' / 'runtime.template.js'
    M.MASTER_ICON = ROOT / 'lnreader-prebuilt' / ('public/static/' + M.MASTER_ICON_REL)
    M.BASE_URL = 'http://127.0.0.1:8765'
    M.save_json(M.PROFILES_FILE, {})
    M.save_json(M.CHILDREN_FILE, [])
    M.save_credentials({'keys': {'pollinations':'LOCAL_SECRET'}, 'models': {}, 'order': ['pollinations']})
    manifest = M.rebuild_manifest()
    assert len(manifest) == 15
    # Repository BYOK parameters are case-insensitive and can be combined.
    M.capture_repository_options('p=LOWER_P&Z=UPPER_Z&h=lower_h&G=UPPER_G')
    byok = M.read_credentials()['keys']
    assert byok['pollinations'] == 'LOWER_P'
    assert byok['zai'] == 'UPPER_Z'
    assert byok['bigmodel'] == 'lower_h'
    assert byok['groq'] == 'UPPER_G'

    assert all(x['name'] == 'Factory - Ance' for x in manifest)
    assert all(x['version'] == '0.8.8' for x in manifest)
    profile, created = M.register_profile({
        'host': 'm.zongheng.com',
        'origin': 'https://m.zongheng.com',
        'seedUrl': 'https://m.zongheng.com/book/1',
        'selectors': {'summary': '.intro'},
        'protection': {'cloudflare': True, 'challenge': False, 'lastStatus': 200},
    }, 'pt', 'master')
    assert created is True
    # Same factory command in the render debounce window is idempotent.
    profile2, created2 = M.register_profile({'host':'m.zongheng.com','origin':'https://m.zongheng.com'}, 'pt', 'master')
    assert created2 is False
    manifest = json.loads((M.WEBROOT / '.dist/plugins.min.json').read_text('utf-8'))
    children = [x for x in manifest if x['id'].startswith('th_')]
    assert len(children) == 1
    assert children[0]['name'] == 'Zongheng'
    assert children[0]['lang'] == 'Português'
    assert children[0]['version'] == '0.1'
    assert '/public/static/src/generated/readers/pt/' in children[0]['customJS']
    assert children[0]['customCSS'].endswith('/readerRuntime.css')
    child_js = (M.WEBROOT / '.js/src/plugins/generated/pt/m_zongheng_com.js').read_text('utf-8')
    assert 'targetLanguage":"pt"' in child_js
    assert 'LOWER_P' in child_js and 'UPPER_G' in child_js  # local-only BYOK snapshot
    assert '"cloudflare":true' in child_js
    assert '"profile":{"host":"m.zongheng.com"' in child_js
    assert '"selectors":{"summary":".intro"}' in child_js
    assert "if (this.mode === 'master')\n            return [];" in child_js or "this.mode === 'master'" in child_js

    # Novel-specific catalog routes are merged independently and the legacy
    # host-wide catalogUrl/novelUrl fields are removed.
    route_a = 'translatorhell_master_pt|https://m.zongheng.com/book/1'
    route_b = 'translatorhell_master_pt|https://m.zongheng.com/book/2'
    merged_routes = M.deep_merge_profile(
        {'host':'m.zongheng.com','catalogUrl':'https://m.zongheng.com/book/OLD/list','novelRoutes':{route_a:{'novelUrl':'https://m.zongheng.com/book/1','catalogUrl':'https://m.zongheng.com/book/1/list','updatedAt':1}}},
        {'host':'m.zongheng.com','novelUrl':'https://m.zongheng.com/book/2','catalogUrl':'https://m.zongheng.com/book/2/list','novelRoutes':{route_b:{'novelUrl':'https://m.zongheng.com/book/2','catalogUrl':'https://m.zongheng.com/book/2/list','updatedAt':2}}},
    )
    assert 'catalogUrl' not in merged_routes and 'novelUrl' not in merged_routes
    assert merged_routes['novelRoutes'][route_a]['catalogUrl'].endswith('/book/1/list')
    assert merged_routes['novelRoutes'][route_b]['catalogUrl'].endswith('/book/2/list')

    # v0.8.0 — icon candidates learned from the page are merged, deduplicated and
    # attempted synchronously before the fallback badge can be published.
    icon_profile = M.deep_merge_profile(
        {'host':'icons.example','siteIconCandidates':['https://icons.example/a.png']},
        {'host':'icons.example','siteIconCandidates':['https://icons.example/a.png','https://icons.example/touch.png'], 'siteIconUrl':'https://icons.example/favicon.ico'},
    )
    assert icon_profile['siteIconCandidates'] == ['https://icons.example/a.png','https://icons.example/touch.png']
    real_download_icon = M._download_icon_candidate
    real_save_icon = M._save_icon_png
    calls = []
    def fake_download_icon(profile, icon_url, timeout=0):
        calls.append(icon_url)
        if icon_url.endswith('/touch.png'):
            return (b'PNGTEST', 'image/png', icon_url)
        return None
    def fake_save_icon(icon_dir, data, content_type='', final_url=''):
        if data != b'PNGTEST':
            return False
        icon_dir.mkdir(parents=True, exist_ok=True)
        (icon_dir / 'icon.png').write_bytes(data)
        try: (icon_dir / '.fallback').unlink()
        except Exception: pass
        return True
    M._download_icon_candidate = fake_download_icon
    M._save_icon_png = fake_save_icon
    rel_icon = M.ensure_site_icon(icon_profile)
    M._download_icon_candidate = real_download_icon
    M._save_icon_png = real_save_icon
    assert rel_icon.endswith('/icons_example/icon.png')
    assert set(calls) >= {'https://icons.example/favicon.ico','https://icons.example/a.png','https://icons.example/touch.png'}

    # v0.8.2 — mobile subdomains frequently expose no usable declared icon. The
    # bounded install-time pool must include the resolver/apex candidates BEFORE
    # low-value guessed size variants, otherwise the child gets permanently installed
    # with the fallback badge. Prove that a resolver-only success is reached.
    icon_profile_082 = {'host':'t.mobile-icons.example','origin':'https://t.mobile-icons.example','seedUrl':'https://t.mobile-icons.example/'}
    calls_082 = []
    def fake_download_icon_082(profile, icon_url, timeout=0):
        calls_082.append(icon_url)
        if 'google.com/s2/favicons' in icon_url:
            return (b'PNG082', 'image/png', icon_url)
        return None
    def fake_save_icon_082(icon_dir, data, content_type='', final_url=''):
        if data != b'PNG082': return False
        icon_dir.mkdir(parents=True, exist_ok=True)
        (icon_dir / 'icon.png').write_bytes(data)
        try: (icon_dir / '.fallback').unlink()
        except Exception: pass
        return True
    M._download_icon_candidate = fake_download_icon_082
    M._save_icon_png = fake_save_icon_082
    rel_icon_082 = M.ensure_site_icon(icon_profile_082)
    M._download_icon_candidate = real_download_icon
    M._save_icon_png = real_save_icon
    assert rel_icon_082.endswith('/t_mobile_icons_example/icon.png')
    assert any('google.com/s2/favicons' in x for x in calls_082), calls_082

    reader_js = (M.WEBROOT / 'public/static/src/generated/readers/pt/m_zongheng_com.js').read_text('utf-8')
    assert '/api/factory/translate' in reader_js
    assert 'dblclick' in reader_js and 'pointerup' in reader_js
    assert 'targetLanguage":"pt"' in reader_js

    # Transient-install bridge: the generated child is advertised until LNReader
    # downloads its JS. Afterwards it disappears from the repo while its local JS
    # file remains available for the app's internal plugin storage.
    assert M.mark_child_delivered('/.js/src/plugins/generated/pt/m_zongheng_com.js') is True
    manifest_after = json.loads((M.WEBROOT / '.dist/plugins.min.json').read_text('utf-8'))
    assert not [x for x in manifest_after if x['id'].startswith('th_')]
    assert (M.WEBROOT / '.js/src/plugins/generated/pt/m_zongheng_com.js').exists()
    state = M.read_children()[0]
    assert state['state'] == 'delivered' and state['deliveryCount'] == 1

    # Re-teaching the same DNS republishes it with a newer local child version.
    M.add_child('m.zongheng.com', 'pt')
    manifest_republished = M.rebuild_manifest()
    child2 = [x for x in manifest_republished if x['id'].startswith('th_')][0]
    assert child2['version'] == '0.2'

    # v0.7.7 — a cross-language WooCommerce architecture profile must survive
    # generation intact so the child can take the product-detail fast path.
    nova_profile, nova_created = M.register_profile({
        'host': 'novelasligeras.net',
        'origin': 'https://novelasligeras.net',
        'seedUrl': 'https://novelasligeras.net/',
        'listingUrls': ['https://novelasligeras.net/index.php/lista-de-novela-ligera-novela-web/'],
        'browseAdapter': 'woocommerce',
        'paginationMode': 'wordpress-path',
        'novelAdapter': 'woocommerce-product',
        'selectors': {},
    }, 'zh', 'master')
    assert nova_created is True
    nova_js = (M.WEBROOT / '.js/src/plugins/generated/zh/novelasligeras_net.js').read_text('utf-8')
    assert '"targetLanguage":"zh-CN"' in nova_js
    assert '"browseAdapter":"woocommerce"' in nova_js
    assert '"novelAdapter":"woocommerce-product"' in nova_js
    assert 'extractWooCommerceChapters' in nova_js and 'extractImageUrl' in nova_js

public = M.public_master_manifest('https://raw.githubusercontent.com/user/repo/plugins/v3.0.0')
assert len(public) == 15 and all(not x['id'].startswith('th_') for x in public)
assert 'LOCAL_SECRET' not in json.dumps(public)

server_src = (ROOT / 'scripts' / 'factory_server.py').read_text('utf-8')
assert "'/api/factory/debug'" in server_src
assert 'except (BrokenPipeError, ConnectionResetError)' in server_src
# BrokenPipe must be treated as normal client cancellation, not as an exception
# that triggers a second JSON response/traceback.
class _BrokenWriter:
    def write(self, _data):
        raise BrokenPipeError(32, 'simulated client gone')
h = M.Handler.__new__(M.Handler)
h.wfile = _BrokenWriter()
h.command = 'POST'
h.path = '/api/factory/register'
h.send_response = lambda *_a, **_k: None
h.send_header = lambda *_a, **_k: None
h.end_headers = lambda *_a, **_k: None
assert h.json_response(200, {'ok': True}) is False

# v0.7.9 — release guard: the official LNReader plugin corpus is reference-only.
GUARD_SPEC = importlib.util.spec_from_file_location('factory_distribution_guard_test', ROOT / 'scripts' / 'distribution_guard.py')
GUARD = importlib.util.module_from_spec(GUARD_SPEC)
GUARD_SPEC.loader.exec_module(GUARD)
GUARD.verify_package(ROOT)

# A copied official/reference plugin must fail the release immediately.
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    shutil.copytree(ROOT / 'lnreader-prebuilt', td / 'lnreader-prebuilt')
    (td / 'factory-data').mkdir()  # Empty isolated state; no developer data required.
    leaked = td / 'lnreader-prebuilt/.js/src/plugins/english/NOVA.js'
    leaked.parent.mkdir(parents=True, exist_ok=True)
    leaked.write_text('// reference plugin accidentally copied', 'utf-8')
    try:
        GUARD.verify_package(td)
        raise AssertionError('distribution guard accepted a non-Master plugin')
    except GUARD.GuardError:
        pass

# Local generated state is valid at runtime, but forbidden in a release ZIP.
with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    shutil.copytree(ROOT / 'lnreader-prebuilt', td / 'lnreader-prebuilt')
    (td / 'factory-data').mkdir()  # Empty isolated state; no developer data required.
    (td / 'factory-data/children.json').write_text('[{"host":"example.org"}]', 'utf-8')
    try:
        GUARD.verify_package(td)
        raise AssertionError('distribution guard accepted a pre-generated child')
    except GUARD.GuardError:
        pass

print(f'OK — Factory {M.VERSION}: Shuqi, isolamento por obra, ícones e distribuição validados.')
