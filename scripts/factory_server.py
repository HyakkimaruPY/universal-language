#!/usr/bin/env python3
import argparse
import hashlib
import io
import http.server
import io
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import socketserver
import threading
import time
import sys
from urllib.parse import parse_qs, parse_qsl, quote_plus, urlparse, urljoin
from urllib.request import Request, urlopen
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED

ROOT = Path(__file__).resolve().parent.parent
WEBROOT = ROOT / 'lnreader-prebuilt'
TEMPLATE = ROOT / 'factory-templates' / 'runtime.template.js'
DATA_DIR = ROOT / 'factory-data'
PROFILES_FILE = DATA_DIR / 'profiles.json'
CHILDREN_FILE = DATA_DIR / 'children.json'
CREDENTIALS_FILE = DATA_DIR / 'credentials.json'
MASTER_ICON_REL = 'src/multi/translatorhell/factory_ance_v072.png'
MASTER_ICON = WEBROOT / ('public/static/' + MASTER_ICON_REL)
VERSION = '0.8.8'
MASTER_NAME = 'Factory - Ance'
PROJECT_GITHUB = os.environ.get('TH_FACTORY_GITHUB', '').strip()
LNREADER_GITHUB = 'https://github.com/lnreader/lnreader'

LANGUAGES = {
    'id': {'label': 'Bahasa Indonesia', 'manifest': 'Bahasa Indonesia', 'google': 'id'},
    'en': {'label': 'English', 'manifest': 'English', 'google': 'en'},
    'es': {'label': 'Español', 'manifest': 'Español', 'google': 'es'},
    'fr': {'label': 'Français', 'manifest': 'Français', 'google': 'fr'},
    'pl': {'label': 'Polski', 'manifest': 'Polski', 'google': 'pl'},
    'pt': {'label': 'Português', 'manifest': 'Português', 'google': 'pt'},
    'vi': {'label': 'Tiếng Việt', 'manifest': 'Tiếng Việt', 'google': 'vi'},
    'tr': {'label': 'Türkçe', 'manifest': 'Türkçe', 'google': 'tr'},
    'ru': {'label': 'Русский', 'manifest': 'Русский', 'google': 'ru'},
    'uk': {'label': 'Українська', 'manifest': 'Українська', 'google': 'uk'},
    'ar': {'label': 'العربية', 'manifest': '\u200eالعربية', 'google': 'ar'},
    'th': {'label': 'ไทย', 'manifest': 'ไทย', 'google': 'th'},
    'zh': {'label': '中文', 'manifest': '中文, 汉语, 漢語', 'google': 'zh-CN'},
    'ja': {'label': '日本語', 'manifest': '日本語', 'google': 'ja'},
    'ko': {'label': '한국어', 'manifest': '조선말, 한국어', 'google': 'ko'},
}

LOCK = threading.RLock()
ICON_LOCK = threading.RLock()
ICON_REFRESHING = set()
PORT = 8765
BASE_URL = 'http://127.0.0.1:8765'

PROVIDERS = {
    'pollinations': {
        'short': 'P', 'label': 'Pollinations',
        'url': 'https://gen.pollinations.ai/v1/chat/completions',
        'model': 'nova-fast',
    },
    'zai': {
        'short': 'Z', 'label': 'Z.AI',
        'url': 'https://api.z.ai/api/paas/v4/chat/completions',
        'model': 'glm-4.7-flash',
    },
    'bigmodel': {
        'short': 'B', 'label': 'BigModel',
        'url': 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        'model': 'glm-4.7-flash',
    },
    'groq': {
        'short': 'G', 'label': 'Groq',
        'url': 'https://api.groq.com/openai/v1/chat/completions',
        'model': 'openai/gpt-oss-20b',
    },
}
PROVIDER_BY_SHORT = {v['short']: k for k, v in PROVIDERS.items()}
PROVIDER_BY_SHORT['H'] = 'bigmodel'
PROVIDER_ALIASES = {
    'P': 'pollinations', 'PKEY': 'pollinations', 'KEYP': 'pollinations', 'POLLINATIONS': 'pollinations',
    'Z': 'zai', 'ZKEY': 'zai', 'KEYZ': 'zai', 'ZAI': 'zai',
    'H': 'bigmodel', 'B': 'bigmodel', 'HKEY': 'bigmodel', 'BKEY': 'bigmodel', 'KEYH': 'bigmodel',
    'HEIA': 'bigmodel', 'BIGMODEL': 'bigmodel',
    'G': 'groq', 'GKEY': 'groq', 'KEYG': 'groq', 'GROQ': 'groq',
}
PROVIDER_HEALTH = {}


def load_json(path, default):
    try:
        return json.loads(path.read_text('utf-8'))
    except Exception:
        return default


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), 'utf-8')
    tmp.replace(path)


def slugify(value):
    value = str(value or '').lower().strip()
    value = re.sub(r'^https?://', '', value)
    value = re.sub(r'[^a-z0-9]+', '_', value).strip('_')
    return value[:64] or 'site'


def normalize_host(host):
    host = str(host or '').lower().strip().rstrip('.')
    host = re.sub(r':\d+$', '', host)
    return host


def domain_label(host):
    raw = normalize_host(host)
    parts = [x for x in raw.split('.') if x]
    while len(parts) > 2 and re.match(r'^(www\d*|m|mobile|wap|touch|t|read|reader|app)$', parts[0], re.I):
        parts.pop(0)
    two_level_suffixes = {
        'co.uk','org.uk','com.br','com.cn','com.tw','com.hk','com.au','com.sg','co.jp','co.kr',
        'com.tr','com.ua','co.id','com.vn','co.th','com.mx','com.ar','com.co','com.pe','com.my','co.nz',
    }
    key = parts[0] if parts else (raw or 'site')
    if len(parts) >= 2:
        suffix2 = '.'.join(parts[-2:])
        key = parts[-3] if suffix2 in two_level_suffixes and len(parts) >= 3 else parts[-2]
    key = re.sub(r'^xn--', '', key, flags=re.I)
    key = re.sub(r'[-_]+', ' ', key).strip() or raw or 'site'
    return ' '.join(x[:1].upper() + x[1:] for x in key.split())


def deep_merge_profile(old, new):
    out = dict(old or {})
    for k, v in (new or {}).items():
        if v in (None, '', [], {}):
            continue
        if k == 'selectors':
            out[k] = {**(out.get(k) or {}), **v}
        elif k in {'searchTemplates', 'listingUrls', 'siteIconCandidates'}:
            seen = []
            for x in [*(out.get(k) or []), *v]:
                if x and x not in seen:
                    seen.append(x)
            out[k] = seen[:16]
        elif k == 'novelRoutes':
            routes = dict(out.get(k) or {})
            for route_key, route_value in (v or {}).items():
                if not route_key or not isinstance(route_value, dict):
                    continue
                routes[str(route_key)] = {**(routes.get(str(route_key)) or {}), **route_value}
            # Keep recent per-novel routes bounded. These routes are deliberately
            # not host-wide defaults: each key identifies exactly one work.
            ordered = sorted(routes.items(), key=lambda item: int((item[1] or {}).get('updatedAt') or 0), reverse=True)[:160]
            out[k] = dict(ordered)
        elif k == 'filterDefinitions':
            merged_filters = {}
            for item in [*(out.get(k) or []), *v]:
                if not isinstance(item, dict):
                    continue
                key = str(item.get('key') or '').strip()
                if not key:
                    continue
                merged_filters[key] = {**merged_filters.get(key, {}), **item}
            out[k] = list(merged_filters.values())[:16]
        else:
            out[k] = v
    # v0.7.3 legacy fields were host-wide and could leak novel A's catalog
    # into novel B on the same domain. Novel-specific routes now live only under
    # novelRoutes[plugin+canonicalNovelUrl].
    out.pop('novelUrl', None)
    out.pop('catalogUrl', None)
    host = normalize_host(out.get('host'))
    if host:
        out['host'] = host
        out['siteName'] = domain_label(host)
        if not out.get('origin'):
            out['origin'] = 'https://' + host
    now = int(time.time() * 1000)
    out['createdAt'] = int((old or {}).get('createdAt') or now)
    out['updatedAt'] = now
    return out


def read_profiles():
    raw = load_json(PROFILES_FILE, {})
    return raw if isinstance(raw, dict) else {}


def read_children():
    raw = load_json(CHILDREN_FILE, [])
    return raw if isinstance(raw, list) else []


def read_credentials():
    raw = load_json(CREDENTIALS_FILE, {})
    if not isinstance(raw, dict):
        raw = {}
    raw.setdefault('keys', {})
    raw.setdefault('models', {})
    raw.setdefault('order', [])
    return raw


def save_credentials(value):
    save_json(CREDENTIALS_FILE, value)
    try:
        os.chmod(CREDENTIALS_FILE, 0o600)
    except Exception:
        pass


def provider_public_status():
    cfg = read_credentials()
    return {
        'configured': [p for p in cfg.get('order', []) if cfg.get('keys', {}).get(p)],
        'models': {p: cfg.get('models', {}).get(p) or PROVIDERS[p]['model'] for p in PROVIDERS},
        'googleFallback': True,
    }


def provider_runtime_config():
    """Return BYOK credentials only to the local LNReader plugin runtime.

    Keys are never written into manifests or generated plugin files.
    """
    cfg = read_credentials()
    keys = cfg.get('keys') or {}
    models = cfg.get('models') or {}
    mapping = [
        ('P', 'pollinations'),
        ('Z', 'zai'),
        ('H', 'bigmodel'),
        ('G', 'groq'),
    ]
    providers = {}
    for short, provider in mapping:
        key = str(keys.get(provider) or '').strip()
        if not key:
            continue
        spec = PROVIDERS[provider]
        providers[short] = {
            'label': spec['label'],
            'url': spec['url'],
            'model': models.get(provider) or spec['model'],
            'key': key,
        }
    return {'providers': providers, 'googleFallback': True}


def capture_repository_options(query):
    pairs = parse_qsl(query or '', keep_blank_values=True)
    if not pairs:
        return False
    cfg = read_credentials()
    keys = dict(cfg.get('keys') or {})
    models = dict(cfg.get('models') or {})
    order = [p for p in cfg.get('order', []) if p in PROVIDERS]
    changed = False
    reset = False
    for raw_key, raw_value in pairs:
        k = re.sub(r'[^A-Z0-9]', '', str(raw_key or '').strip().upper())
        v = str(raw_value or '').strip()
        if k in {'RESET', 'CLEAR'} and v.lower() not in {'', '0', 'false', 'no'}:
            reset = True
            continue
        provider = PROVIDER_ALIASES.get(k) or PROVIDER_BY_SHORT.get(k)
        if provider:
            changed = True
            if v:
                keys[provider] = v
                if provider in order:
                    order.remove(provider)
                order.append(provider)
            else:
                keys.pop(provider, None)
                if provider in order:
                    order.remove(provider)
            continue
        if k.endswith('M') and len(k) >= 2:
            base_key = k[:-1]
            provider = PROVIDER_ALIASES.get(base_key) or PROVIDER_BY_SHORT.get(base_key)
            if provider:
                changed = True
                if v:
                    models[provider] = v
                else:
                    models.pop(provider, None)
    if reset:
        save_credentials({'keys': {}, 'models': {}, 'order': [], 'updatedAt': int(time.time() * 1000)})
        print('[factory] Chaves locais removidas; Google-only.', flush=True)
        try:
            rebuild_manifest()
        except Exception:
            pass
        return True
    if changed:
        cfg = {
            'keys': keys,
            'models': models,
            'order': [p for p in order if keys.get(p)],
            'updatedAt': int(time.time() * 1000),
        }
        save_credentials(cfg)
        labels = [PROVIDERS[p]['label'] for p in cfg['order']]
        print('[factory] Provedores locais: ' + (', '.join(labels) if labels else 'somente Google'), flush=True)
        # Regenerate LOCAL masters/children so installed JS can carry a private
        # on-device credential snapshot. Nothing is pushed anywhere.
        try:
            rebuild_manifest()
        except Exception:
            pass
        return True
    return False


def request_json(url, payload, headers=None, timeout=45):
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    req = Request(url, data=data, method='POST', headers={
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Factory-Ance-LNReader/0.8.2',
        **(headers or {}),
    })
    with urlopen(req, timeout=timeout) as r:
        raw = r.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024:
            raise RuntimeError('resposta da IA excedeu o limite')
        return json.loads(raw.decode('utf-8'))


def audit_translation(source, target):
    s = re.sub(r'\s+', ' ', str(source or '')).strip()
    t = re.sub(r'\s+', ' ', str(target or '')).strip()
    if not t:
        return False
    if len(s) > 100 and len(t) < len(s) * 0.12:
        return False
    if len(s) > 60 and len(t) > len(s) * 8:
        return False
    return True



def needs_translation_repair(source, target, target_language):
    s = re.sub(r'\s+', ' ', str(source or '')).strip()
    t = re.sub(r'\s+', ' ', str(target or '')).strip()
    if not audit_translation(s, t):
        return True
    if len(s) > 20 and s == t:
        return True
    if re.search(r"\b(?:i cannot|i can't|cannot comply|as an ai|here is the translation|translation:)\b", t, re.I):
        return True
    if not re.match(r'^(zh|ja|ko)', str(target_language or '').lower()):
        hs = len(re.findall(r'[\u3400-\u9fff]', s))
        ht = len(re.findall(r'[\u3400-\u9fff]', t))
        if hs >= 4 and ht >= max(3, int(hs * 0.08)):
            return True
    return False


def ai_repair(provider, key, model, source, candidate, target_label):
    spec = PROVIDERS[provider]
    prompt = (
        f'Review the candidate literary translation against the original and return ONLY a corrected version in {target_label}. '
        'Translate any leftover source-language fragments. Preserve names, numbers, punctuation, dialogue and meaning. No explanations.'
    )
    payload = {
        'model': model or spec['model'],
        'messages': [
            {'role': 'system', 'content': prompt},
            {'role': 'user', 'content': f'ORIGINAL:\n{source}\n\nCANDIDATE:\n{candidate}'},
        ],
        'temperature': 0.1,
        'stream': False,
    }
    data = request_json(spec['url'], payload, headers={'Authorization': 'Bearer ' + key})
    try:
        value = data['choices'][0]['message']['content']
    except Exception:
        value = ''
    if isinstance(value, list):
        value = ''.join(str(x.get('text') or x.get('content') or '') if isinstance(x, dict) else str(x) for x in value)
    value = str(value or '').strip()
    if not audit_translation(source, value):
        raise RuntimeError(f'{spec["label"]} retornou revisão inválida')
    return value

def ai_translate(provider, key, model, text, target_label):
    spec = PROVIDERS[provider]
    prompt = (
        f'Translate the user text faithfully into {target_label}. '
        'Return only the translated text. Do not summarize, explain, censor, or add notes. '
        'Preserve names, numbers, punctuation, dialogue markers and paragraph meaning.'
    )
    payload = {
        'model': model or spec['model'],
        'messages': [
            {'role': 'system', 'content': prompt},
            {'role': 'user', 'content': text},
        ],
        'temperature': 0.15,
        'stream': False,
    }
    data = request_json(spec['url'], payload, headers={'Authorization': 'Bearer ' + key})
    try:
        value = data['choices'][0]['message']['content']
    except Exception:
        value = ''
    if isinstance(value, list):
        value = ''.join(str(x.get('text') or x.get('content') or '') if isinstance(x, dict) else str(x) for x in value)
    value = str(value or '').strip()
    if not audit_translation(text, value):
        raise RuntimeError(f'{spec["label"]} retornou tradução inválida')
    return value


def translation_error_code(error):
    # Never include request URLs, credentials or source text in diagnostics.
    status = getattr(error, 'code', None)
    if isinstance(status, int):
        return 'HTTP_' + str(status)
    if isinstance(error, (TimeoutError,)):
        return 'TIMEOUT'
    if isinstance(error, (ValueError, KeyError, IndexError)):
        return 'INVALID_RESPONSE'
    return type(error).__name__


def google_translate(text, target_language):
    source = str(text or '')
    if not source.strip():
        return source
    # Bound encoded GET size too: CJK characters occupy nine URL bytes each.
    chunks, chunk, size = [], '', 0
    for char in source:
        cost = len(quote_plus(char))
        if size + cost > 3600 and chunk:
            chunks.append(chunk)
            chunk, size = '', 0
        chunk += char
        size += cost
    if chunk:
        chunks.append(chunk)
    translated = []
    deadline = time.monotonic() + 25
    for chunk in chunks:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Google timeout')
        url = ('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
               quote_plus(str(target_language or 'pt')) + '&dt=t&q=' + quote_plus(chunk))
        req = Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'})
        with urlopen(req, timeout=min(10, remaining)) as response:
            data = json.loads(response.read(4 * 1024 * 1024).decode('utf-8'))
        parts = data[0] if isinstance(data, list) and data else []
        value = ''.join(part[0] for part in parts if isinstance(part, list) and part and isinstance(part[0], str)) if isinstance(parts, list) else ''
        if not audit_translation(chunk, value):
            raise ValueError('invalid Google response')
        translated.append(value)
    return ''.join(translated)


def provider_available(provider):
    state = PROVIDER_HEALTH.get(provider) or {'failures': 0, 'disabledUntil': 0}
    return time.time() >= float(state.get('disabledUntil') or 0)


def provider_success(provider):
    PROVIDER_HEALTH[provider] = {'failures': 0, 'disabledUntil': 0}


def provider_failure(provider):
    state = PROVIDER_HEALTH.get(provider) or {'failures': 0, 'disabledUntil': 0}
    failures = int(state.get('failures') or 0) + 1
    PROVIDER_HEALTH[provider] = {
        'failures': failures,
        'disabledUntil': time.time() + (60 if failures >= 2 else 5),
    }


def translate_with_fallback(text, target_language, target_label, current_translation=None):
    source = str(text or '')
    if not source.strip():
        return source, 'none'
    cfg = read_credentials()
    keys = cfg.get('keys') or {}
    models = cfg.get('models') or {}
    order = [p for p in cfg.get('order', []) if p in PROVIDERS and keys.get(p)]
    errors = []
    for provider in order:
        if not provider_available(provider):
            continue
        try:
            value = (ai_repair(provider, keys[provider], models.get(provider) or PROVIDERS[provider]['model'], source, current_translation, target_label)
                     if current_translation else ai_translate(provider, keys[provider], models.get(provider) or PROVIDERS[provider]['model'], source, target_label))
            if needs_translation_repair(source, value, target_language):
                for reviewer in order:
                    if reviewer == provider or not provider_available(reviewer):
                        continue
                    try:
                        value = ai_repair(reviewer, keys[reviewer], models.get(reviewer) or PROVIDERS[reviewer]['model'], source, value, target_label)
                        provider_success(reviewer)
                        break
                    except Exception:
                        provider_failure(reviewer)
            provider_success(provider)
            return value, provider
        except Exception as e:
            provider_failure(provider)
            errors.append(f'{provider}:{translation_error_code(e)}')
    try:
        return google_translate(source, target_language), 'google'
    except Exception as e:
        errors.append(f'google:{translation_error_code(e)}')
        raise RuntimeError(' | '.join(errors) or 'nenhum tradutor disponível')


def runtime_source(config):
    src = TEMPLATE.read_text('utf-8')
    payload = json.dumps(config, ensure_ascii=False, separators=(',', ':'))
    if '__TH_CONFIG__' not in src:
        raise RuntimeError('runtime.template.js sem __TH_CONFIG__')
    return src.replace('__TH_CONFIG__', payload, 1)


def write_runtime(rel_path, config):
    path = WEBROOT / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(runtime_source(config), 'utf-8')
    return path


def icon_extension(content_type, data, url):
    ct = (content_type or '').split(';', 1)[0].strip().lower()
    mapping = {
        'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg',
        'image/webp': '.webp', 'image/gif': '.gif', 'image/x-icon': '.ico',
        'image/vnd.microsoft.icon': '.ico', 'image/svg+xml': '.svg',
    }
    if ct in mapping:
        return mapping[ct]
    if data.startswith(b'\x89PNG'):
        return '.png'
    if data.startswith(b'\xff\xd8\xff'):
        return '.jpg'
    if data.startswith(b'GIF8'):
        return '.gif'
    if data[:4] in (b'RIFF',):
        return '.webp'
    ext = Path(urlparse(url).path).suffix.lower()
    return ext if ext in {'.png','.jpg','.jpeg','.webp','.gif','.ico','.svg'} else '.png'


def _same_file_bytes(a, b):
    try:
        return a.exists() and b.exists() and a.stat().st_size == b.stat().st_size and hashlib.sha256(a.read_bytes()).digest() == hashlib.sha256(b.read_bytes()).digest()
    except Exception:
        return False


def _http_get(url, *, accept='*/*', referer='', timeout=5, max_bytes=2 * 1024 * 1024):
    req = Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
        'Accept': accept,
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': referer or '',
        'Cache-Control': 'no-cache',
    })
    with urlopen(req, timeout=timeout) as r:
        data = r.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError('resposta grande demais')
        return data, str(r.headers.get('Content-Type') or ''), str(r.geturl() or url)


def _discover_icon_candidates(profile):
    origin = str(profile.get('origin') or '').rstrip('/')
    seed = str(profile.get('seedUrl') or profile.get('novelUrl') or origin or '')
    host = normalize_host(profile.get('host') or (urlparse(origin).hostname if origin else ''))
    candidates = []
    manifest_urls = []

    def add(value):
        value = str(value or '').strip()
        if value and value not in candidates:
            candidates.append(value)

    def add_manifest(value):
        value = str(value or '').strip()
        if value and value not in manifest_urls:
            manifest_urls.append(value)

    # The runtime sends every icon explicitly declared by the source page. These
    # candidates are more reliable than guessing /favicon.ico and avoid installing
    # the fallback badge before an async resolver has finished.
    add(profile.get('siteIconUrl'))
    for value in (profile.get('siteIconCandidates') or []):
        add(value)
    add_manifest(profile.get('siteManifestUrl'))

    for page_url in [seed, origin + '/' if origin else '']:
        if not page_url:
            continue
        try:
            data, ct, final_url = _http_get(
                page_url,
                accept='text/html,application/xhtml+xml,*/*;q=0.8',
                timeout=6,
                max_bytes=900_000,
            )
            if 'html' not in ct.lower() and b'<html' not in data[:8192].lower():
                continue
            html = data.decode('utf-8', 'ignore')
            for tag in re.findall(r'<link\b[^>]*>', html, flags=re.I):
                rel = re.search(r'\brel\s*=\s*["\']([^"\']+)', tag, flags=re.I)
                href = re.search(r'\bhref\s*=\s*["\']([^"\']+)', tag, flags=re.I)
                if not rel or not href:
                    continue
                relv = rel.group(1).lower()
                absolute = urljoin(final_url, href.group(1).strip())
                if any(x in relv for x in ('icon', 'apple-touch-icon')):
                    add(absolute)
                if 'manifest' in relv:
                    add_manifest(absolute)
            # Site-logo metadata is safe; ordinary og:image/twitter:image is NOT:
            # on novel pages those are usually the book cover rather than the site icon.
            for tag in re.findall(r'<meta\b[^>]*>', html, flags=re.I):
                name = re.search(r'\b(?:name|property)\s*=\s*["\']([^"\']+)', tag, flags=re.I)
                content = re.search(r'\bcontent\s*=\s*["\']([^"\']+)', tag, flags=re.I)
                if not name or not content:
                    continue
                key = name.group(1).strip().lower()
                if key in {'msapplication-tileimage', 'og:logo', 'logo'}:
                    add(urljoin(final_url, content.group(1).strip()))
        except Exception:
            pass

    # PWAs often expose one of these conventional manifests even when the initial
    # server-rendered HTML is just a minimal SPA shell.
    if origin:
        for path in ('/manifest.webmanifest', '/site.webmanifest', '/manifest.json', '/manifest.webmanifest.json'):
            add_manifest(origin + path)

    for manifest_url in manifest_urls[:6]:
        try:
            data, _ct, final_url = _http_get(
                manifest_url,
                accept='application/manifest+json,application/json,*/*;q=0.8',
                referer=origin,
                timeout=5,
                max_bytes=500_000,
            )
            obj = json.loads(data.decode('utf-8', 'ignore'))
            icons = obj.get('icons') if isinstance(obj, dict) else []
            if isinstance(icons, list):
                def score(icon):
                    sizes = str((icon or {}).get('sizes') or '')
                    nums = [int(x) for x in re.findall(r'\d+', sizes)] or [0]
                    typ = str((icon or {}).get('type') or '').lower()
                    purpose = str((icon or {}).get('purpose') or '').lower()
                    return max(nums) + (3000 if 'png' in typ else 2200 if 'webp' in typ else 800 if 'icon' in typ else 0) + (100 if 'maskable' in purpose else 0)
                for icon in sorted([x for x in icons if isinstance(x, dict)], key=score, reverse=True):
                    if icon.get('src'):
                        add(urljoin(final_url, str(icon['src'])))
        except Exception:
            pass

    for value in [
        (origin + '/favicon.ico') if origin else None,
        (origin + '/favicon.png') if origin else None,
        (origin + '/favicon-32x32.png') if origin else None,
        (origin + '/favicon-96x96.png') if origin else None,
        (origin + '/apple-touch-icon.png') if origin else None,
        (origin + '/apple-touch-icon-precomposed.png') if origin else None,
        (origin + '/static/favicon.ico') if origin else None,
        (origin + '/static/favicon.png') if origin else None,
        (origin + '/assets/favicon.ico') if origin else None,
        (origin + '/assets/favicon.png') if origin else None,
    ]:
        add(value)

    # Last remote fallback for JS-only/PWA sites whose icon URLs are generated
    # client-side. This returns a PNG favicon, not a screenshot/book cover.
    if host:
        add(f'https://www.google.com/s2/favicons?domain={quote_plus(host)}&sz=128')
    return candidates


def _write_domain_fallback_icon(icon_dir, host):
    # Stable URL: the background resolver later overwrites the same icon.png.
    p = icon_dir / 'icon.png'
    marker = icon_dir / '.fallback'
    try:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new('RGB', (192, 192), (44, 48, 50))
        draw = ImageDraw.Draw(img)
        label = domain_label(host)[:2].upper() or '?'
        try:
            font = ImageFont.load_default(size=64)
        except Exception:
            font = ImageFont.load_default()
        box = draw.textbbox((0, 0), label, font=font)
        x = (192 - (box[2] - box[0])) // 2
        y = (192 - (box[3] - box[1])) // 2
        draw.text((x, y), label, fill=(235, 235, 235), font=font)
        img.save(p, 'PNG')
    except Exception:
        if MASTER_ICON.exists():
            shutil.copy2(MASTER_ICON, p)
        else:
            p.write_bytes(b'')
    try: marker.write_text('fallback', 'utf-8')
    except Exception: pass
    return p


def _save_icon_png(icon_dir, data, content_type='', url=''):
    if not data:
        return False
    # SPAs/PWAs often expose only SVG maskable icons. Rasterize them locally when
    # CairoSVG is available, then continue through the same stable icon.png path.
    if 'svg' in str(content_type or '').lower() or str(url or '').lower().split('?', 1)[0].endswith('.svg') or data.lstrip().startswith(b'<svg'):
        try:
            import cairosvg
            data = cairosvg.svg2png(bytestring=data, output_width=256, output_height=256)
            content_type = 'image/png'
        except Exception:
            pass
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as im:
            if getattr(im, 'n_frames', 1) > 1:
                try: im.seek(0)
                except Exception: pass
            im = im.convert('RGBA')
            # Keep icons compact but crisp enough for the LNReader plugin list.
            im.thumbnail((512, 512))
            canvas = Image.new('RGBA', im.size, (0, 0, 0, 0))
            canvas.alpha_composite(im)
            canvas.save(icon_dir / 'icon.png', 'PNG', optimize=True)
        try: (icon_dir / '.fallback').unlink()
        except Exception: pass
        # Remove legacy differently-named icon files to keep one stable path.
        for old in icon_dir.glob('icon.*'):
            if old.name != 'icon.png':
                try: old.unlink()
                except Exception: pass
        return True
    except Exception:
        return False


def _download_icon_candidate(profile, icon_url, timeout=2.5):
    """Download only; saving is deliberately serialized by the caller.

    v0.8.1 resolves declared icons concurrently so /register cannot spend ~5x the
    socket timeout walking dead favicon URLs. Worker threads never write icon.png,
    avoiding races between candidates.
    """
    origin = str(profile.get('origin') or '').rstrip('/')
    try:
        icon_host = normalize_host(urlparse(str(icon_url or '')).hostname or '')
        page_host = normalize_host(profile.get('host') or (urlparse(origin).hostname if origin else ''))
        # Third-party favicon resolvers/CDNs may reject an unrelated Referer. Keep
        # it only for same-site icon requests; the browser-like UA is sufficient for
        # Google S2 and other resolver endpoints.
        same_site = bool(icon_host and page_host and (icon_host == page_host or icon_host.endswith('.' + page_host) or page_host.endswith('.' + icon_host)))
        return _http_get(
            icon_url,
            accept='image/avif,image/webp,image/apng,image/png,image/jpeg,image/x-icon,image/*,*/*;q=0.8',
            referer=origin if same_site else '',
            timeout=timeout,
            max_bytes=2 * 1024 * 1024,
        )
    except Exception:
        return None


def _fetch_and_save_icon(profile, icon_dir, icon_url, timeout=2.5):
    result = _download_icon_candidate(profile, icon_url, timeout=timeout)
    if not result:
        return False
    data, content_type, final_url = result
    return _save_icon_png(icon_dir, data, content_type, final_url)


def _refresh_site_icon_background(profile, icon_dir, slug):
    try:
        for icon_url in _discover_icon_candidates(profile):
            if _fetch_and_save_icon(profile, icon_dir, icon_url, timeout=3.0):
                break
    finally:
        with ICON_LOCK:
            ICON_REFRESHING.discard(slug)


def ensure_site_icon(profile):
    host = normalize_host(profile.get('host'))
    slug = slugify(host)
    icon_dir = WEBROOT / 'public/static/src/generated/sites' / slug
    icon_dir.mkdir(parents=True, exist_ok=True)
    stable = icon_dir / 'icon.png'
    fallback_marker = icon_dir / '.fallback'

    # A previously-resolved real icon is final until the user recreates/refines the
    # source. A fallback badge is deliberately NOT considered final.
    if stable.exists() and not fallback_marker.exists() and not _same_file_bytes(stable, MASTER_ICON):
        return 'src/generated/sites/%s/icon.png' % slug

    # v0.8.0: resolve declared page icons BEFORE publishing the child. LNReader can
    # cache iconUrl at install time, so replacing icon.png only afterwards is too
    # late. Keep this bounded; deep probing still runs in background as fallback.
    quick = []
    def quick_add(value):
        value = str(value or '').strip()
        if value and value not in quick:
            quick.append(value)
    for value in [profile.get('siteIconUrl'), *(profile.get('siteIconCandidates') or [])]:
        quick_add(value)

    # v0.8.2: a generated child must not depend on a later background refresh to
    # get the actual site icon. Mobile subdomains often omit <link rel=icon> while
    # the apex/www host has it, so try deterministic favicon locations and a favicon
    # resolver *before* publishing the child. These are icon-only endpoints; novel
    # covers/og:image are deliberately excluded.
    origin = str(profile.get('origin') or '').rstrip('/')
    host = normalize_host(profile.get('host') or (urlparse(origin).hostname if origin else ''))
    parts = [x for x in host.split('.') if x]
    if len(parts) >= 3 and len(parts[-1]) == 2 and parts[-2] in {'com','net','org','co','gov','edu'}:
        apex = '.'.join(parts[-3:])
    else:
        apex = '.'.join(parts[-2:]) if len(parts) >= 2 else host
    origins = []
    for candidate_origin in [origin, f'https://{host}' if host else '', f'https://{apex}' if apex else '', f'https://www.{apex}' if apex and not apex.startswith('www.') else '']:
        if candidate_origin and candidate_origin not in origins:
            origins.append(candidate_origin.rstrip('/'))

    # Priority matters because the install-time resolver has a strict wall-clock
    # budget. v0.8.1 appended Google/apex fallbacks after dozens of guessed PNG
    # names and then sliced the pool, so the only candidate that could resolve a
    # mobile subdomain was never attempted. Try the high-value roots/resolver first,
    # then widen to touch/size variants.
    for candidate_origin in origins:
        quick_add(candidate_origin + '/favicon.ico')
    if host:
        quick_add(f'https://www.google.com/s2/favicons?domain={quote_plus(host)}&sz=128')
    if apex and apex != host:
        quick_add(f'https://www.google.com/s2/favicons?domain={quote_plus(apex)}&sz=128')
    for candidate_origin in origins:
        for path in ('/apple-touch-icon.png','/favicon.png','/favicon-96x96.png','/favicon-32x32.png','/apple-touch-icon-precomposed.png'):
            quick_add(candidate_origin + path)

    # Resolve the declared/deterministic candidates concurrently under ONE short wall-clock
    # budget. In v0.8.0 five sequential 0.85s attempts could make /register wait
    # several seconds (the supplied trace showed ~8s). We still prefer the real
    # site icon before publishing, but no single broken candidate can gate install.
    if quick:
        icon_started = time.perf_counter()
        pool = ThreadPoolExecutor(max_workers=min(8, len(quick[:16])), thread_name_prefix='th-icon-quick')
        pending = {
            pool.submit(_download_icon_candidate, dict(profile or {}), icon_url, 1.75): icon_url
            for icon_url in quick[:16]
        }
        deadline = time.perf_counter() + 2.15
        saved = False
        try:
            while pending and time.perf_counter() < deadline and not saved:
                remaining = max(0.0, deadline - time.perf_counter())
                done, _ = wait(set(pending), timeout=remaining, return_when=FIRST_COMPLETED)
                if not done:
                    break
                for fut in done:
                    pending.pop(fut, None)
                    try:
                        result = fut.result()
                    except Exception:
                        result = None
                    if result:
                        data, content_type, final_url = result
                        if _save_icon_png(icon_dir, data, content_type, final_url):
                            saved = True
                            break
        finally:
            for fut in pending:
                fut.cancel()
            pool.shutdown(wait=False, cancel_futures=True)
        elapsed = (time.perf_counter() - icon_started) * 1000.0
        print(f'[perf][server] icon-resolve {elapsed:.1f}ms host={host} candidates={len(quick[:16])} saved={saved}', flush=True)
        if saved:
            return 'src/generated/sites/%s/icon.png' % slug

    # If no declared icon could be saved, publish a DNS-specific local badge while
    # a deeper PWA/common-path resolver continues. This is now the last resort, not
    # the normal installation path.
    if not stable.exists() or not fallback_marker.exists():
        _write_domain_fallback_icon(icon_dir, host)
    with ICON_LOCK:
        if slug not in ICON_REFRESHING:
            ICON_REFRESHING.add(slug)
            threading.Thread(
                target=_refresh_site_icon_background,
                args=(dict(profile or {}), icon_dir, slug),
                daemon=True,
                name=f'th-icon-{slug[:24]}',
            ).start()
    return 'src/generated/sites/%s/icon.png' % slug

def child_key(host, target_key):
    return normalize_host(host) + '|' + target_key


def child_js_rel(host, target_key):
    return f'.js/src/plugins/generated/{target_key}/{slugify(normalize_host(host))}.js'


def child_reader_js_rel(host, target_key):
    return f'public/static/src/generated/readers/{target_key}/{slugify(normalize_host(host))}.js'


def write_child_reader_runtime(profile, target_key, device_mode=False, output_rel=None):
    lang = LANGUAGES[target_key]
    host = normalize_host(profile.get('host'))
    rel = output_rel or child_reader_js_rel(host, target_key)
    path = WEBROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    cfg = json.dumps({
        'factoryBase': '' if device_mode else BASE_URL,
        'targetLanguage': lang['google'],
        'targetLabel': lang['label'],
        'host': host,
    }, ensure_ascii=False, separators=(',', ':'))
    js = r'''(function(){
'use strict';
const C=__CFG__;
const exactNoise=/^(上一章|下一章|上一页|下一页|目录|目錄|返回目录|返回目錄|previous chapter|next chapter|table of contents|contents)$/i;
function clean(root){for(const el of ((root||document).querySelectorAll?.('p,div,span,a')||[])){if(el.children&&el.children.length>0)continue;const t=String(el.textContent||'').replace(/\s+/g,' ').trim();if(t.length<=64&&exactNoise.test(t))el.setAttribute('data-th-noise','1');}document.documentElement?.setAttribute('data-translatorhell-reader','1');}
function targetOf(node){const el=node?.closest?.('#LNReader-chapter p[data-th-original],#LNReader-chapter p,#LNReader-chapter div[data-th-original]');if(!el)return null;const t=String(el.textContent||'').trim();return t.length>=2&&t.length<=6000?el:null;}
function notify(type,data){try{window.ReactNativeWebView?.postMessage(JSON.stringify({type,data}));}catch(_){}}
function message(text){let box=document.getElementById('th-translation-status');if(!box){box=document.createElement('div');box.id='th-translation-status';box.setAttribute('role','status');box.style.cssText='position:fixed;bottom:24px;left:5%;right:5%;padding:12px;background:#222;color:#fff;z-index:2147483647;border-radius:8px;font-size:14px';document.body.appendChild(box);}box.textContent=text;clearTimeout(box.thTimer);box.thTimer=setTimeout(()=>box.remove(),7000);}
const labels=C.targetLanguage==='es'?{busy:'Retraduciendo…',same:'El traductor devolvió el mismo texto.',ok:'Traducción actualizada.',fail:'No se pudo retraducir. El texto anterior se conservó.'}:C.targetLanguage==='pt'?{busy:'Retraduzindo…',same:'O tradutor devolveu o mesmo texto.',ok:'Tradução atualizada.',fail:'Não foi possível retraduzir. O texto anterior foi preservado.'}:{busy:'Retranslating…',same:'The translator returned the same text.',ok:'Translation updated.',fail:'Retranslation failed. Previous text preserved.'};
async function timedFetch(url,init,timeout=30000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);try{const r=await fetch(url,{...init,signal:controller.signal});const d=await r.json();if(!r.ok)throw Error('HTTP '+r.status);return d;}finally{clearTimeout(timer);}}
async function directGoogle(source){const chunks=[];let chunk='',size=0;for(const char of source){const cost=encodeURIComponent(char).length;if(size+cost>3600&&chunk){chunks.push(chunk);chunk='';size=0;}chunk+=char;size+=cost;}if(chunk)chunks.push(chunk);const out=[];const deadline=Date.now()+30000;for(const part of chunks){if(Date.now()>deadline)throw Error('TIMEOUT');const d=await timedFetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='+encodeURIComponent(C.targetLanguage)+'&dt=t&q='+encodeURIComponent(part),{method:'GET'},Math.max(1,deadline-Date.now()));const value=Array.isArray(d?.[0])?d[0].map(x=>typeof x?.[0]==='string'?x[0]:'').join(''):'';if(!value.trim())throw Error('EMPTY_RESPONSE');out.push(value);}return out.join('');}
async function correct(el){if(!el||el.dataset.thBusy==='1')return;const original=String(el.dataset.thOriginal||'').trim();if(!original){message(labels.fail+' (MISSING_ORIGINAL)');return;}el.dataset.thBusy='1';el.classList.add('th-retranslating');const before=String(el.textContent||'').trim();message(labels.busy);try{let value;try{if(!C.factoryBase)throw Error('DEVICE_MODE');const d=await timedFetch(C.factoryBase+'/api/factory/translate',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({text:original,currentTranslation:before,targetLanguage:C.targetLanguage,targetLabel:C.targetLabel,repair:true})});value=String(d?.translation||'').trim();if(!value)throw Error('EMPTY_RESPONSE');}catch(_){value=await directGoogle(original);}if(value.trim()===before){message(labels.same);return;}if(value.trim()===original&&original!==before)throw Error('UNTRANSLATED_RESPONSE');el.textContent=value;el.dataset.thCorrected='1';el.classList.add('th-corrected');message(labels.ok);}catch(error){message(labels.fail+' ('+String(error?.message||'NETWORK_ERROR').slice(0,70)+')');}finally{delete el.dataset.thBusy;el.classList.remove('th-retranslating');}}

document.addEventListener('dblclick',e=>{const el=targetOf(e.target);if(el){e.preventDefault();e.stopPropagation();correct(el);}},true);
let lastEl=null,lastAt=0;document.addEventListener('pointerup',e=>{if(e.pointerType&&e.pointerType!=='touch')return;const el=targetOf(e.target);if(!el){lastEl=null;lastAt=0;return;}const now=Date.now();if(lastEl===el&&now-lastAt<360){e.preventDefault();e.stopPropagation();lastEl=null;lastAt=0;correct(el);}else{lastEl=el;lastAt=now;}},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>clean(document),{once:true});else clean(document);
try{const o=new MutationObserver(rs=>{for(const r of rs)for(const n of r.addedNodes||[])if(n?.nodeType===1)clean(n)});o.observe(document.documentElement||document.body,{childList:true,subtree:true});setTimeout(()=>o.disconnect(),12000);}catch(_){}
})();'''.replace('__CFG__', cfg)
    path.write_text(js, 'utf-8')
    return rel


def increment_child_version(value):
    raw = str(value or '0.1').strip()
    m = re.match(r'^(\d+)\.(\d+)$', raw)
    if not m:
        return '0.1'
    major, minor = int(m.group(1)), int(m.group(2)) + 1
    if minor >= 10:
        major += minor // 10
        minor %= 10
    return f'{major}.{minor}'


def child_version(child):
    # Child versions are deliberately independent from the Factory version.
    return str((child or {}).get('pluginVersion') or '0.1')


def add_child(host, target_key):
    if target_key not in LANGUAGES:
        return False
    host = normalize_host(host)
    children = read_children()
    key = child_key(host, target_key)
    now = int(time.time() * 1000)
    found = False
    changed = False
    for child in children:
        if child_key(child.get('host'), child.get('targetKey')) != key:
            continue
        found = True
        if child.get('state') == 'pending':
            return False
        if child.get('state') == 'delivered':
            # Legacy factories used their own 0.6.x version for children. Publishing
            # such an already-installed child as 0.2 would look like a downgrade to
            # LNReader, so the FIRST manual recreation migrates it to 1.0. New-format
            # children simply advance 0.1 -> 0.2 -> ... -> 0.9 -> 1.0 -> 1.1.
            if child.get('pluginVersion'):
                child['pluginVersion'] = increment_child_version(child.get('pluginVersion'))
            else:
                child['pluginVersion'] = '1.0'
        child['state'] = 'pending'
        child['publishedAt'] = now
        child.pop('deliveredAt', None)
        changed = True
        break
    if not found:
        children.append({
            'host': host, 'targetKey': target_key, 'createdAt': now,
            'publishedAt': now, 'state': 'pending', 'pluginVersion': '0.1',
            'deliveryCount': 0,
        })
        changed = True
    if changed:
        save_json(CHILDREN_FILE, children)
    return changed


def mark_child_delivered(request_path):
    path = str(request_path or '').lstrip('/')
    if not path.startswith('.js/src/plugins/generated/') or not path.endswith('.js'):
        return False
    children = read_children()
    changed = False
    now = int(time.time() * 1000)
    for child in children:
        if child_js_rel(child.get('host'), child.get('targetKey')) != path:
            continue
        if child.get('state') != 'delivered':
            child['state'] = 'delivered'
            child['deliveredAt'] = now
            child['deliveryCount'] = int(child.get('deliveryCount') or 0) + 1
            changed = True
        break
    if changed:
        save_json(CHILDREN_FILE, children)
        # The bytes have already been handed to LNReader. The next repository refresh
        # should stop advertising this child, while LNReader keeps its installed copy.
        rebuild_manifest()
    return changed


def github_repo_from_raw(base_url):
    """Best-effort GitHub project page from a raw.githubusercontent.com base."""
    try:
        u = urlparse(str(base_url or ''))
        if u.hostname == 'raw.githubusercontent.com':
            parts = [x for x in u.path.split('/') if x]
            if len(parts) >= 2:
                return f'https://github.com/{parts[0]}/{parts[1]}'
    except Exception:
        pass
    return ''


def factory_repository_url():
    return PROJECT_GITHUB or github_repo_from_raw(BASE_URL) or LNREADER_GITHUB


def master_description(target_key):
    lang = LANGUAGES.get(target_key, LANGUAGES['en'])
    label = lang['label']
    texts = {
        'id': 'Pabrik plugin lokal untuk LNReader. Mempelajari situs novel, membuat sumber yang dapat dipasang, dan menerjemahkan metadata, katalog, serta bab. Data dan kunci tetap di perangkat.',
        'en': 'Local plugin factory for LNReader. Learns novel sites, creates installable sources, and translates metadata, catalogs, and chapters. Data and keys stay on the device.',
        'es': 'Fábrica local de plugins para LNReader. Aprende sitios de novelas, crea fuentes instalables y traduce metadatos, catálogos y capítulos. Los datos y claves permanecen en el dispositivo.',
        'fr': 'Fabrique locale de plugins pour LNReader. Elle apprend les sites de romans, crée des sources installables et traduit métadonnées, catalogues et chapitres. Données et clés restent sur l’appareil.',
        'pl': 'Lokalna fabryka wtyczek dla LNReader. Uczy się stron z powieściami, tworzy instalowalne źródła i tłumaczy metadane, katalogi oraz rozdziały. Dane i klucze pozostają na urządzeniu.',
        'pt': 'Fábrica local de plugins para o LNReader. Aprende sites de novels, cria fontes instaláveis e traduz metadados, catálogos e capítulos. Dados e chaves permanecem no dispositivo.',
        'vi': 'Nhà máy plugin cục bộ cho LNReader. Tự học trang tiểu thuyết, tạo nguồn có thể cài đặt và dịch siêu dữ liệu, danh mục, chương. Dữ liệu và khóa luôn ở trên thiết bị.',
        'tr': 'LNReader için yerel eklenti fabrikası. Roman sitelerini öğrenir, kurulabilir kaynaklar üretir ve meta verileri, katalogları, bölümleri çevirir. Veriler ve anahtarlar cihazda kalır.',
        'ru': 'Локальная фабрика плагинов для LNReader. Изучает сайты новелл, создаёт устанавливаемые источники и переводит метаданные, каталоги и главы. Данные и ключи остаются на устройстве.',
        'uk': 'Локальна фабрика плагінів для LNReader. Вивчає сайти новел, створює встановлювані джерела та перекладає метадані, каталоги й розділи. Дані та ключі залишаються на пристрої.',
        'ar': 'مصنع إضافات محلي لـ LNReader. يتعلم مواقع الروايات وينشئ مصادر قابلة للتثبيت ويترجم البيانات والفهارس والفصول. تبقى البيانات والمفاتيح على الجهاز.',
        'th': 'โรงงานปลั๊กอินภายในเครื่องสำหรับ LNReader เรียนรู้เว็บนิยาย สร้างแหล่งที่ติดตั้งได้ และแปลข้อมูล แคตตาล็อก และตอนต่าง ๆ โดยข้อมูลและคีย์อยู่บนอุปกรณ์เท่านั้น',
        'zh': 'LNReader 本地插件工厂。自动学习小说网站，生成可安装书源，并翻译作品信息、目录与章节。数据和密钥只保存在设备本地。',
        'ja': 'LNReader 用のローカルプラグイン工場。小説サイトを学習してインストール可能なソースを生成し、作品情報・目次・章を翻訳します。データとキーは端末内に保持されます。',
        'ko': 'LNReader용 로컬 플러그인 팩토리입니다. 소설 사이트를 학습해 설치 가능한 소스를 만들고 메타데이터, 목차, 챕터를 번역합니다. 데이터와 키는 기기에만 저장됩니다.',
    }
    return texts.get(target_key, texts['en']) + f' Output: {label}.'

def master_manifest_entry(target_key, download_base=None, device_mode=False):
    asset_base = str(download_base or BASE_URL).rstrip('/')
    lang = LANGUAGES[target_key]
    rel = f'.js/src/plugins/multi/translatorHellMaster_{target_key}.js'
    config = {
        'id': f'translatorhell_master_{target_key}',
        'name': MASTER_NAME,
        'site': factory_repository_url(),
        'version': VERSION,
        'mode': 'master',
        'factoryBase': '' if device_mode else BASE_URL,
        'deviceMode': device_mode,
        'targetKey': target_key,
        'targetLanguage': lang['google'],
        'targetLabel': lang['label'],
        'manifestLang': lang['manifest'],
        'icon': MASTER_ICON_REL,
        'description': ('On-device sources inside this Master. Paste a site URL in search, then choose a saved source in settings. No local server required.' if device_mode else master_description(target_key)),
        'repository': factory_repository_url(),
        'author': 'Ance',
        # In localhost/Termux testing this snapshot is private to the user's device.
        # Public GitHub exports must never include it (see export_public_repo.py).
        'localTranslationConfig': provider_runtime_config(),
    }
    write_runtime(rel, config)
    reader = write_child_reader_runtime({'host':'master'}, target_key, device_mode=True, output_rel=f'public/static/src/multi/translatorhell/masterReader_{target_key}.js') if device_mode else None
    return {
        'id': config['id'], 'name': config['name'], 'site': config['site'],
        'lang': lang['manifest'], 'version': VERSION,
        'url': f'{asset_base}/{rel}',
        'iconUrl': f'{asset_base}/public/static/{MASTER_ICON_REL}',
        **({'customJS': f'{asset_base}/{reader}'} if reader else {}),
    }


def child_manifest_entry(profile, target_key, child=None):
    lang = LANGUAGES[target_key]
    host = normalize_host(profile.get('host'))
    host_slug = slugify(host)
    name = domain_label(host)
    icon_rel = ensure_site_icon(profile)
    js_rel = child_js_rel(host, target_key)
    config = {
        'id': f'th_{host_slug}_{target_key}',
        'name': name,
        'site': profile.get('origin') or ('https://' + host),
        'version': child_version(child),
        'mode': 'child',
        'factoryBase': BASE_URL,
        'targetKey': target_key,
        'targetLanguage': lang['google'],
        'targetLabel': lang['label'],
        'manifestLang': lang['manifest'],
        'host': host,
        'profile': profile,
        'icon': icon_rel,
        # The generated child is local-only, so its BYOK snapshot can travel with
        # the installed JS without ever touching the public repository.
        'localTranslationConfig': provider_runtime_config(),
        'localOnly': True,
    }
    write_runtime(js_rel, config)
    reader_js_rel = write_child_reader_runtime(profile, target_key)
    return {
        'id': config['id'], 'name': name, 'site': config['site'],
        'lang': lang['manifest'], 'version': config['version'],
        'url': f'{BASE_URL}/{js_rel}',
        'iconUrl': f'{BASE_URL}/public/static/{icon_rel}',
        'customJS': f'{BASE_URL}/{reader_js_rel}',
        'customCSS': f'{BASE_URL}/public/static/src/multi/translatorhell/readerRuntime.css',
    }


def public_master_manifest(base_url):
    """Build a GitHub-safe manifest containing only the 15 Masters.

    No child, learned profile or credential is exported. The public repo is only
    the bootstrap/compiler entrypoint; generated children remain on-device.
    """
    base_url = str(base_url or '').rstrip('/')
    result = []
    for target_key, lang in LANGUAGES.items():
        rel = f'.js/src/plugins/multi/translatorHellMaster_{target_key}.js'
        result.append({
            'id': f'translatorhell_master_{target_key}',
            'name': MASTER_NAME,
            'site': factory_repository_url(),
            'lang': lang['manifest'],
            'version': VERSION,
            'url': f'{base_url}/{rel}',
            'iconUrl': f'{base_url}/public/static/{MASTER_ICON_REL}',
        })
    return result


def rebuild_manifest():
    with LOCK:
        profiles = read_profiles()
        children = read_children()
        manifest = [master_manifest_entry(k) for k in LANGUAGES]
        valid_children = []
        for child in children:
            host = normalize_host(child.get('host'))
            target_key = child.get('targetKey')
            profile = profiles.get(host)
            if not profile or target_key not in LANGUAGES:
                continue
            # Old state files are migrated lazily to the transient-install model.
            child.setdefault('state', 'pending')
            child.setdefault('deliveryCount', 0)
            try:
                # A delivered child is intentionally absent from the repository.
                # LNReader already persisted its JS in internal PLUGIN_STORAGE.
                if child.get('state') != 'delivered':
                    manifest.append(child_manifest_entry(profile, target_key, child))
                valid_children.append(child)
            except Exception as e:
                print(f'[factory] falha ao gerar filho {host}/{target_key}: {e}', flush=True)
        if valid_children != children:
            save_json(CHILDREN_FILE, valid_children)
        dist = WEBROOT / '.dist'
        dist.mkdir(parents=True, exist_ok=True)
        (dist / 'plugins.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), 'utf-8')
        (dist / 'plugins.min.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), 'utf-8')
        return manifest


def has_pending_child(host):
    host = normalize_host(host)
    return any(normalize_host(c.get('host')) == host and c.get('state', 'pending') != 'delivered' for c in read_children())


def register_profile(profile, target_key=None, mode=None):
    started = time.perf_counter()
    with LOCK:
        host = normalize_host((profile or {}).get('host'))
        if not host:
            raise ValueError('host ausente')
        stage = time.perf_counter()
        profiles = read_profiles()
        merged = deep_merge_profile(profiles.get(host), profile)
        profiles[host] = merged
        save_json(PROFILES_FILE, profiles)
        profile_ms = (time.perf_counter() - stage) * 1000.0

        stage = time.perf_counter()
        child_changed = False
        if mode == 'master' and target_key in LANGUAGES:
            child_changed = add_child(host, target_key)
        child_ms = (time.perf_counter() - stage) * 1000.0

        rebuild_ms = 0.0
        if child_changed or (mode != 'master' and has_pending_child(host)):
            stage = time.perf_counter()
            rebuild_manifest()
            rebuild_ms = (time.perf_counter() - stage) * 1000.0
        total_ms = (time.perf_counter() - started) * 1000.0
        print(
            f'[perf][server] register-profile {total_ms:.1f}ms host={host} '
            f'profile={profile_ms:.1f}ms child={child_ms:.1f}ms rebuild={rebuild_ms:.1f}ms',
            flush=True,
        )
        return merged, child_changed


def refine_profile(refinement, target_key=None):
    with LOCK:
        host = normalize_host((refinement or {}).get('host'))
        if not host:
            raise ValueError('host ausente')
        profiles = read_profiles()
        merged = deep_merge_profile(profiles.get(host), refinement)
        profiles[host] = merged
        save_json(PROFILES_FILE, profiles)
        # A pending child must receive the improved profile before install. Once
        # delivered, the installed child reads /api/factory/profile directly, so
        # regenerating the repository here only adds latency.
        if has_pending_child(host):
            rebuild_manifest()
        return merged



class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEBROOT), **kwargs)

    def perf_log(self, label, started, **fields):
        try:
            elapsed = (time.perf_counter() - started) * 1000.0
            extras = ' '.join(f'{k}={v}' for k, v in fields.items() if v is not None)
            print(f'[perf][server] {label} {elapsed:.1f}ms' + (f' {extras}' if extras else ''), flush=True)
        except Exception:
            pass

    def print_plugin_trace(self, payload):
        try:
            op = str((payload or {}).get('operation') or 'operation')[:60]
            status = str((payload or {}).get('status') or 'ok')[:30]
            total = int((payload or {}).get('totalMs') or 0)
            url = str((payload or {}).get('url') or '')
            try:
                parsed_url = urlparse(url)
                if parsed_url.scheme and parsed_url.netloc:
                    keys = list(parse_qs(parsed_url.query, keep_blank_values=True).keys())[:8]
                    suffix = ('?' + '&'.join(f'{k}=…' for k in keys)) if keys else ''
                    url = f'{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}{suffix}'
            except Exception:
                pass
            if len(url) > 140:
                url = url[:137] + '...'
            print(f'[perf][plugin] {op} total={total}ms status={status} url={url}', flush=True)
            for row in ((payload or {}).get('stages') or [])[:24]:
                if not isinstance(row, dict):
                    continue
                stage = str(row.get('stage') or 'stage')[:48]
                ms = int(row.get('ms') or 0)
                cumulative = int(row.get('totalMs') or 0)
                extras = []
                for key in ('bytes','compactBytes','items','chapters','firstChapters','totalPages','page','pages','queued','blocks','attempt','attempts','batchMs','adapter','discovered','filters','min','max','gaps','strategy','candidate','cache','error','translated','target'):
                    if row.get(key) is not None:
                        value = str(row.get(key))
                        if len(value) > 90:
                            value = value[:87] + '...'
                        extras.append(f'{key}={value}')
                print(f'  ├─ {stage}: +{ms}ms  Σ{cumulative}ms' + (('  ' + ' '.join(extras)) if extras else ''), flush=True)
        except Exception:
            pass

    def log_message(self, fmt, *args):
        # Never print repository query strings: they may contain private API keys.
        try:
            clean = urlparse(self.path).path
            sys.stderr.write('%s - - [%s] %s %s\n' % (
                self.address_string(), self.log_date_time_string(), self.command, clean
            ))
        except Exception:
            pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Accept')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def json_response(self, code, value):
        data = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        try:
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return True
        except (BrokenPipeError, ConnectionResetError):
            # LNReader may abandon an in-flight request when the user presses Back,
            # starts a newer generation, or an AbortController fires. That is a
            # normal client cancellation, not a server error and must not trigger a
            # second response (which caused the v0.7.7 double BrokenPipe traceback).
            print(f'[factory] cliente encerrou a conexão antes da resposta: {self.command} {urlparse(self.path).path}', flush=True)
            return False
        except OSError as e:
            if getattr(e, 'errno', None) in {32, 54, 104}:
                print(f'[factory] conexão cancelada pelo cliente: {self.command} {urlparse(self.path).path}', flush=True)
                return False
            raise

    def read_json(self):
        try:
            length = int(self.headers.get('Content-Length') or '0')
            if length <= 0 or length > 2 * 1024 * 1024:
                return {}
            return json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return {}

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in {'/.dist/plugins.min.json', '/.dist/plugins.json'}:
            capture_repository_options(parsed.query)
        if parsed.path == '/api/factory/profiles':
            profiles = list(read_profiles().values())
            profiles.sort(key=lambda p: p.get('updatedAt', 0), reverse=True)
            return self.json_response(200, {'profiles': profiles})
        if parsed.path == '/api/factory/profile':
            host = normalize_host((parse_qs(parsed.query).get('host') or [''])[0])
            return self.json_response(200, {'profile': read_profiles().get(host)})
        if parsed.path == '/api/factory/status':
            return self.json_response(200, {
                'ok': True, 'version': VERSION, 'masters': len(LANGUAGES),
                'profiles': len(read_profiles()), 'children': len(read_children()),
                'childrenPending': sum(1 for x in read_children() if x.get('state', 'pending') != 'delivered'),
                'childrenDelivered': sum(1 for x in read_children() if x.get('state') == 'delivered'),
                'childrenStorage': 'local-only-transient-catalog',
                'translation': provider_public_status(),
            })
        if parsed.path == '/api/factory/config':
            return self.json_response(200, provider_runtime_config())
        if parsed.path == '/api/factory/children':
            return self.json_response(200, {'children': read_children()})
        if parsed.path.startswith('/.js/src/plugins/generated/') and parsed.path.endswith('.js'):
            # This GET is the decisive install/update download in LNReader. Serve the
            # complete JS first, then retire it from the transient repository catalog.
            result = super().do_GET()
            try:
                if mark_child_delivered(parsed.path):
                    print(f'[factory] filho entregue ao LNReader e retirado do catálogo: {parsed.path}', flush=True)
            except Exception as e:
                print(f'[factory] aviso ao marcar entrega: {e}', flush=True)
            return result
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        request_started = time.perf_counter()
        body = self.read_json()
        try:
            if parsed.path == '/api/factory/debug':
                self.print_plugin_trace(body)
                self.perf_log('POST /api/factory/debug', request_started)
                return self.json_response(200, {'ok': True})
            if parsed.path == '/api/factory/translate':
                text = str(body.get('text') or '')
                if len(text) > 12000:
                    raise ValueError('bloco de tradução grande demais')
                target_language = str(body.get('targetLanguage') or 'pt')
                target_label = str(body.get('targetLabel') or target_language)
                stage = time.perf_counter()
                current = str(body.get('currentTranslation') or '')[:12000] if body.get('repair') else None
                translated, provider = translate_with_fallback(text, target_language, target_label, current)
                translate_ms = (time.perf_counter() - stage) * 1000.0
                self.perf_log('POST /api/factory/translate', request_started, provider=provider, chars=len(text), translate=f'{translate_ms:.1f}ms')
                return self.json_response(200, {'ok': True, 'translation': translated, 'provider': provider})
            if parsed.path == '/api/factory/register':
                stage = time.perf_counter()
                profile, child_created = register_profile(body.get('profile') or {}, body.get('targetKey'), body.get('mode'))
                register_ms = (time.perf_counter() - stage) * 1000.0
                self.perf_log('POST /api/factory/register', request_started, host=profile.get('host'), child=bool(child_created), register=f'{register_ms:.1f}ms')
                return self.json_response(200, {'ok': True, 'profile': profile, 'childCreated': bool(child_created)})
            if parsed.path == '/api/factory/refine':
                stage = time.perf_counter()
                profile = refine_profile(body.get('refinement') or {}, body.get('targetKey'))
                refine_ms = (time.perf_counter() - stage) * 1000.0
                self.perf_log('POST /api/factory/refine', request_started, host=profile.get('host'), refine=f'{refine_ms:.1f}ms')
                return self.json_response(200, {'ok': True, 'profile': profile})
        except (BrokenPipeError, ConnectionResetError):
            return None
        except Exception as e:
            self.perf_log(f'POST {parsed.path} ERROR', request_started, error=(str(e)[:240] if parsed.path == '/api/factory/translate' and isinstance(e, RuntimeError) else translation_error_code(e)))
            return self.json_response(400, {'ok': False, 'error': str(e)})
        self.perf_log(f'POST {parsed.path} 404', request_started)
        return self.json_response(404, {'ok': False, 'error': 'not found'})



def main():
    global PORT, BASE_URL
    ap = argparse.ArgumentParser()
    ap.add_argument('port', nargs='?', type=int, default=8765)
    args = ap.parse_args()
    PORT = args.port
    BASE_URL = f'http://127.0.0.1:{PORT}'
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PROFILES_FILE.exists(): save_json(PROFILES_FILE, {})
    if not CHILDREN_FILE.exists(): save_json(CHILDREN_FILE, [])
    if not CREDENTIALS_FILE.exists(): save_credentials({'keys': {}, 'models': {}, 'order': [], 'updatedAt': 0})
    manifest = rebuild_manifest()
    print(f'\nFactory - Ance v{VERSION}', flush=True)
    print(f'Repositório LNReader: {BASE_URL}/.dist/plugins.min.json', flush=True)
    print(f'Masters gerados: {len(LANGUAGES)} (um por idioma de saída)', flush=True)
    print('Chaves opcionais na URL LOCAL: P=Pollinations  Z=Z.AI  H=BigModel/HEIA  G=Groq (B também é aceito como alias de H).', flush=True)
    print('Ex.: ' + BASE_URL + '/.dist/plugins.min.json?P=SUA_CHAVE&Z=SUA_CHAVE', flush=True)
    print('Sem chave, ou se as IAs falharem, Google entra automaticamente.', flush=True)
    print('Ao colar uma URL em um Master, o domínio será aprendido e um plugin-filho aparecerá TEMPORARIAMENTE no manifesto local.', flush=True)
    print('Quando o LNReader baixar esse JS para instalar, o filho é retirado do catálogo; a cópia instalada fica no armazenamento interno do app.', flush=True)
    print('Nenhum filho, perfil ou chave é enviado ao GitHub. Cole a URL novamente no Master se quiser republicar/atualizar um filho.\n', flush=True)
    with ThreadingTCPServer(('127.0.0.1', PORT), Handler) as httpd:
        print(f'Serving HTTP/factory on 127.0.0.1:{PORT} (no-cache)...', flush=True)
        print('[perf] profiler ativo: fetch/DOM/adapters/catálogos/tradução/detalhes/capítulos aparecerão abaixo.', flush=True)
        httpd.serve_forever()


if __name__ == '__main__':
    main()
