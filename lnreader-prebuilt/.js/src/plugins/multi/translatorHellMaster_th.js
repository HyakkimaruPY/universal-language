"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fetch_1 = require("@libs/fetch");
const cheerio_1 = require("cheerio");
const filterInputs_1 = require("@libs/filterInputs");
const storage_1 = require("@libs/storage");
const CONFIG = {"id":"translatorhell_master_th","name":"Factory - Ance","site":"https://github.com/lnreader/lnreader","version":"0.8.6","mode":"master","factoryBase":"http://127.0.0.1:8765","targetKey":"th","targetLanguage":"th","targetLabel":"ไทย","manifestLang":"ไทย","icon":"src/multi/translatorhell/factory_ance_v072.png","description":"โรงงานปลั๊กอินภายในเครื่องสำหรับ LNReader เรียนรู้เว็บนิยาย สร้างแหล่งที่ติดตั้งได้ และแปลข้อมูล แคตตาล็อก และตอนต่าง ๆ โดยข้อมูลและคีย์อยู่บนอุปกรณ์เท่านั้น Output: ไทย.","repository":"https://github.com/lnreader/lnreader","author":"Ance","localTranslationConfig":{"providers":{},"googleFallback":true}};
const FACTORY_SUCCESS_LABELS = {
    id: 'Berhasil dibuat',
    en: 'Created successfully',
    es: 'Creado correctamente',
    fr: 'Créé avec succès',
    pl: 'Utworzono pomyślnie',
    pt: 'Criado com sucesso',
    vi: 'Tạo thành công',
    tr: 'Başarıyla oluşturuldu',
    ru: 'Успешно создано',
    uk: 'Успішно створено',
    ar: 'تم الإنشاء بنجاح',
    th: 'สร้างสำเร็จ',
    zh: '创建成功',
    ja: '作成しました',
    ko: '생성 완료',
};
const FACTORY_CLOUDFLARE_LABELS = {
    id: 'Cloudflare terdeteksi. Buka WebView, selesaikan verifikasi, lalu cari URL yang sama lagi.',
    en: 'Cloudflare detected. Open WebView, complete verification, then search the same URL again.',
    es: 'Cloudflare detectado. Abra WebView, complete la verificación y vuelva a buscar la misma URL.',
    fr: 'Cloudflare détecté. Ouvrez WebView, terminez la vérification puis recherchez de nouveau la même URL.',
    pl: 'Wykryto Cloudflare. Otwórz WebView, ukończ weryfikację i wyszukaj ten sam adres ponownie.',
    pt: 'Cloudflare detectado. Abra o WebView, conclua a verificação e pesquise a mesma URL novamente.',
    vi: 'Đã phát hiện Cloudflare. Mở WebView, hoàn tất xác minh rồi tìm lại cùng URL.',
    tr: "Cloudflare algılandı. WebView'ı açın, doğrulamayı tamamlayın ve aynı URL'yi yeniden arayın.",
    ru: 'Обнаружен Cloudflare. Откройте WebView, завершите проверку и снова выполните поиск по тому же URL.',
    uk: 'Виявлено Cloudflare. Відкрийте WebView, завершіть перевірку та знову знайдіть ту саму URL-адресу.',
    ar: 'تم اكتشاف Cloudflare. افتح WebView وأكمل التحقق ثم ابحث عن نفس الرابط مرة أخرى.',
    th: 'ตรวจพบ Cloudflare เปิด WebView ยืนยันให้เสร็จ แล้วค้นหา URL เดิมอีกครั้ง',
    zh: '检测到 Cloudflare。请打开 WebView 完成验证，然后再次搜索同一 URL。',
    ja: 'Cloudflare を検出しました。WebView で認証を完了し、同じ URL をもう一度検索してください。',
    ko: 'Cloudflare가 감지되었습니다. WebView에서 인증을 완료한 뒤 같은 URL을 다시 검색하세요.',
};
class TranslatorHellFactoryRuntime {
    constructor() {
        this.id = CONFIG.id;
        this.name = CONFIG.name;
        this.icon = CONFIG.icon || 'src/multi/translatorhell/factory_ance_v072.png';
        this.site = CONFIG.site || 'https://example.com';
        this.version = CONFIG.version || '0.8.2';
        this.filters = this.buildLnFilters(CONFIG.profile?.filterDefinitions || []);
        this.imageRequestInit = CONFIG.mode === 'child' ? {
            method: 'GET',
            headers: {
                Referer: CONFIG.site || 'https://example.com',
                Accept: 'image/avif,image/webp,image/apng,image/png,image/jpeg,image/x-icon,image/*,*/*;q=0.8',
            },
        } : undefined;
        this.webStorageUtilized = true;
        this.targetLanguage = String(CONFIG.targetLanguage || 'pt');
        this.targetLabel = String(CONFIG.targetLabel || this.targetLanguage);
        this.factoryBase = String(CONFIG.factoryBase || 'http://127.0.0.1:8765').replace(/\/$/, '');
        this.mode = CONFIG.mode || 'child';
        this.description = String(CONFIG.description || '');
        this.repository = String(CONFIG.repository || '');
        this.author = String(CONFIG.author || 'Ance');
        this.pluginSettings = this.mode === 'master' ? this.buildFactoryInfoSettings() : undefined;
        this.embeddedProfile = CONFIG.profile || null;
        this.chapterCache = new Map();
        this.chapterInFlight = new Map();
        this.factoryCommandState = new Map();
        this.factorySessionSuccess = new Map();
        this.sourcePageCache = new Map();
        this.sourcePageInFlight = new Map();
        this.sourcePageSeen = new Map();
        this.sourcePageEnd = new Map();
        this.sourceStaticContexts = new Set();
        // v0.7.6: browse work is intentionally bounded. On Hermes, a timed-out
        // Promise can keep running underneath Promise.race; these generation/budget
        // guards prevent stale network responses from starting expensive parsing or
        // additional probes after LNReader has already moved on.
        this.browseBudgetSeq = 0;
        this.browseTranslationInFlight = new Map();
        this.metadataCache = new Map();
        this.metadataInFlight = new Map();
        this.catalogFetchInFlight = new Map();
        this.catalogMemory = new Map();
        this.catalogPageSize = 24;
        this.catalogStoragePrefix = `translatorhell:catalog:v085:${CONFIG.host || CONFIG.id || 'master'}:`;
        this.profileCache = new Map();
        this.aiConfigCache = null;
        this.aiConfigFetchedAt = 0;
        this.providerHealth = new Map();
        this.fetchMeta = new Map();
        this.displayTitleCache = new Map();
        this.displayCacheLoaded = false;
        this.displayCacheDirty = false;
        this.displayCacheStorageKey = `translatorhell:display-cache:v084:${CONFIG.host || CONFIG.id || 'master'}:${this.targetLanguage}`;
        // Structural hints captured from browse/search cards. These are deliberately
        // source-language and separate from translated presentation caches, so a
        // weak detail page can still render the correct title/cover immediately.
        this.novelHintCache = new Map();
        this.novelHintCacheLoaded = false;
        this.novelHintCacheDirty = false;
        this.novelHintStorageKey = `translatorhell:novel-hints:${CONFIG.host || CONFIG.id || 'master'}`;
        this.strategyStatsLoaded = false;
        this.strategyStatsDirty = false;
        this.strategyStats = {};
        this.strategyStatsStorageKey = `translatorhell:strategy-stats:${CONFIG.host || CONFIG.id || 'master'}`;
        this.persistentChapterCacheLoaded = false;
        this.persistentChapterCache = new Map();
        this.persistentChapterCacheStorageKey = `translatorhell:chapter-cache:${CONFIG.host || CONFIG.id || 'master'}:${this.targetLanguage}`;
        this.chapterPrefetchInFlight = new Set();
        this.embeddedTranslationConfig = CONFIG.localTranslationConfig || { providers: {} };
        this.localProfileStorageKey = `translatorhell:profile:${CONFIG.host || CONFIG.id || 'master'}`;
        this.resolveUrl = (path, _isNovel) => {
            return this.asHttpUrl(path) || path;
        };
        this.perfDebug = CONFIG.perfDebug !== false;
        this.perfSeq = 0;
    }
    perfStart(operation, url = '') {
        const now = Date.now();
        return { id: ++this.perfSeq, operation: String(operation || 'operation'), url: String(url || ''), started: now, last: now, stages: [] };
    }
    perfMark(trace, stage, extra = undefined) {
        if (!trace) return;
        const now = Date.now();
        trace.stages.push({ stage: String(stage || 'stage'), ms: now - trace.last, totalMs: now - trace.started, ...(extra && typeof extra === 'object' ? extra : {}) });
        trace.last = now;
    }
    perfFinish(trace, status = 'ok', extra = undefined) {
        if (!trace) return;
        this.perfMark(trace, 'finish', extra);
        const payload = {
            id: trace.id, operation: trace.operation, url: trace.url, status: String(status || 'ok'),
            totalMs: Date.now() - trace.started, stages: trace.stages.slice(0, 24),
        };
        this.emitPerf(payload);
    }
    emitPerf(payload) {
        if (!this.perfDebug || !this.factoryBase || !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(this.factoryBase)) return;
        const endpoint = `${this.factoryBase}/api/factory/debug`;
        const runner = async () => {
            let timer = null;
            let controller = null;
            try {
                if (typeof AbortController !== 'undefined') {
                    controller = new AbortController();
                    timer = setTimeout(() => { try { controller.abort(); } catch (_) {} }, 650);
                }
                await (0, fetch_1.fetchApi)(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    ...(controller ? { signal: controller.signal } : {}),
                });
            } catch (_) {} finally { if (timer) clearTimeout(timer); }
        };
        // Debug must never be part of the navigation-critical promise. One tiny
        // localhost POST is allowed, hard-aborted in 650 ms if Termux is absent.
        Promise.resolve().then(runner).catch(() => {});
    }
    buildFactoryInfoSettings() {
        const key = String(CONFIG.targetKey || 'en');
        const labels = {
            id: ['Tujuan', 'Bahasa keluaran'], en: ['Purpose', 'Output language'], es: ['Objetivo', 'Idioma de salida'],
            fr: ['Objectif', 'Langue de sortie'], pl: ['Cel', 'Język wyjściowy'], pt: ['Objetivo', 'Idioma de saída'],
            vi: ['Mục tiêu', 'Ngôn ngữ đầu ra'], tr: ['Amaç', 'Çıktı dili'], ru: ['Назначение', 'Язык вывода'],
            uk: ['Призначення', 'Мова виводу'], ar: ['الهدف', 'لغة الإخراج'], th: ['วัตถุประสงค์', 'ภาษาผลลัพธ์'],
            zh: ['用途', '输出语言'], ja: ['目的', '出力言語'], ko: ['목적', '출력 언어'],
        };
        const pair = labels[key] || labels.en;
        return {
            factoryPurpose: { label: pair[0], value: this.description || 'Local plugin factory for LNReader.', type: 'Text' },
            factoryGithub: { label: 'GitHub', value: this.repository || 'https://github.com/lnreader/lnreader', type: 'Text' },
            factoryLanguage: { label: pair[1], value: this.targetLabel, type: 'Text' },
        };
    }
    sourceContextKey(kind, profile, query = '', filters = {}) {
        let filterKey = '';
        try { filterKey = JSON.stringify(filters || {}); } catch (_) { filterKey = String(filters || ''); }
        return `${kind}|${profile?.host || CONFIG.host || this.id}|${String(query || '')}|${filterKey}`;
    }
    sourcePageKey(context, pageNo) { return `${context}|p:${Math.max(1, Number(pageNo || 1))}`; }
    truncateSummary(value, maxChars = 2000) {
        const text = this.norm(String(value || ''));
        const limit = Math.max(300, Number(maxChars || 2000));
        if (text.length <= limit) return text;
        const floor = Math.max(200, limit - 260);
        const window = text.slice(0, limit + 1);
        let cut = -1;
        for (const token of ['。', '！', '？', '.', '!', '?', '\n']) {
            const i = window.lastIndexOf(token);
            if (i >= floor) cut = Math.max(cut, i + 1);
        }
        if (cut < floor) {
            const i = window.lastIndexOf(' ');
            if (i >= floor) cut = i;
        }
        if (cut < floor) cut = limit;
        const suffix = '…';
        const body = text.slice(0, Math.min(cut, Math.max(1, limit - suffix.length))).trimEnd();
        return body + suffix;
    }
    hasExplicitSourcePagination($, base) {
        let found = false;
        $('a[href]').each((_i, el) => {
            if (found) return;
            const a = $(el);
            const text = this.norm(a.text());
            const rel = String(a.attr('rel') || '').toLowerCase();
            const href = this.resolveAgainst(a.attr('href'), base) || '';
            if (rel.split(/\s+/).includes('next') || /^(?:下一页|下一頁|下页|下頁|next|older|more|›|»|→)$/i.test(text)) { found = true; return; }
            if (/^(?:2|02)$/.test(text) && /(?:[?&](?:page|p|pageNo|pageNum)=2(?:&|$)|[_\/-]2\.html(?:$|[?#])|\/page\/2(?:\/|$))/i.test(href)) { found = true; return; }
        });
        if (found) return true;
        return $('.pagination,.pager,.page-nav,.pages,[class*=pagination],[class*=pager]').find('a[href]').length >= 2;
    }
    looksLikeAggregatePortal($, base, items) {
        let u;
        try { u = new URL(base); } catch (_) { return false; }
        if (!/^\/?(?:index\.(?:html?|php))?$/.test(u.pathname || '/')) return false;
        const count = Array.isArray(items) ? items.length : 0;
        if (count < 6) return false;
        if (this.hasExplicitSourcePagination($, base)) return false;
        let categorySignals = 0;
        $('h2,h3,nav a[href],.category a[href],.class a[href],.channel a[href]').each((_i, el) => {
            if (categorySignals >= 4) return;
            const t = this.norm($(el).text());
            if (/(玄幻|都市|言情|穿越|青春|仙侠|靈異|灵异|懸疑|悬疑|歷史|历史|軍事|军事|科幻|游戏|競技|竞技|romance|fantasy|action|urban|historical|sci[- ]?fi|genre|category)/i.test(t)) categorySignals++;
        });
        return categorySignals >= 3 || $('h2').length >= 5;
    }
    resetSourceContext(context) {
        this.sourcePageSeen.set(context, new Set());
        this.sourcePageEnd.delete(context);
        this.sourceStaticContexts.delete(context);
    }
    filterSourcePage(context, pageNo, items) {
        const page = Math.max(1, Number(pageNo || 1));
        let seen = this.sourcePageSeen.get(context);
        if (!seen || page === 1) {
            seen = new Set();
            this.sourcePageSeen.set(context, seen);
            if (page === 1) this.sourcePageEnd.delete(context);
        }
        const list = Array.isArray(items) ? items : [];
        let overlap = 0;
        const fresh = [];
        for (const item of list) {
            const id = item?.path ? this.novelIdentity(String(item.path)) : String(item?.name || '').trim();
            if (!id) continue;
            if (seen.has(id)) { overlap++; continue; }
            seen.add(id);
            fresh.push(item);
        }
        if (page > 1 && list.length && overlap / list.length >= 0.75 && fresh.length <= 4)
            this.sourcePageEnd.set(context, page);
        if (page > 1 && !list.length) this.sourcePageEnd.set(context, page);
        return fresh;
    }
    async presentSourcePageItems(key, page, rawItems) {
        const raw = Array.isArray(rawItems) ? rawItems : [];
        let display = this.applyCachedNovelItemTitles(raw);
        if (!this.hasUncachedNovelTitles(raw)) return display;
        const translationKey = `${key}|translate`;
        let translation = this.browseTranslationInFlight.get(translationKey);
        if (!translation) {
            translation = Promise.resolve(this.translateNovelItemTitlesGoogle(raw))
                .finally(() => this.browseTranslationInFlight.delete(translationKey));
            this.browseTranslationInFlight.set(translationKey, translation);
        }
        try {
            return await this.withTimeout(translation, 6500, 'tradução visual do catálogo');
        } catch (_) {
            // Never poison the structural page cache with untranslated display text.
            // If translation failed, the next entry into the source retries against
            // the same raw titles without refetching/reparsing the website.
            return this.applyCachedNovelItemTitles(raw);
        }
    }
    async sourcePage(context, pageNo, loader, allowPrefetch = true) {
        const page = Math.max(1, Number(pageNo || 1));
        const end = this.sourcePageEnd.get(context);
        if (this.sourceStaticContexts.has(context) && page > 1) return [];
        if (page === 1) { this.sourcePageEnd.delete(context); this.sourcePageSeen.delete(context); }
        if (page > 1 && end && page >= end) return [];
        const key = this.sourcePageKey(context, page);
        if (this.sourcePageCache.has(key)) {
            // sourcePageCache is intentionally structural/raw. Display translation is
            // re-applied on every read so a temporary ES->ZH/Google failure is retryable.
            return await this.presentSourcePageItems(key, page, this.sourcePageCache.get(key));
        }
        if (this.sourcePageInFlight.has(key)) return await this.sourcePageInFlight.get(key);
        const task = (async () => {
            const perf = this.perfStart('sourcePage', `${context}|page=${page}`);
            try {
                const loaded = await this.withTimeout(Promise.resolve(loader(page)), 12000, 'carregamento do catálogo');
                this.perfMark(perf, 'load-structural', { items: Array.isArray(loaded) ? loaded.length : 0 });
                // Filter/dedupe using raw source items. Caching translated items loses the
                // source-language key and can accidentally translate an already translated
                // title again on a later render.
                const raw = this.filterSourcePage(context, page, Array.isArray(loaded) ? loaded : []);
                this.rememberNovelHints(raw);
                if (raw.length) this.sourcePageCache.set(key, raw);
                while (this.sourcePageCache.size > 30) {
                    const first = this.sourcePageCache.keys().next().value;
                    if (!first) break;
                    this.sourcePageCache.delete(first);
                }
                this.perfMark(perf, 'dedupe-cache', { items: raw.length });
                const display = await this.presentSourcePageItems(key, page, raw);
                this.perfMark(perf, 'translate-display', { items: display.length });
                this.perfFinish(perf, 'ok', { page, items: display.length });
                return display;
            } catch (error) {
                this.perfFinish(perf, 'error', { error: String(error?.message || error || '').slice(0,160), page });
                throw error;
            }
        })().finally(() => this.sourcePageInFlight.delete(key));
        this.sourcePageInFlight.set(key, task);
        // v0.7.6 deliberately does not auto-prefetch browse pages. LNReader has no
        // plugin lifecycle callback that tells a source its screen was closed, so a
        // timer-based prefetch can wake up after the user pressed Back and compete
        // with navigation. Page 2 is fetched only when LNReader actually asks for it.
        return await task;
    }
    async getPopularSourcePage(profile, pageNo, filters) {
        const context = this.sourceContextKey('popular', profile, '', filters || {});
        return await this.sourcePage(context, pageNo, p => this.discoverSiteNovels(profile, p, filters || {}, context));
    }
    async getSearchSourcePage(profile, query, pageNo) {
        const context = this.sourceContextKey('search', profile, query, {});
        return await this.sourcePage(context, pageNo, p => this.searchProfile(profile, query, p));
    }
    async popularNovels(pageNo, options) {
        // The Master is a factory/command source, not a bookshelf. Learned DNS
        // profiles must NEVER be exposed as NovelItems, otherwise LNReader stores
        // the website itself as if it were a novel.
        if (this.mode === 'master')
            return [];
        if (pageNo > 30)
            return [];
        const profile = await this.getCurrentProfile();
        if (!profile)
            return [];
        return await this.getPopularSourcePage(profile, pageNo, options?.filters || {});
    }
    async searchNovels(searchTerm, pageNo) {
        // URL input is a command, not a paginated catalog. LNReader may invoke
        // searchNovels repeatedly for page 1 and then page 2+ while rendering.
        // Only the first page is allowed to execute the factory command.
        const page = Math.max(1, Number(pageNo || 1));
        const asUrl = this.asHttpUrl(searchTerm);
        if (asUrl) {
            if (page > 1)
                return [];
            return this.searchByUrl(asUrl);
        }
        if (page > 3)
            return [];
        const query = this.norm(searchTerm);
        if (!query)
            return [];
        if (this.mode === 'master') {
            const profiles = await this.getProfiles();
            const selected = profiles.slice(0, 10);
            const results = [];
            let cursor = 0;
            const workers = Math.min(3, selected.length || 1);
            await Promise.all(Array.from({ length: workers }, async () => {
                while (true) {
                    const i = cursor++;
                    if (i >= selected.length)
                        break;
                    try {
                        const found = await this.searchProfile(selected[i], query, pageNo);
                        results.push(...found);
                    }
                    catch (_) { }
                }
            }));
            const raw = this.dedupeNovelItems(results).slice(0, 60);
            try { return await this.withTimeout(this.translateNovelItemTitlesGoogle(raw), 900, 'tradução visual da busca'); }
            catch (_) { return this.applyCachedNovelItemTitles(raw); }
        }
        const profile = await this.getCurrentProfile();
        if (!profile)
            return [];
        return await this.getSearchSourcePage(profile, query, pageNo);
    }
    async searchByUrl(inputUrl) {
        const url = inputUrl;
        const commandKey = `${String(CONFIG.targetKey || '')}|${url}`;
        const now = Date.now();
        if (this.mode === 'master') {
            const previous = this.factoryCommandState.get(commandKey);
            if (previous && now - Number(previous.at || 0) < 5000 && previous.state !== 'cloudflare') return this.factorySessionItems();
            this.factoryCommandState.set(commandKey, { at: now, state: 'running' });
            if (this.factoryCommandState.size > 20) {
                const first = this.factoryCommandState.keys().next().value;
                if (first) this.factoryCommandState.delete(first);
            }
        }
        let seedProfile;
        try {
            const u = new URL(url);
            seedProfile = {
                host: u.hostname,
                origin: u.origin,
                siteName: this.prettyHost(u.hostname),
                seedUrl: url,
                sourceRoot: u.origin + '/',
                siteIconUrl: new URL('/favicon.ico', u.origin).href,
                selectors: {}, searchTemplates: [], listingUrls: [],
            };
        } catch (_) {
            if (this.mode === 'master') this.factoryCommandState.delete(commandKey);
            return [];
        }
        try {
            // Creation now performs one real probe BEFORE advertising the child.
            // This prevents a Cloudflare-protected source from being installed in a
            // broken state. Cookies solved in WebView are reused by fetchApi.
            const html = await this.withAbortTimeout(signal => this.getText(url, 'factory', signal), 7500, 'detecção inicial');
            const meta = this.fetchMeta.get(url) || {};
            if (meta?.cloudflare && meta?.challenge) {
                const protectedProfile = this.ensureProfile({ ...seedProfile, protection: this.mergeProtection(seedProfile.protection, meta) }, url);
                if (protectedProfile) await this.refineProfile(protectedProfile);
                if (this.mode === 'master') this.factoryCommandState.set(commandKey, { at: Date.now(), state: 'cloudflare' });
                const label = FACTORY_CLOUDFLARE_LABELS[String(CONFIG.targetKey || '')] || FACTORY_CLOUDFLARE_LABELS.en;
                throw Object.assign(new Error(`Translator Hell: ${label}`), {cloudflare: true, protection: protectedProfile.protection});
            }
            const seed$ = (0, cheerio_1.load)(html);
            // v0.8.0: site/catalog learning and novel-detail learning are different
            // jobs. A representative novel must NEVER replace the homepage context,
            // otherwise the generated child knows detail selectors but loses the
            // real browse/listing route.
            let siteLearned = this.learnSiteProfile(seed$, url, url, html);
            // Declared icon candidates are resolved by the server's bounded icon resolver.
            let learnedUrl = url;
            let learned$ = seed$;
            let detailLearned = null;
            const inferred = this.inferNovelUrl(seed$, url);
            if (inferred && inferred !== url) {
                try {
                    const novelHtml = await this.withAbortTimeout(signal => this.getText(inferred, 'metadata', signal), 6500, 'metadados iniciais');
                    const inferredMeta = this.fetchMeta.get(inferred) || {};
                    if (inferredMeta?.cloudflare && inferredMeta?.challenge) {
                        const protectedProfile = this.ensureProfile({ ...seedProfile, ...siteLearned, protection: this.mergeProtection(seedProfile.protection, inferredMeta) }, url);
                        if (protectedProfile) await this.refineProfile(protectedProfile);
                        if (this.mode === 'master') this.factoryCommandState.set(commandKey, { at: Date.now(), state: 'cloudflare' });
                        const label = FACTORY_CLOUDFLARE_LABELS[String(CONFIG.targetKey || '')] || FACTORY_CLOUDFLARE_LABELS.en;
                        throw Object.assign(new Error(`Translator Hell: ${label}`), {cloudflare: true, protection: protectedProfile.protection});
                    }
                    learnedUrl = inferred;
                    learned$ = (0, cheerio_1.load)(novelHtml);
                    detailLearned = this.learnDetailProfile(learned$, learnedUrl);
                } catch (e) {
                    if (e?.protection?.cloudflare || e?.cloudflare) throw e;
                }
            } else if (this.looksLikeNovelDocument(seed$, url)) {
                detailLearned = this.learnDetailProfile(seed$, url);
            }
            // If the supplied URL was itself a detail page and did not expose a
            // useful browse route, inspect the origin homepage once. This remains a
            // bounded creation-time probe and is embedded into the child afterwards.
            if (!(siteLearned.listingUrls || []).length && learnedUrl === url) {
                try {
                    const originUrl = new URL('/', url).href;
                    if (originUrl !== url) {
                        const homeHtml = await this.withAbortTimeout(signal => this.getText(originUrl, 'factory', signal), 4200, 'catálogo inicial');
                        const home$ = (0, cheerio_1.load)(homeHtml);
                        const homeLearned = this.learnSiteProfile(home$, originUrl, url, homeHtml);
                        siteLearned = this.mergeProfiles(siteLearned, homeLearned);
                        // No second manifest probe on the creation path.
                    }
                } catch (_) {}
            }
            let profile = this.mergeProfiles(seedProfile, siteLearned);
            if (detailLearned) profile = this.mergeProfiles(profile, detailLearned);
            profile = this.ensureProfile({ ...profile, seedUrl: url, origin: seedProfile.origin, host: seedProfile.host, siteName: seedProfile.siteName }, url);
            await this.registerProfile(profile);
            if (this.mode === 'master') {
                this.factoryCommandState.set(commandKey, { at: Date.now(), state: 'done' });
                this.rememberFactorySuccess(profile, learnedUrl);
                return this.factorySessionItems();
            }
            const metadata = this.extractMetadata(learned$, learnedUrl, profile);
            return [{ name: metadata.title || profile.siteName || profile.host, path: learnedUrl, ...(metadata.cover ? { cover: metadata.cover } : {}) }];
        } catch (error) {
            if (error?.factoryRegistration) { this.factoryCommandState.delete(commandKey); throw error; }
            const meta = error?.protection || this.fetchMeta.get(url) || {};
            if (meta?.challenge || error?.protection?.challenge) {
                const profile = this.ensureProfile({ ...seedProfile, protection: this.mergeProtection(seedProfile.protection, error?.protection || meta) }, url);
                if (this.mode === 'master') {
                    await this.registerProfile(profile);
                    this.factoryCommandState.set(commandKey, {at: Date.now(), state: 'cloudflare'});
                    this.rememberFactorySuccess(profile, url);
                    const item = this.factorySessionSuccess.get(profile.host);
                    if (item) item.name += ' — WebView: ' + profile.host;
                    return this.factorySessionItems();
                }
                throw error;
            }
            // Non-protection failures (odd HTML, temporary parse error, CORS on the
            // JS path) still create a minimal child so the adaptive runtime can learn
            // later through LNReader fetchApi/WebView.
            if (this.mode === 'master') {
                const registered = await this.registerProfile(seedProfile);
                this.factoryCommandState.set(commandKey, { at: Date.now(), state: 'done' });
                this.rememberFactorySuccess(seedProfile, url);
                return this.factorySessionItems();
            }
            return [{ name: seedProfile.siteName || seedProfile.host, path: url }];
        }
    }
    async enrichFactoryProfile(url, seedProfile) {
        // Best effort only: never republish the child here. Refinement updates the
        // local profile used by the already-created child without creating a second
        // search result or requiring the user to paste the URL twice.
        try {
            const html = await this.getText(url, 'factory');
            const $ = (0, cheerio_1.load)(html);
            let learnedUrl = url;
            let learned$ = $;
            const inferred = this.inferNovelUrl($, url);
            if (inferred && inferred !== url) {
                try {
                    const novelHtml = await this.getText(inferred, 'metadata');
                    learned$ = (0, cheerio_1.load)(novelHtml);
                    learnedUrl = inferred;
                } catch (_) {}
            }
            let siteLearned = this.learnSiteProfile($, url, url, html);
            try { siteLearned.siteIconUrl = await this.resolveSiteIconDeep($, url, siteLearned.siteIconUrl); } catch (_) {}
            const detailLearned = learnedUrl !== url || this.looksLikeNovelDocument(learned$, learnedUrl)
                ? this.learnDetailProfile(learned$, learnedUrl) : null;
            let merged = this.mergeProfiles(seedProfile, siteLearned);
            if (detailLearned) merged = this.mergeProfiles(merged, detailLearned);
            merged = this.ensureProfile({ ...merged, seedUrl: url, origin: seedProfile.origin, host: seedProfile.host, siteName: seedProfile.siteName }, url);
            if (merged) await this.refineProfile(merged);
        } catch (error) {
            try {
                const meta = this.fetchMeta.get(url) || error?.protection || {};
                if (meta?.cloudflare && seedProfile?.host) {
                    await this.refineProfile({
                        host: seedProfile.host,
                        protection: this.mergeProtection(seedProfile.protection, meta),
                    });
                }
            } catch (_) {}
        }
    }
    factorySuccessLabel() {
        return FACTORY_SUCCESS_LABELS[String(CONFIG.targetKey || '')] || FACTORY_SUCCESS_LABELS.en;
    }
    factorySuccessItems(profile, sourceUrl) {
        const host = profile?.host || (() => { try { return new URL(sourceUrl).hostname; } catch (_) { return ''; } })();
        const label = this.factorySuccessLabel();
        const siteName = profile?.siteName || this.prettyHost(host) || host;
        const statusPath = `https://example.com/?translatorhell_factory_success=1&host=${encodeURIComponent(host)}&source=${encodeURIComponent(sourceUrl || '')}`;
        return [{
                name: siteName ? `${label} — ${siteName}` : label,
                path: statusPath,
                cover: `${this.factoryBase}/public/static/src/multi/translatorhell/success.png`,
            }];
    }
    rememberFactorySuccess(profile, sourceUrl) {
        const items = this.factorySuccessItems(profile, sourceUrl);
        const item = items[0];
        if (!item) return;
        const host = profile?.host || (() => { try { return new URL(sourceUrl).hostname; } catch (_) { return sourceUrl; } })();
        const key = String(host || sourceUrl || item.name);
        this.factorySessionSuccess.set(key, item);
        while (this.factorySessionSuccess.size > 20) {
            const first = this.factorySessionSuccess.keys().next().value;
            if (!first) break;
            this.factorySessionSuccess.delete(first);
        }
    }
    factorySessionItems() { return Array.from(this.factorySessionSuccess.values()); }
    isFactorySuccessPath(path) {
        try {
            const u = new URL(String(path || ''));
            return u.hostname === 'example.com' && u.searchParams.get('translatorhell_factory_success') === '1';
        }
        catch (_) {
            return false;
        }
    }
    novelIdentity(rawUrl) {
        try {
            const u = new URL(String(rawUrl || '').trim());
            u.hash = '';
            u.hostname = u.hostname.replace(/^www\./i, '');
            for (const key of Array.from(u.searchParams.keys())) {
                if (/^(?:utm_[^=]*|fbclid|gclid|yclid|ref|referrer|source)$/i.test(key)) u.searchParams.delete(key);
            }
            u.pathname = u.pathname
                .replace(/\/{2,}/g, '/')
                .replace(/^\/amp(?=\/|$)/i, '')
                .replace(/\/+$/, '') || '/';
            return `${this.id}|${u.href}`;
        } catch (_) {
            return `${this.id}|${String(rawUrl || '').trim()}`;
        }
    }
    novelRoute(profile, novelUrl) {
        const routes = profile?.novelRoutes;
        if (!routes || typeof routes !== 'object') return null;
        return routes[this.novelIdentity(novelUrl)] || null;
    }
    async parseNovel(novelPath) {
        if (this.mode === 'master' && this.isFactorySuccessPath(novelPath)) return await this.parseNovelFresh(novelPath);
        const key = this.novelIdentity(novelPath);
        const cached = this.metadataCache.get(key);
        if (cached && Date.now() < Number(cached.__thExpires || 0)) return await this.refreshCachedNovelDisplay(cached);
        this.metadataCache.delete(key);
        const running = this.metadataInFlight.get(key);
        if (running) return await running;
        const task = this.parseNovelFresh(novelPath).finally(() => this.metadataInFlight.delete(key));
        this.metadataInFlight.set(key, task);
        return await task;
    }
    attachNovelDisplayRaw(novel, raw) {
        try {
            Object.defineProperty(novel, '__thDisplayRaw', { value: raw || {}, writable: true, configurable: true, enumerable: false });
        } catch (_) {}
        return novel;
    }
    async refreshCachedNovelDisplay(novel) {
        const raw = novel?.__thDisplayRaw;
        if (!raw) return novel;
        const sourceName = String(raw.name || '');
        const sourceSummary = String(raw.summary || '');
        const rawChapters = Array.isArray(raw.chapters) ? raw.chapters : [];
        const cachedName = sourceName ? this.getDisplayCache(`${this.targetLanguage}\u0000${sourceName}`) : undefined;
        const cachedSummary = sourceSummary ? this.getDisplayCache(`${this.targetLanguage}\u0000${sourceSummary}`) : undefined;
        const chapterNames = rawChapters.map(ch => {
            const source = this.cleanChapterTitleText(ch?.name || '');
            return this.getDisplayCache(`${this.targetLanguage}\u0000${source}`) || source || ch?.name || '';
        });
        const chaptersFullyCached = rawChapters.every((ch, i) => {
            const source = this.cleanChapterTitleText(ch?.name || '');
            return !source || this.getDisplayCache(`${this.targetLanguage}\u0000${source}`) !== undefined;
        });
        if ((!sourceName || cachedName !== undefined) && (!sourceSummary || cachedSummary !== undefined) && chaptersFullyCached) {
            if (cachedName) novel.name = cachedName;
            if (cachedSummary) novel.summary = this.truncateSummary(cachedSummary, 2000);
            if (rawChapters.length && Array.isArray(novel.chapters)) {
                novel.chapters = novel.chapters.map((ch, i) => ({ ...ch, name: chapterNames[i] || ch.name }));
            }
            return novel;
        }
        // Metadata itself is cached, but presentation failures are not. Retry only
        // the missing display strings; never re-download/reparse the huge product page.
        const [name, summary, chapters] = await Promise.all([
            sourceName ? this.withTimeout(this.googleTranslateCached(sourceName), 2800, 'tradução do título em cache').catch(() => sourceName) : Promise.resolve(''),
            sourceSummary ? this.withTimeout(this.googleTranslateCached(sourceSummary), 3200, 'tradução da sinopse em cache').catch(() => sourceSummary) : Promise.resolve(''),
            rawChapters.length ? this.withTimeout(this.translateChapterTitlesGoogle(rawChapters), 3400, 'tradução dos capítulos em cache').catch(() => rawChapters) : Promise.resolve([]),
        ]);
        if (name) novel.name = name;
        if (summary) novel.summary = this.truncateSummary(summary, 2000);
        if (Array.isArray(chapters) && chapters.length) novel.chapters = chapters;
        return novel;
    }
    async parseNovelFresh(novelPath) {
        const perf = this.perfStart('parseNovel', novelPath);
        if (this.mode === 'master' && this.isFactorySuccessPath(novelPath)) {
            const u = new URL(novelPath);
            const host = u.searchParams.get('host') || '';
            const label = this.factorySuccessLabel();
            return {
                name: host ? `${label} — ${this.prettyHost(host)}` : label,
                path: novelPath,
                summary: label,
                chapters: [],
            };
        }
        let url = this.requireHttpUrl(novelPath);
        let html = await this.withAbortTimeout((signal) => this.getText(url, 'metadata', signal), 12000, 'carregamento da obra');
        this.perfMark(perf, 'fetch-metadata', { bytes: String(html || '').length });
        let compactNovel = this.compactNovelHtml(html, url);
        this.perfMark(perf, 'compact-html', { bytes: String(compactNovel || '').length });
        let $ = (0, cheerio_1.load)(compactNovel);
        this.perfMark(perf, 'parse-dom');
        const inferredNovel = this.inferNovelUrl($, url);
        // A real work-detail URL is authoritative. v0.8.1 could misclassify a
        // Yuewen/XS8 detail page as reader-like, follow a recommendation link and
        // silently switch bookId before catalog extraction. That manifested as
        // opening book A while fetching /chapterlist/<book B>.
        if (!this.isCanonicalNovelDetailUrl(url) && inferredNovel && inferredNovel !== url && this.looksLikeChapterPage($, url)) {
            try {
                url = inferredNovel;
                html = await this.withAbortTimeout((signal) => this.getText(url, 'metadata', signal), 12000, 'carregamento da obra');
                compactNovel = this.compactNovelHtml(html, url);
                $ = (0, cheerio_1.load)(compactNovel);
            } catch (_) {}
        }
        let profile = await this.profileForUrl(url);
        const pageAdapter = this.detectNovelAdapter($, url);
        const learned = this.learnNovelPageProfile($, url, pageAdapter);
        profile = this.ensureProfile(this.mergeProfiles(profile, learned), url);
        if (profile) await this.registerProfile(profile);
        this.perfMark(perf, 'profile-adapter', { adapter: pageAdapter });
        const metadata = this.extractMetadata($, url, profile);
        const novelHint = this.getNovelHint(url);
        if ((!metadata.title || this.isGenericNovelTitle(metadata.title)) && novelHint?.name) metadata.title = novelHint.name;
        if (!metadata.cover && novelHint?.cover) metadata.cover = novelHint.cover;
        this.perfMark(perf, 'metadata', { hint: novelHint ? 1 : 0 });
        const remoteCatalog = this.detectRemoteCatalog($, url);
        let chapterFailure;
        let chapterResult;
        try {
            chapterResult = remoteCatalog
                ? {chapters: await this.fetchRemoteCatalogPage(url, remoteCatalog, 1)}
                : await this.extractChaptersDeep($, url, profile);
        } catch (error) {
            chapterFailure = error;
            chapterResult = {chapters: []};
        }
        // Compact parsing is the fast path. If it produced an obviously incomplete
        // detail result, retry the original DOM once (bounded by input size) instead
        // of returning a skeleton/zero-information novel.
        if (!remoteCatalog && (chapterResult?.chapters?.length || 0) < 2 && (!metadata.summary || !metadata.cover) && compactNovel !== html && String(html || '').length <= 2600000) {
            try {
                const full$ = (0, cheerio_1.load)(html);
                const fullMeta = this.extractMetadata(full$, url, profile);
                if ((!metadata.title || this.isGenericNovelTitle(metadata.title)) && fullMeta.title) metadata.title = fullMeta.title;
                if (!metadata.summary && fullMeta.summary) metadata.summary = fullMeta.summary;
                if (!metadata.cover && fullMeta.cover) metadata.cover = fullMeta.cover;
                if (!metadata.author && fullMeta.author) metadata.author = fullMeta.author;
                if (!metadata.artist && fullMeta.artist) metadata.artist = fullMeta.artist;
                if (!metadata.genres && fullMeta.genres) metadata.genres = fullMeta.genres;
                if (!metadata.rawStatus && fullMeta.rawStatus) metadata.rawStatus = fullMeta.rawStatus;
                const fullChapters = await this.extractChaptersDeep(full$, url, profile);
                if ((fullChapters?.chapters?.length || 0) > (chapterResult?.chapters?.length || 0)) chapterResult = fullChapters;
                this.perfMark(perf, 'full-dom-recovery', { chapters: chapterResult?.chapters?.length || 0 });
            } catch (_) {}
        }
        this.perfMark(perf, 'chapters', { chapters: chapterResult?.chapters?.length || 0 });
        let allChapters = chapterResult.chapters;
        if (!allChapters.length) {
            // Do not persist/cache an empty catalog as complete. A metadata-only
            // response preserves the book's cover/info; refresh retries extraction.
            const reason = chapterFailure?.message || 'Chapter catalog unavailable. Open WebView and refresh this book to retry.';
            this.perfFinish(perf, 'partial', {chapters: 0, error: reason});
            const [name, summary] = await Promise.all([
                this.withTimeout(this.googleTranslateCached(metadata.title || novelHint?.name || profile.host), 2800, 'tradução do título').catch(() => metadata.title || profile.host),
                this.withTimeout(this.googleTranslateCached([metadata.summary, reason].filter(Boolean).join('\n\n')), 3200, 'tradução da sinopse').catch(() => [metadata.summary, reason].filter(Boolean).join('\n\n')),
            ]);
            return {name, path:url, summary, ...(metadata.cover ? {cover:metadata.cover} : {}),
                ...(metadata.author ? {author:metadata.author} : {}),
                ...(metadata.genres ? {genres:metadata.genres} : {}),
                ...(metadata.rawStatus ? {status:this.normalizeNovelStatus(metadata.rawStatus)} : {})};
        }
        allChapters = allChapters.map((ch, i) => ({ ...ch, page: remoteCatalog ? '1' : String(Math.floor(i / this.catalogPageSize) + 1) }));
        if (remoteCatalog) this.rememberRemoteCatalog(url, remoteCatalog);
        else { this.rememberRemoteCatalog(url, null); this.setCatalogCache(url, allChapters); }
        const totalPages = remoteCatalog ? remoteCatalog.totalPages : Math.max(1, Math.ceil(allChapters.length / this.catalogPageSize));
        const firstRaw = remoteCatalog ? allChapters : allChapters.slice(0, this.catalogPageSize);
        let name = metadata.title || profile.siteName || profile.host;
        let summary = this.truncateSummary(metadata.summary || '', 2000);
        // LNReader natively understands paged chapter catalogs. Only page 1 blocks
        // the first paint; later pages are requested lazily through parsePage().
        const [translatedName, translatedSummary, firstChapters] = await Promise.all([
            name ? this.withTimeout(this.googleTranslateCached(name), 2800, 'tradução do título').catch(() => name) : Promise.resolve(name),
            summary ? this.withTimeout(this.googleTranslateCached(summary), 3200, 'tradução da sinopse').catch(() => summary) : Promise.resolve(summary),
            this.withTimeout(this.translateChapterTitlesGoogle(firstRaw), 3400, 'tradução dos títulos dos capítulos').catch(() => firstRaw),
        ]);
        name = translatedName || name;
        summary = this.truncateSummary(translatedSummary || summary, 2000);
        this.perfMark(perf, 'translate-first-paint', { firstChapters: firstRaw.length });
        const novel = {
            name,
            path: url,
            ...(metadata.cover ? { cover: metadata.cover } : {}),
            ...(metadata.author ? { author: metadata.author } : {}),
            ...(metadata.artist ? { artist: metadata.artist } : {}),
            ...(metadata.genres ? { genres: metadata.genres } : {}),
            ...(metadata.rawStatus ? { status: this.normalizeNovelStatus(metadata.rawStatus) } : {}),
            ...(summary ? { summary } : {}),
            chapters: firstChapters,
            totalPages,
        };
        // Keep source-language presentation values only inside the in-memory cache.
        // The property is non-enumerable, so LNReader never sees it in SourceNovel.
        this.attachNovelDisplayRaw(novel, { name: metadata.title || profile.siteName || profile.host, summary: this.truncateSummary(metadata.summary || '', 2000), chapters: firstRaw });
        const novelKey = this.novelIdentity(url);
        const refinement = {
            host: profile.host,
            novelRoutes: {
                [novelKey]: {
                    novelUrl: url,
                    ...(chapterResult.catalogUrl ? { catalogUrl: chapterResult.catalogUrl } : {}),
                    updatedAt: Date.now(),
                },
            },
            selectors: {
                ...(profile.selectors || {}),
                ...(metadata.selectors || {}),
                ...(chapterResult.chapterSelector && !String(chapterResult.chapterSelector).startsWith('shuqi:') ? { chapterLink: chapterResult.chapterSelector } : {}),
            },
            ...(pageAdapter !== 'generic' ? { novelAdapter: pageAdapter } : {}),
        };
        await this.refineProfile(refinement);
        Object.defineProperty(novel, '__thExpires', {value: Date.now() + 120000, enumerable: false});
        this.metadataCache.set(novelKey, novel);
        // Navigation safety: never launch hidden chapter translation/prefetch from
        // the novel-details screen. Those jobs outlive the screen in LNReader and
        // can monopolize Hermes exactly when the user presses Back. parsePage() and
        // parseChapter() now do work only when LNReader explicitly requests it.
        this.perfMark(perf, 'cache-refine', { totalPages });
        this.perfFinish(perf, 'ok', { chapters: allChapters.length, totalPages });
        if (this.metadataCache.size > 8) {
            const first = this.metadataCache.keys().next().value;
            if (first) this.metadataCache.delete(first);
        }
        return novel;
    }
    async parsePage(novelPath, page) {
        const perf = this.perfStart('parsePage', novelPath);
        const url = this.requireHttpUrl(novelPath);
        const pageNo = Math.max(1, Number.parseInt(String(page || '1'), 10) || 1);
        let remote = this.getRemoteCatalog(url);
        if (remote) {
            const rows = await this.fetchRemoteCatalogPage(url, remote, pageNo);
            return {chapters: await this.withTimeout(this.translateChapterTitlesGoogle(rows), 1200, 'tradução da página remota').catch(() => rows)};
        }
        let chapters = this.getCatalogCache(url);
        if (!chapters?.length) {
            const html = await this.getText(url, 'catalog');
            const $ = (0, cheerio_1.load)(html);
            remote = this.detectRemoteCatalog($, url);
            if (remote) {
                this.rememberRemoteCatalog(url, remote);
                const rows = await this.fetchRemoteCatalogPage(url, remote, pageNo);
                return {chapters: await this.withTimeout(this.translateChapterTitlesGoogle(rows), 1200, 'tradução da página remota').catch(() => rows)};
            }
            const profile = this.ensureProfile(await this.profileForUrl(url), url);
            const result = await this.extractChaptersDeep($, url, profile);
            if (!result.chapters?.length) throw this.catalogIncomplete('nenhum capítulo reconhecido nesta obra');
            chapters = (result.chapters || []).map((ch, i) => ({ ...ch, page: String(Math.floor(i / this.catalogPageSize) + 1) }));
            if (chapters.length) this.setCatalogCache(url, chapters);
        }
        const start = (pageNo - 1) * this.catalogPageSize;
        const rawPage = (chapters || []).slice(start, start + this.catalogPageSize).map(ch => ({ ...ch, page: String(pageNo) }));
        const translated = await this.withTimeout(this.translateChapterTitlesGoogle(rawPage), 1200, 'tradução da página de capítulos').catch(() => rawPage);
        this.perfFinish(perf, 'ok', { page: pageNo, chapters: translated.length });
        return { chapters: translated };
    }
    async parseChapter(chapterPath) {
        const url = this.requireHttpUrl(chapterPath);
        const hit = this.chapterCache.get(url);
        if (hit)
            return hit;
        const persistentHit = this.getPersistentChapterCache(url);
        if (persistentHit) {
            this.chapterCache.set(url, persistentHit);
            return persistentHit;
        }
        const running = this.chapterInFlight.get(url);
        if (running)
            return await running;
        const task = this.parseChapterFresh(url)
            .finally(() => this.chapterInFlight.delete(url));
        this.chapterInFlight.set(url, task);
        return await task;
    }
    async parseChapterFresh(url) {
        const perf = this.perfStart('parseChapter', url);
        const profile = this.ensureProfile(await this.profileForUrl(url), url);
        this.perfMark(perf, 'profile');
        const attempted = new Set();
        const queue = [url];
        let extracted = null;
        let cloudflareSeen = false;
        let lastError = null;
        while (queue.length && attempted.size < 4 && !extracted) {
            const current = queue.shift();
            if (!current || attempted.has(current))
                continue;
            attempted.add(current);
            try {
                const html = await this.withTimeout(this.getText(current, 'chapter'), 18000, 'carregamento do capítulo');
                this.perfMark(perf, 'fetch-chapter', { bytes: String(html || '').length, attempt: attempted.size });
                const $ = (0, cheerio_1.load)(html);
                this.perfMark(perf, 'parse-dom');
                const meta = this.fetchMeta.get(current) || {};
                if (meta.cloudflare)
                    cloudflareSeen = true;
                extracted = this.extractChapterPayload($, html, current, profile);
                this.perfMark(perf, 'extract-content', { blocks: extracted?.blocks?.length || 0 });
                if (!extracted || extracted.blocks.length < 1) {
                    for (const candidate of this.discoverChapterContentUrls($, current)) {
                        if (!attempted.has(candidate) && !queue.includes(candidate))
                            queue.push(candidate);
                    }
                    extracted = null;
                }
            }
            catch (error) {
                lastError = error;
                if (error?.cloudflare || error?.protection?.cloudflare)
                    cloudflareSeen = true;
            }
        }
        if (!extracted || !extracted.blocks.length) {
            this.perfFinish(perf, 'error', { error: cloudflareSeen ? 'cloudflare/no-content' : 'no-content', attempts: attempted.size });
            if (cloudflareSeen && profile) {
                try {
                    await this.refineProfile({ host: profile.host, protection: this.mergeProtection(profile.protection, { cloudflare: true, challenge: true }) });
                }
                catch (_) { }
            }
            if (cloudflareSeen || profile?.protection?.cloudflare)
                throw new Error('Translator Hell: Cloudflare detectado. Abra o WebView desta fonte, conclua a verificação e toque em Tentar novamente.');
            if (lastError && /HTTP\s+(401|403|429|503)/i.test(String(lastError?.message || '')))
                throw lastError;
            throw new Error('Translator Hell: conteúdo do capítulo não encontrado. O site pode carregar o texto por JavaScript; tente o WebView uma vez e repita.');
        }
        // Translate groups of paragraphs instead of one HTTP request per paragraph.
        // This makes normal reading and LNReader chapter downloads substantially
        // faster while keeping the returned payload already translated.
        const translated = await this.translateChapterBlocks(extracted.blocks);
        this.perfMark(perf, 'translate', { blocks: extracted.blocks.length });
        const result = extracted.blocks
            .map((original, index) => {
                const visible = translated[index] || original;
                return `<p data-th-original="${this.escapeHtml(original)}">${this.escapeHtml(visible)}</p>`;
            })
            .filter(Boolean)
            .join('\n');
        if (!result)
            throw new Error('Translator Hell: tradutor retornou conteúdo vazio');
        this.chapterCache.set(url, result);
        this.setPersistentChapterCache(url, result);
        // Navigation safety: do not start hidden next-chapter translation from the
        // reader. LNReader has no lifecycle callback to cancel it when Back is
        // pressed, so all chapter work is demand-driven in v0.7.9.
        if (this.chapterCache.size > 8) {
            const first = this.chapterCache.keys().next().value;
            if (first)
                this.chapterCache.delete(first);
        }
        if (profile) {
            const selectorChanged = !!extracted.selector && extracted.selector !== profile?.selectors?.chapterContent;
            const meta = this.fetchMeta.get(url);
            const protectionChanged = !!meta?.cloudflare && !profile?.protection?.cloudflare;
            if (selectorChanged || protectionChanged) {
                const refinement = {
                    host: profile.host,
                    selectors: {
                        ...(profile.selectors || {}),
                        ...(extracted.selector ? { chapterContent: extracted.selector } : {}),
                    },
                };
                if (meta?.cloudflare)
                    refinement.protection = this.mergeProtection(profile.protection, meta);
                // Profile learning is useful, but it is not allowed to hold the
                // chapter open/download hostage if the local factory is busy.
                Promise.resolve(this.refineProfile(refinement)).catch(() => {});
            }
        }
        this.perfFinish(perf, 'ok', { blocks: extracted.blocks.length, attempts: attempted.size });
        return result;
    }
    async translateChapterBlocks(blocks) {
        const source = (blocks || []).map(v => this.norm(v)).filter(Boolean);
        if (!source.length)
            return [];
        const batches = [];
        let current = [];
        let size = 0;
        const flush = () => {
            if (!current.length) return;
            // Blank lines are natural translation boundaries and do not leak
            // private-use glyphs into the reader when a provider mutates markers.
            batches.push({ parts: current.slice(), text: current.join('\n\n') });
            current = [];
            size = 0;
        };
        for (const part of source) {
            const add = part.length + 2;
            if (current.length && (size + add > 2400 || current.length >= 5))
                flush();
            current.push(part);
            size += add;
        }
        flush();
        const config = await this.loadTranslationConfig();
        const hasAI = this.availableProviderIds(config).length > 0;
        const translatedBatches = new Array(batches.length);
        let cursor = 0;
        const workers = Math.min(hasAI ? 2 : 4, batches.length || 1);
        await Promise.all(Array.from({ length: workers }, async () => {
            while (true) {
                const index = cursor++;
                if (index >= batches.length)
                    break;
                const batch = batches[index];
                let value = '';
                try {
                    value = await this.withTimeout(this.translateText(batch.text, config), hasAI ? 24000 : 15000, 'tradução do capítulo');
                }
                catch (_) {
                    try {
                        value = await this.withTimeout(this.googleTranslate(batch.text), 15000, 'Google Translate');
                    }
                    catch (_) {
                        value = batch.text;
                    }
                }
                translatedBatches[index] = this.cleanTranslationArtifacts(value);
            }
        }));
        const out = [];
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const value = this.cleanTranslationArtifacts(translatedBatches[i] || batch.text);
            let pieces = value.split(/\n\s*\n+/).map(v => this.norm(v)).filter(Boolean);
            if (pieces.length !== batch.parts.length) {
                const linePieces = value.split(/\n+/).map(v => this.norm(v)).filter(Boolean);
                if (linePieces.length === batch.parts.length)
                    pieces = linePieces;
                else
                    pieces = [this.norm(value)];
            }
            out.push(...pieces);
        }
        return out;
    }
    async withTimeout(promise, ms, label) {
        let timer;
        // Promise.race does not cancel the losing operation. Always attach a handler
        // to the original Promise so a late rejection is consumed, and make callers
        // that do heavy post-fetch work check their work budget before parsing.
        const guarded = Promise.resolve(promise);
        guarded.catch(() => {});
        try {
            return await Promise.race([
                guarded,
                new Promise((_, reject) => {
                    timer = setTimeout(() => {
                        const error = new Error(`Translator Hell: tempo excedido em ${label || 'operação'}`);
                        error.status = 408;
                        error.timeout = true;
                        reject(error);
                    }, Math.max(100, Number(ms || 15000)));
                }),
            ]);
        }
        finally {
            if (timer) clearTimeout(timer);
        }
    }
    async withAbortTimeout(factory, ms, label) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        try {
            return await this.withTimeout(Promise.resolve().then(() => factory(controller?.signal)), ms, label);
        } catch (error) {
            if (error?.timeout && controller) {
                try { controller.abort(); } catch (_) {}
            }
            throw error;
        }
    }
    async getProfiles() {
        try {
            const data = await this.factoryRequest('/api/factory/profiles', { method: 'GET' });
            return Array.isArray(data?.profiles) ? data.profiles : [];
        }
        catch (_) {
            return this.embeddedProfile ? [this.embeddedProfile] : [];
        }
    }
    async getCurrentProfile() {
        if (this.mode === 'master') return null;
        const host = CONFIG.host || this.embeddedProfile?.host;
        if (!host) return this.embeddedProfile;
        const hit = this.profileCache.get(host);
        if (hit) return hit;
        // Generated children are self-contained. Opening a source must never wait
        // for the optional Termux factory server on 127.0.0.1.
        const local = this.readLocalProfile();
        const profile = this.ensureProfile(this.mergeProfiles(this.embeddedProfile, local), this.embeddedProfile?.seedUrl || this.embeddedProfile?.novelUrl || this.site, host);
        if (profile) {
            this.profileCache.set(host, profile);
            this.writeLocalProfile(profile);
        }
        return profile;
    }
    minimalProfile(url, hostOverride) {
        try {
            const u = new URL(this.asHttpUrl(url) || `https://${hostOverride || ''}`);
            const host = hostOverride || u.hostname;
            return {
                host,
                origin: u.origin,
                siteName: this.prettyHost(host),
                seedUrl: this.asHttpUrl(url) || u.origin,
                selectors: {},
                searchTemplates: [],
                listingUrls: [],
                filterDefinitions: [],
            };
        } catch (_) {
            const host = String(hostOverride || CONFIG.host || this.embeddedProfile?.host || '').trim();
            if (!host) return null;
            return { host, origin: `https://${host}`, siteName: this.prettyHost(host), selectors: {}, searchTemplates: [], listingUrls: [], filterDefinitions: [] };
        }
    }
    ensureProfile(profile, url, hostOverride) {
        const base = this.minimalProfile(url, hostOverride || profile?.host);
        const merged = this.mergeProfiles(base, profile);
        if (!merged) return base;
        return {
            ...merged,
            selectors: merged.selectors || {},
            searchTemplates: Array.isArray(merged.searchTemplates) ? merged.searchTemplates : [],
            listingUrls: Array.isArray(merged.listingUrls) ? merged.listingUrls : [],
            filterDefinitions: Array.isArray(merged.filterDefinitions) ? merged.filterDefinitions : [],
        };
    }
    async profileForUrl(url) {
        const u = new URL(url);
        const host = u.hostname;
        const hit = this.profileCache.get(host);
        if (hit)
            return hit;
        if (this.mode === 'child' && this.embeddedProfile && this.sameSiteHost(this.embeddedProfile.host, host)) {
            const current = await this.getCurrentProfile();
            if (current)
                return current;
        }
        try {
            const data = await this.factoryRequest('/api/factory/profile?host=' + encodeURIComponent(host), { method: 'GET' });
            if (data?.profile) {
                const safe = this.ensureProfile(data.profile, url, host);
                this.profileCache.set(host, safe);
                return safe;
            }
        }
        catch (_) { }
        return this.minimalProfile(url, host);
    }
    async registerProfile(profile) {
        if (!profile?.host)
            return null;
        const mergedLocal = this.mergeProfiles(this.readLocalProfile(), profile);
        this.profileCache.set(profile.host, mergedLocal || profile);
        this.writeLocalProfile(mergedLocal || profile);
        // Installed children are autonomous. Registering a refinement with the local
        // compiler is a Master concern; waiting 1.8s for 127.0.0.1 on every novel
        // open was enough to keep LNReader's detail skeleton visible unnecessarily.
        if (this.mode === 'child') return null;
        try {
            const data = await this.factoryRequest('/api/factory/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profile,
                    targetKey: CONFIG.targetKey,
                    targetLanguage: this.targetLanguage,
                    manifestLang: CONFIG.manifestLang,
                    targetLabel: CONFIG.targetLabel,
                    mode: this.mode,
                }),
            }, this.mode === 'master' ? 6200 : 1800);
            if (data?.profile)
                this.profileCache.set(profile.host, data.profile);
            if (!data?.ok) throw new Error('registro não confirmado');
            return data;
        }
        catch (cause) {
            throw Object.assign(new Error('Translator Hell: servidor da Factory indisponível; a criação não foi confirmada. Tente novamente.'), {factoryRegistration: true, cause});
        }
    }
    async refineProfile(refinement) {
        if (!refinement?.host) return;
        const base = this.profileCache.get(refinement.host) || this.readLocalProfile() || this.embeddedProfile;
        const local = this.mergeProfiles(base, refinement);
        if (local) {
            this.profileCache.set(refinement.host, local);
            this.writeLocalProfile(local);
            this.filters = this.buildLnFilters(local.filterDefinitions || []);
        }
        // A child keeps discoveries on-device. Synchronizing them back to the local
        // compiler is optional and must not become part of browse/novel latency.
        if (this.mode === 'child') return;
        try {
            const data = await this.factoryRequest('/api/factory/refine', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refinement, targetKey: CONFIG.targetKey, targetLanguage: this.targetLanguage, manifestLang: CONFIG.manifestLang, targetLabel: CONFIG.targetLabel, mode: this.mode }),
            });
            if (data?.profile) this.profileCache.set(refinement.host, data.profile);
        } catch (_) {}
    }
    async factoryRequest(path, init, timeoutMs = 1800) {
        const budget = Math.max(600, Number(timeoutMs || 1800));
        const response = await this.withAbortTimeout((signal) => (0, fetch_1.fetchApi)(this.factoryBase + path, { ...(init || {}), ...(signal ? { signal } : {}) }), budget, 'servidor local da Factory');
        if (!response.ok) throw new Error(`Translator Hell Factory HTTP ${response.status}`);
        return await this.withTimeout(response.json(), Math.min(1600, Math.max(700, Math.floor(budget * 0.28))), 'resposta da Factory');
    }
    readLocalProfile() {
        try {
            const raw = storage_1.storage.get(this.localProfileStorageKey);
            if (!raw)
                return null;
            if (typeof raw === 'string')
                return JSON.parse(raw);
            return typeof raw === 'object' ? raw : null;
        }
        catch (_) {
            return null;
        }
    }
    writeLocalProfile(profile) {
        if (!profile || this.mode !== 'child')
            return;
        try {
            storage_1.storage.set(this.localProfileStorageKey, JSON.stringify(profile));
        }
        catch (_) { }
    }
    buildLnFilters(definitions) {
        const defs = Array.isArray(definitions) ? definitions : [];
        if (!defs.length)
            return undefined;
        const out = {};
        for (const def of defs.slice(0, 16)) {
            const key = this.norm(def?.key || '');
            if (!key || key === '__proto__' || key === 'constructor')
                continue;
            const label = this.norm(def?.label || key) || key;
            if (def.type === 'switch') {
                out[key] = { label, type: filterInputs_1.FilterTypes.Switch, value: Boolean(def.value) };
                continue;
            }
            if (def.type === 'text') {
                out[key] = { label, type: filterInputs_1.FilterTypes.TextInput, value: String(def.value || '') };
                continue;
            }
            const options = (Array.isArray(def.options) ? def.options : [])
                .map(x => ({ label: this.norm(x?.label || x?.value), value: String(x?.value ?? '') }))
                .filter(x => x.label && x.value !== '')
                .slice(0, 40);
            if (options.length >= 2) {
                if (def.type === 'checkbox') {
                    out[key] = { label, type: filterInputs_1.FilterTypes.CheckboxGroup, value: Array.isArray(def.value) ? def.value.map(String) : [], options };
                } else if (def.type === 'xcheckbox' && filterInputs_1.FilterTypes.ExcludableCheckboxGroup) {
                    const value = def.value && typeof def.value === 'object' ? def.value : { include: [], exclude: [] };
                    out[key] = { label, type: filterInputs_1.FilterTypes.ExcludableCheckboxGroup, value, options };
                } else {
                    out[key] = { label, type: filterInputs_1.FilterTypes.Picker, value: String(def.value ?? options[0].value), options };
                }
            }
        }
        return Object.keys(out).length ? out : undefined;
    }
    mergeFilterDefinitions(a, b) {
        const map = new Map();
        for (const item of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
            const key = this.norm(item?.key || '');
            if (!key)
                continue;
            const previous = map.get(key) || {};
            const merged = { ...previous, ...item, key };
            if (previous.options || item.options) {
                const optionMap = new Map();
                for (const opt of [...(previous.options || []), ...(item.options || [])]) {
                    const value = String(opt?.value ?? '');
                    if (!value)
                        continue;
                    optionMap.set(value, { ...optionMap.get(value), ...opt, value });
                }
                merged.options = Array.from(optionMap.values()).slice(0, 40);
            }
            map.set(key, merged);
        }
        return Array.from(map.values()).slice(0, 16);
    }
    discoverFilters($, base) {
        const defs = [];
        const ignored = /^(q|s|search|keyword|keywords|key|kw|wd|query|searchkey|search_key|searchword|page|p|pageNo|pageNum|submit|token|csrf|_token)$/i;
        const labelFor = (node, key) => {
            const id = this.norm(node.attr('id'));
            let label = '';
            if (id) {
                try { label = this.norm($(`label[for="${id.replace(/"/g, '\\"')}"]`).first().text()); }
                catch (_) { }
            }
            if (!label)
                label = this.norm(node.closest('label').text());
            if (!label)
                label = this.norm(node.closest('.filter,.filters,.select,.form-group,.field,.option').find('.label,label,.title,.name').first().text());
            return (label || key).replace(/[：:]\s*$/, '').slice(0, 80);
        };
        $('form').each((_i, el) => {
            const form = $(el);
            const method = String(form.attr('method') || 'get').toLowerCase();
            if (method !== 'get')
                return;
            const action = this.resolveAgainst(form.attr('action') || base, base);
            if (!action)
                return;
            try {
                if (!this.sameSiteHost(new URL(action).hostname, new URL(base).hostname))
                    return;
            }
            catch (_) { return; }
            form.find('select[name]').each((_j, sel) => {
                const node = $(sel);
                const key = this.norm(node.attr('name'));
                if (!key || ignored.test(key))
                    return;
                const options = [];
                node.find('option').each((_k, opt) => {
                    const o = $(opt);
                    const value = this.norm(o.attr('value'));
                    const label = this.norm(o.text());
                    if (!label || value === '')
                        return;
                    options.push({ label, value });
                });
                if (options.length >= 2 && options.length <= 40) {
                    defs.push({
                        key, label: labelFor(node, key), type: 'picker',
                        value: this.norm(node.find('option[selected]').first().attr('value')) || options[0].value,
                        options, action,
                    });
                }
            });
            const checkGroups = new Map();
            form.find('input[type="radio"][name],input[type="checkbox"][name]').each((_j, input) => {
                const node = $(input);
                const key = this.norm(node.attr('name'));
                if (!key || ignored.test(key))
                    return;
                const type = String(node.attr('type') || '').toLowerCase();
                const value = this.norm(node.attr('value')) || '1';
                const label = labelFor(node, value);
                if (!checkGroups.has(key))
                    checkGroups.set(key, { type, values: [], action, label: labelFor(node, key) });
                checkGroups.get(key).values.push({ label, value, checked: node.is('[checked]') });
            });
            for (const [key, group] of checkGroups.entries()) {
                if (group.type === 'checkbox' && group.values.length === 1) {
                    defs.push({ key, label: group.label, type: 'switch', value: Boolean(group.values[0].checked), action: group.action, onValue: group.values[0].value });
                }
                else if (group.values.length >= 2 && group.values.length <= 40) {
                    if (group.type === 'checkbox') {
                        const checked = group.values.filter(x => x.checked).map(x => x.value);
                        const signal = `${group.label} ${key}`;
                        const xmode = /(排除|不含|exclude|without)/i.test(signal);
                        defs.push({ key, label: group.label, type: xmode ? 'xcheckbox' : 'checkbox', value: xmode ? { include: [], exclude: checked } : checked, options: group.values.map(({ label, value }) => ({ label, value })), action: group.action });
                    } else {
                        const checked = group.values.find(x => x.checked);
                        defs.push({ key, label: group.label, type: 'picker', value: checked?.value || group.values[0].value, options: group.values.map(({ label, value }) => ({ label, value })), action: group.action });
                    }
                }
            }
        });
        // Many Chinese sites implement filters as rows of links instead of <select>.
        const linkGroups = new Map();
        $('a[href]').each((_i, el) => {
            const a = $(el);
            const href = this.resolveAgainst(a.attr('href'), base);
            const label = this.norm(a.text());
            if (!href || !label || label.length > 48)
                return;
            let u;
            try { u = new URL(href); }
            catch (_) { return; }
            try { if (!this.sameSiteHost(u.hostname, new URL(base).hostname)) return; }
            catch (_) { return; }
            for (const [key, value] of u.searchParams.entries()) {
                if (!key || !value || ignored.test(key) || !/(cat|category|class|genre|type|status|sort|order|rank|channel|tag|sex|word|size|finish|state|update|letter)/i.test(key))
                    continue;
                if (!linkGroups.has(key))
                    linkGroups.set(key, new Map());
                linkGroups.get(key).set(value, { label, value });
            }
        });
        for (const [key, values] of linkGroups.entries()) {
            const options = Array.from(values.values());
            if (options.length >= 2 && options.length <= 30)
                defs.push({ key, label: key, type: 'picker', value: options[0].value, options, action: base });
        }
        // Link-only genre/category navigation is extremely common on Chinese and
        // English novel portals. Compile it even without query parameters.
        const genreWords = /^(玄幻|奇幻|都市|言情|穿越|青春|仙侠|仙俠|武侠|武俠|灵异|靈異|悬疑|懸疑|历史|歷史|军事|軍事|游戏|遊戲|竞技|競技|科幻|职场|職場|官场|官場|现言|現言|耽美|其它|其他|fantasy|urban|romance|historical|history|sci[- ]?fi|science fiction|mystery|horror|action|adventure|xianxia|wuxia|xuanhuan|game|sports)$/i;
        const pathCategories = [];
        const pathSeen = new Set();
        $('a[href]').each((_i, el) => {
            const a = $(el);
            const label = this.norm(a.text());
            if (!genreWords.test(label)) return;
            const href = this.resolveAgainst(a.attr('href'), base);
            if (!href || pathSeen.has(href)) return;
            try { if (!this.sameSiteHost(new URL(href).hostname, new URL(base).hostname)) return; } catch (_) { return; }
            const pathname = (() => { try { return new URL(href).pathname; } catch (_) { return ''; } })();
            if (!/(?:\/c\/|\/category\/|\/class\/|\/channel\/|\/genre\/|\/sort\/)/i.test(pathname)) return;
            pathSeen.add(href);
            pathCategories.push({ label, value: href });
        });
        if (pathCategories.length >= 2 && pathCategories.length <= 40) {
            defs.push({ key: '__th_category_url', label: '分类 / Category', type: 'picker', mode: 'url', value: pathCategories[0].value, options: pathCategories, action: base });
        }
        return this.mergeFilterDefinitions([], defs);
    }
    selectedFilterValue(value) {
        if (value && !Array.isArray(value) && typeof value === 'object' && 'value' in value) return value.value;
        return value;
    }
    applyDetectedFiltersToUrl(rawUrl, profile, selectedFilters) {
        const defs = profile?.filterDefinitions || [];
        if (!defs.length || !selectedFilters)
            return rawUrl;
        let base = rawUrl;
        const urlDef = defs.find(def => def?.mode === 'url' && this.selectedFilterValue(selectedFilters?.[def.key]));
        if (urlDef) base = String(this.selectedFilterValue(selectedFilters?.[urlDef.key]));
        const action = defs.find(def => def?.mode !== 'url' && def?.action && this.selectedFilterValue(selectedFilters?.[def.key]) !== undefined)?.action;
        if (action && !urlDef)
            base = action;
        try {
            const u = new URL(base, rawUrl);
            for (const def of defs) {
                const raw = this.selectedFilterValue(selectedFilters?.[def.key]);
                if (raw === undefined || raw === null || raw === '')
                    continue;
                if (def.mode === 'url')
                    continue;
                if (def.type === 'switch') {
                    if (raw)
                        u.searchParams.set(def.key, String(def.onValue || '1'));
                    else
                        u.searchParams.delete(def.key);
                }
                else if (Array.isArray(raw)) {
                    u.searchParams.delete(def.key);
                    for (const value of raw) if (value !== undefined && value !== null && String(value) !== '') u.searchParams.append(def.key, String(value));
                }
                else if (raw && typeof raw === 'object' && ('include' in raw || 'exclude' in raw)) {
                    u.searchParams.delete(def.key);
                    for (const value of (raw.include || [])) u.searchParams.append(def.key, String(value));
                    const excludeKey = def.excludeKey || `exclude_${def.key}`;
                    u.searchParams.delete(excludeKey);
                    for (const value of (raw.exclude || [])) u.searchParams.append(excludeKey, String(value));
                }
                else {
                    u.searchParams.set(def.key, String(raw));
                }
            }
            return u.href;
        }
        catch (_) {
            return rawUrl;
        }
    }
    looksLikeNovelDocument($, url) {
        try {
            if (this.detectNovelAdapter($, url) !== 'generic') return true;
            const meta = this.extractMetadata($, url);
            const chapterSelector = this.findBestChapterSelector($, url);
            const chapterCount = chapterSelector ? $(chapterSelector).length : 0;
            const path = new URL(url).pathname.toLowerCase();
            return (!!meta?.title && (!!meta?.summary || !!meta?.cover) && chapterCount >= 1)
                || /\/(?:book|novel|story|obra|producto|product|n)\//i.test(path);
        } catch (_) { return false; }
    }
    learnSiteProfile($, url, originalUrl, rawHtml = '') {
        const u = new URL(url);
        const raw = String(rawHtml || '');
        const detected = raw ? this.detectBrowseAdapter(raw, url) : { type:'generic', paginationMode:'auto' };
        const adapter = detected?.type || 'generic';
        const adapterItems = this.extractAdapterBrowseItems($, url, '', adapter);
        const genericItems = adapterItems.length >= 2 ? [] : this.extractNovelCandidates($, url, '');
        const visibleItems = adapterItems.length >= 2 ? adapterItems : genericItems;
        let listingUrls = this.discoverListingLinks($, url);
        // If the supplied page itself is a real browse/archive, preserve it as the
        // strongest listing route. This is critical for sites whose catalog lives
        // directly on / or on a non-obvious translated path.
        if (visibleItems.length >= 4) listingUrls = this.uniqueStrings([this.listingBaseUrl(url), ...listingUrls]);
        const siteIconUrl = this.extractSiteIcon($, url);
        const siteManifestUrl = this.extractSiteManifest($, url);
        return {
            host: u.hostname, origin: u.origin, siteName: this.prettyHost(u.hostname), seedUrl: originalUrl || url, sourceRoot: u.origin + '/',
            ...(siteIconUrl ? { siteIconUrl } : {}),
            ...(siteManifestUrl ? { siteManifestUrl } : {}),
            siteIconCandidates: this.extractSiteIconCandidates($, url),
            searchTemplates: this.discoverSearchTemplates($, url),
            listingUrls,
            filterDefinitions: this.discoverFilters($, url),
            ...(adapter !== 'generic' ? { browseAdapter: adapter, paginationMode: detected.paginationMode || 'auto' } : {}),
            ...(this.fetchMeta.get(url)?.cloudflare ? { protection: this.mergeProtection(undefined, this.fetchMeta.get(url)) } : {}),
        };
    }
    learnDetailProfile($, url) {
        const u = new URL(url);
        const adapter = this.detectNovelAdapter($, url);
        const metadata = this.extractMetadata($, url);
        const chapterSelector = this.findBestChapterSelector($, url);
        return {
            host:u.hostname, origin:u.origin, siteName:this.prettyHost(u.hostname),
            ...(adapter !== 'generic' ? { novelAdapter:adapter } : {}),
            selectors:{ ...(metadata.selectors || {}), ...(chapterSelector ? {chapterLink:chapterSelector} : {}) },
            ...(this.fetchMeta.get(url)?.cloudflare ? { protection:this.mergeProtection(undefined, this.fetchMeta.get(url)) } : {}),
        };
    }
    learnNovelPageProfile($, url, adapter) {
        const u = new URL(url);
        const metadata = this.extractMetadata($, url);
        // Detail adapters deliberately avoid site-wide scans (filters, search
        // templates, generic catalog guesses). Those were already learned on browse
        // and can multiply hundreds of product/chapter anchors on a single page.
        return {
            host: u.hostname,
            origin: u.origin,
            siteName: this.prettyHost(u.hostname),
            seedUrl: url,
            ...(adapter && adapter !== 'generic' ? { novelAdapter: adapter } : {}),
            selectors: { ...(metadata.selectors || {}) },
            ...(this.fetchMeta.get(url)?.cloudflare ? { protection: this.mergeProtection(undefined, this.fetchMeta.get(url)) } : {}),
        };
    }
    learnProfile($, url, originalUrl) {
        const u = new URL(url);
        const metadata = this.extractMetadata($, url);
        const novelAdapter = this.detectNovelAdapter($, url);
        const catalogLinks = novelAdapter === 'woocommerce-product' ? [] : this.discoverCatalogLinks($, url);
        const chapterSelector = this.findBestChapterSelector($, url);
        const listingUrls = this.discoverListingLinks($, url);
        // Child plugin identity deliberately comes from DNS, not page branding.
        // This keeps generated sources stable even when a site changes its <title>/branding.
        const siteName = this.prettyHost(u.hostname);
        const siteIconUrl = this.extractSiteIcon($, url);
        const siteManifestUrl = this.extractSiteManifest($, url);
        return {
            host: u.hostname,
            origin: u.origin,
            siteName,
            ...(siteIconUrl ? { siteIconUrl } : {}),
            ...(siteManifestUrl ? { siteManifestUrl } : {}),
            seedUrl: originalUrl || url,
            selectors: {
                ...(metadata.selectors || {}),
                ...(chapterSelector ? { chapterLink: chapterSelector } : {}),
            },
            searchTemplates: this.discoverSearchTemplates($, url),
            listingUrls,
            ...(novelAdapter !== 'generic' ? { novelAdapter } : {}),
            filterDefinitions: this.discoverFilters($, url),
            ...(this.fetchMeta.get(url)?.cloudflare ? { protection: this.mergeProtection(undefined, this.fetchMeta.get(url)) } : {}),
        };
    }
    mergeProfiles(a, b) {
        if (!a)
            return b;
        if (!b)
            return a;
        return {
            ...a,
            ...b,
            selectors: { ...(a.selectors || {}), ...(b.selectors || {}) },
            searchTemplates: this.uniqueStrings([...(a.searchTemplates || []), ...(b.searchTemplates || [])]),
            listingUrls: this.uniqueStrings([...(a.listingUrls || []), ...(b.listingUrls || [])]),
            siteIconCandidates: this.uniqueStrings([...(a.siteIconCandidates || []), ...(b.siteIconCandidates || [])]).slice(0, 16),
            novelRoutes: { ...(a.novelRoutes || {}), ...(b.novelRoutes || {}) },
            // sourceRoot/seedUrl describe the generated extension, not the last novel
            // opened inside it. Preserve the original source context whenever known.
            ...(a.sourceRoot ? {sourceRoot:a.sourceRoot} : b.sourceRoot ? {sourceRoot:b.sourceRoot} : {}),
            ...(a.seedUrl ? {seedUrl:a.seedUrl} : b.seedUrl ? {seedUrl:b.seedUrl} : {}),
            filterDefinitions: this.mergeFilterDefinitions(a.filterDefinitions || [], b.filterDefinitions || []),
            protection: this.mergeProtection(a.protection, b.protection),
        };
    }
    isGenericNovelTitle(text) {
        const value = this.norm(text);
        if (!value)
            return true;
        if (/^(?:内容简介|內容簡介|作品简介|作品簡介|书籍简介|書籍簡介|简介|簡介|目录|目錄|章节目录|章節目錄|书库|書庫|作品库|作品庫|排行榜|分类|分類|最新章节|最新章節|全部章节|全部章節|作者|更新时间|更新時間|summary|synopsis|description|overview|chapters?|chapter\s+list|table\s+of\s+contents|catalog(?:ue)?|author|library|ranking|categories?)$/i.test(value))
            return true;
        if (/(?:小说|小說).{0,12}(?:排行榜|排行|推荐|推薦|分类|分類|书库|書庫|大全|1000\s*本|\d+\s*本)|(?:排行榜|分类|分類|推荐|推薦).{0,12}(?:小说|小說)|(?:搜索|搜尋).{0,30}(?:小说|小說)|(?:免费阅读|免費閱讀|在线阅读|在線閱讀|全部章节|全部章節)|\b(?:books?|novels?)\s*\d+\b/i.test(value))
            return true;
        if (/\b\d+(?:\.\d+)?\s*(?:copies?|books?|novels?)\s*$/i.test(value))
            return true;
        if (/\d+(?:\.\d+)?\s*(?:万|萬)?\s*本\s*$/i.test(value))
            return true;
        if (/^(?:短篇|长篇|長篇|言情|玄幻|仙侠|仙俠|武侠|武俠|都市|科幻|历史|歷史|游戏|遊戲|轻小说|輕小說|男频|男頻|女频|女頻)?(?:小说|小說)$/i.test(value))
            return true;
        return false;
    }
    cleanNovelTitleText(text, $) {
        let out = this.cleanTitle(this.norm(text), $);
        out = out
            .replace(/^《|》$/g, '')
            .replace(/\s*[-_|–—]\s*(?:最新章节|最新章節|全文阅读|全文閱讀|免费阅读|免費閱讀|在线阅读|在線閱讀).*$/i, '')
            .replace(/(?:小说|小說)_?搜索.*$/i, '')
            .replace(/\s*[（(][^（）()]{1,40}[、，,][^（）()]{1,40}[）)]\s*$/, '')
            .replace(/\s+(?:\d+(?:\.\d+)?\s*(?:万|萬)?\s*本|\d+(?:\.\d+)?\s*(?:copies?|books?|novels?))\s*$/i, '')
            .trim();
        return this.norm(out);
    }
    pickSemanticTitle($, base, profile, ld) {
        const candidates = [];
        const add = (raw, score, selector) => {
            const value = this.cleanNovelTitleText(raw, $);
            if (!value || value.length < 2 || value.length > 180 || this.isGenericNovelTitle(value))
                return;
            let finalScore = score;
            if (/第\s*[0-9零〇一二三四五六七八九十百千]+\s*章|chapter\s*\d+/i.test(value))
                finalScore -= 14;
            candidates.push({ value, score: finalScore, selector });
        };
        let u = null;
        try { u = new URL(base); } catch (_) { }
        const xs8BookQuery = !!u && /(?:^|\.)xs8\.cn$/i.test(u.hostname) && /^\/bookquery\//i.test(u.pathname);
        if (profile?.selectors?.title) {
            try {
                const spec = this.parseSelectorSpec(profile.selectors.title);
                add(spec.attr ? $(spec.selector).first().attr(spec.attr) : $(spec.selector).first().text(), 38, profile.selectors.title);
            } catch (_) { }
        }
        // On Xs8 /bookquery pages H1 is the query/category phrase while H2 is the
        // actual work title. Give H2 an explicit preference there.
        const headingSelector = xs8BookQuery ? 'h2,h3,h1,[class*="book-title"],[class*="book-name"],[class*="novel-title"]' : 'h1,h2,h3,[class*="book-title"],[class*="book-name"],[class*="novel-title"]';
        $(headingSelector).slice(0, 40).each((_i, el) => {
            const node = $(el);
            const tag = String(el?.tagName || el?.name || '').toLowerCase();
            const raw = node.attr('title') || node.text();
            const parentText = this.norm(node.parent().text());
            let score = tag === 'h1' ? 20 : tag === 'h2' ? 18 : 13;
            if (xs8BookQuery && tag === 'h2') score += 20;
            if (/(作者|author)\s*[:：]/i.test(parentText)) score += 9;
            if (node.parent().find('img').length || node.closest('article,section,div').find('img').length) score += 4;
            add(raw, score, this.cssHintForNode(node));
        });
        if (ld?.name || ld?.headline)
            add(ld?.name || ld?.headline, xs8BookQuery ? 10 : 25, undefined);
        try {
            add($('meta[property="og:title"],meta[name="og:title"]').attr('content'), 17, 'meta[property="og:title"],meta[name="og:title"]@content');
            add($('meta[name="twitter:title"]').attr('content'), 15, 'meta[name="twitter:title"]@content');
            add($('title').first().text(), 8, 'title');
        } catch (_) { }
        candidates.sort((a, b) => b.score - a.score || a.value.length - b.value.length);
        return candidates[0] || { value: '', selector: undefined };
    }
    cssHintForNode(node) {
        try {
            const tag = String(node?.[0]?.tagName || node?.[0]?.name || '').toLowerCase();
            const id = String(node.attr('id') || '').trim();
            if (id) return `#${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
            const cls = String(node.attr('class') || '').trim().split(/\s+/).filter(Boolean)[0];
            if (tag && cls) return `${tag}.${cls.replace(/[^a-zA-Z0-9_-]/g, '')}`;
            return tag || undefined;
        } catch (_) { return undefined; }
    }
    pickLabeledValue($, labels, minLength = 1, maxLength = 8000) {
        const wanted = labels.map(x => this.norm(x).toLowerCase()).filter(Boolean);
        let best = '';
        const nodes = $('h1,h2,h3,h4,h5,h6,strong,b,dt,dd,th,td,label,span,p,div');
        nodes.slice(0, 1600).each((_i, el) => {
            if (best) return;
            const node = $(el);
            const text = this.norm(node.text());
            if (!text || text.length > Math.max(220, maxLength + 30)) return;
            const lower = text.toLowerCase();
            for (const label of wanted) {
                if (lower === label || lower === label + ':' || lower === label + '：') {
                    let next = node.next();
                    for (let i = 0; i < 3 && next?.length; i++, next = next.next()) {
                        const value = this.norm(next.text());
                        if (value.length >= minLength && value.length <= maxLength && !wanted.includes(value.toLowerCase())) {
                            best = value;
                            return;
                        }
                    }
                    const parent = node.parent();
                    const parentText = this.norm(parent.text());
                    if (parentText.length > text.length) {
                        const value = this.norm(parentText.slice(text.length).replace(/^[:：\s]+/, ''));
                        if (value.length >= minLength && value.length <= maxLength) {
                            best = value;
                            return;
                        }
                    }
                }
                const prefix1 = label + ':';
                const prefix2 = label + '：';
                if (lower.startsWith(prefix1) || lower.startsWith(prefix2)) {
                    const value = this.norm(text.slice(label.length + 1));
                    if (value.length >= minLength && value.length <= maxLength) {
                        best = value;
                        return;
                    }
                }
            }
        });
        return best;
    }
    pickLabeledLongValue($, labels, minLength = 20, maxLength = 8000) {
        const wanted = labels.map(x => this.norm(x).toLowerCase()).filter(Boolean);
        let best = { value: '', score: -1, selector: undefined };
        $('h1,h2,h3,h4,h5,h6,strong,b,dt,th,label').slice(0, 900).each((_i, el) => {
            const node = $(el);
            const labelText = this.norm(node.text()).replace(/[:：]$/, '').toLowerCase();
            if (!wanted.includes(labelText)) return;
            const candidates = [];
            // First inspect sibling content until the next semantic heading.
            let next = node.next();
            for (let i = 0; i < 14 && next?.length; i++, next = next.next()) {
                const tag = String(next?.[0]?.tagName || next?.[0]?.name || '').toLowerCase();
                if (/^h[1-6]$/.test(tag)) break;
                const pieces = next.find('p,div,dd,span').addBack('p,div,dd,span').map((_j, x) => this.norm($(x).text())).get();
                candidates.push(...pieces);
            }
            // Then inspect paragraphs inside the enclosing book-info section.
            const parent = node.closest('section,article,div,dl').first();
            if (parent?.length) {
                parent.find('p,dd,[class*="intro"],[class*="summary"],[class*="desc"]').each((_j, x) => candidates.push(this.norm($(x).text())));
            }
            for (const raw of candidates) {
                let value = this.sanitizeSummary(raw);
                if (value.length < minLength || value.length > maxLength) continue;
                if (/^(?:作者|author|类别|類別|category|状态|狀態|status)\s*[:：]/i.test(value)) continue;
                if (/^(?:目录|目錄|章节|章節|chapter\s*list|table\s*of\s*contents)/i.test(value)) continue;
                const metadataMarkers = (value.match(/(?:作者|author|类别|類別|category|状态|狀態|status)\s*[:：]/gi) || []).length;
                if (metadataMarkers >= 2) continue; // whole info-card text, not synopsis
                let score = Math.min(value.length, 1200);
                if (/[。！？.!?]/.test(value)) score += 80;
                if (/作者|类别|類別|狀態|状态|chapter|目录|目錄/i.test(value.slice(0, 80))) score -= 200;
                if (score > best.score) best = { value, score, selector: this.cssHintForNode($(el)) };
            }
        });
        return best;
    }
    sanitizeSummary(text) {
        let out = this.norm(text)
            .replace(/^(?:内容简介|內容簡介|作品简介|作品簡介|书籍简介|書籍簡介|小说简介|小說簡介|本书简介|本書簡介|剧情简介|劇情簡介|文案|书籍介绍|書籍介紹|简介|簡介|book\s+description|novel\s+summary|about\s+this\s+book|summary|synopsis|description)\s*[:：]?\s*/i, '');
        if (/^(?:无简介|無簡介|暂无简介|暫無簡介|暂无内容|no\s+(?:summary|synopsis|description)(?:\s+available)?)$/i.test(out))
            return '';
        const tails = [
            /\s+(?:目录|目錄|章节目录|章節目錄|正文目录|正文目錄|table\s+of\s+contents|chapter\s+list)\s*(?:共\s*[0-9一二三四五六七八九十百千万萬]+\s*[章节章節])?/i,
            /\s+(?:最新章节|最新章節)\s*/i,
            /\s+(?:章节列表|章節列表|全部章节|全部章節)\s*/i,
        ];
        for (const re of tails) {
            const m = out.match(re);
            if (m && m.index >= 40)
                out = out.slice(0, m.index);
        }
        return this.norm(out).slice(0, 8000);
    }
    sanitizeAuthor(text) {
        let out = this.norm(text).replace(/^(?:author|writer|written\s+by|by|作者|作家|著者|撰稿人)\s*[:：]?\s*/i, '');
        out = out.replace(/\s+(?:状态|狀態|分类|分類|更新时间|更新時間)\s*[:：].*$/i, '');
        return this.norm(out).slice(0, 160);
    }
    extractMetadata($, base, profile) {
        const ld = this.extractLdJson($);
        const adapterMeta = this.extractAdapterMetadata($, base);
        const selectors = { ...(adapterMeta.selectors || {}) };
        const semanticTitle = adapterMeta.title ? { value: adapterMeta.title } : this.pickSemanticTitle($, base, profile, ld);
        let title = adapterMeta.title || this.norm($('meta[property="og:novel:book_name"],meta[name="og:novel:book_name"]').attr('content')) || semanticTitle.value;
        if (!adapterMeta.title && semanticTitle.selector)
            selectors.title = semanticTitle.selector;

        const summaryLabels = [
            '内容简介', '內容簡介', '作品简介', '作品簡介', '书籍简介', '書籍簡介',
            '小说简介', '小說簡介', '本书简介', '本書簡介', '剧情简介', '劇情簡介', '文案', '书籍介绍', '書籍介紹', '简介', '簡介',
            'Synopsis', 'Summary', 'Description', 'Overview', 'Book Description', 'Novel Summary', 'About this book',
        ];
        const semanticSummary = adapterMeta.summary ? { value: adapterMeta.summary } : this.pickLabeledLongValue($, summaryLabels, 20, 8000);
        let summary = adapterMeta.summary || this.norm($('meta[property="og:description"],meta[name="og:description"]').attr('content')) || semanticSummary.value || this.pickLabeledValue($, summaryLabels, 20, 8000);
        if (!adapterMeta.summary && semanticSummary.selector) selectors.summary = semanticSummary.selector;
        if (!summary)
            summary = this.norm(ld?.description || '');
        if (!summary) {
            const summaryPick = this.pickLongText($, [
                profile?.selectors?.summary,
                '.book-intro', '.bookIntro', '.bookintro', '#bookIntro', '.book-info .intro', '.bookinfo .intro',
                '.book-info .desc', '.detail-info .intro', '.intro_txt', '.book-dec', '.book-desc',
                '.summary', '.description', '.intro', '#intro', '.novel-summary', '.book-summary',
                '[itemprop="description"]', '[class*="synopsis"]', '[class*="summary"]',
                '[class*="intro"]', '[class*="desc"]',
            ]);
            summary = summaryPick.value;
            if (summaryPick.selector)
                selectors.summary = summaryPick.selector;
        }
        if (!summary)
            summary = this.norm($('meta[name="description"]').attr('content'));
        summary = this.sanitizeSummary(summary);

        let author = adapterMeta.author || this.norm($('meta[property="og:novel:author"],meta[name="og:novel:author"]').attr('content')) || this.pickLabeledValue($, ['作者', '作家', '著者', '撰稿人', 'Author', 'Writer', 'Written by', 'By'], 1, 160);
        if (!author && ld?.author) {
            if (typeof ld.author === 'string')
                author = this.norm(ld.author);
            else if (Array.isArray(ld.author))
                author = this.norm(ld.author.map((x) => x?.name || x).join(', '));
            else
                author = this.norm(ld.author?.name || '');
        }
        if (!author) {
            const authorPick = this.pickText($, [
                profile?.selectors?.author,
                '[rel="author"]', '[itemprop="author"]', '.author', '.book-author', '.writer',
                '.novel-author', '[class*="author"]', '[class*="writer"]', 'meta[name="author"]@content',
            ]);
            author = authorPick.value;
            if (authorPick.selector)
                selectors.author = authorPick.selector;
        }
        author = this.sanitizeAuthor(author);
        const artist = this.norm(adapterMeta.artist || '');
        const rawStatus = this.norm(adapterMeta.rawStatus || $('meta[property="og:novel:status"],meta[name="og:novel:status"]').attr('content') || '');
        const genres = this.norm(adapterMeta.genres || $('meta[property="og:novel:category"],meta[name="og:novel:category"]').attr('content') || '');

        let cover = adapterMeta.cover || this.resolveAgainst(this.extractLdImage(ld), base);
        if (!cover) {
            const coverPick = this.pickUrlAttr($, base, [
                profile?.selectors?.cover,
                '.book-cover img@src', '.novel-cover img@src', '.cover img@src',
                '.book-img img@src', '.book-image img@src', '.bookpic img@src', '.book-pic img@src',
                '.detail-cover img@src', '.novel-info img@src', '.book-info img@src',
                '[itemprop="image"]@src', '[class*="cover"] img@src',
                'meta[property="og:image"],meta[name="og:image"]@content',
                'meta[name="twitter:image"]@content',
            ]);
            cover = coverPick.value;
            if (coverPick.selector)
                selectors.cover = coverPick.selector;
        }
        if (!cover)
            cover = this.scoreImagesForCover($, base);
        return { title, summary, author, artist, rawStatus, genres, cover, selectors };
    }
    isYuewenHost(host) {
        const h = String(host || '').toLowerCase().replace(/^www\./, '');
        return /(?:^|\.)(?:qidian\.com|xs8\.cn|xxsy\.net|hongxiu\.com|readnovel\.com|qdmm\.com)$/.test(h);
    }
    isShuqiHost(host) {
        const h = String(host || '').toLowerCase().replace(/^www\./, '');
        return /(?:^|\.)shuqi\.com$/.test(h);
    }
    shuqiBookId(url) {
        try {
            const u = new URL(String(url || ''));
            let m = u.pathname.match(/\/book\/(\d+)(?:\.html)?\/?$/i);
            if (m) return m[1];
            m = u.pathname.match(/\/(?:catalog|reader)\/(\d+)(?:\/|$)/i);
            if (m) return m[1];
            const q = u.searchParams.get('bid') || u.searchParams.get('bookId');
            return /^\d+$/.test(String(q || '')) ? String(q) : '';
        } catch (_) { return ''; }
    }
    isCanonicalNovelDetailUrl(url) {
        try {
            const u = new URL(String(url || ''));
            const path = u.pathname;
            if (this.isYuewenHost(u.hostname) && /\/book\/\d+(?:\.html)?\/?$/i.test(path)) return true;
            if (this.isShuqiHost(u.hostname) && /\/book\/\d+(?:\.html)?\/?$/i.test(path)) return true;
            if (/^\/n\/[^/]+\/?$/i.test(path)) return true;
        } catch (_) {}
        return false;
    }
    novelWorkToken(url) {
        try {
            const u = new URL(String(url || ''));
            const h = u.hostname.toLowerCase();
            if (this.isYuewenHost(h)) {
                const m = u.pathname.match(/\/(?:book|chapterlist)\/(\d+)(?:\.html)?(?:\/|$)/i) || u.pathname.match(/\/chapter\/(\d+)\//i);
                if (m) return `yuewen:${m[1]}`;
            }
            if (this.isShuqiHost(h) || /shuqireader\.com$/i.test(h)) {
                const id = this.shuqiBookId(u.href);
                if (id) return `shuqi:${id}`;
                const q = u.searchParams.get('bookId') || u.searchParams.get('bid');
                if (/^\d+$/.test(String(q || ''))) return `shuqi:${q}`;
            }
            const n = u.pathname.match(/^\/n\/([^/]+)/i);
            if (n) return `static:${n[1]}`;
        } catch (_) {}
        return '';
    }
    catalogBelongsToNovel(catalogUrl, novelUrl) {
        const work = this.novelWorkToken(novelUrl);
        if (!work) return true;
        const candidate = this.novelWorkToken(catalogUrl);
        // If the candidate exposes a work identity, it must match. URLs without a
        // work token remain eligible for generic architectures (AJAX/shared TOCs).
        return !candidate || candidate === work;
    }
    detectNovelAdapter($, base) {
        let path = '', host = '';
        try { const u = new URL(base); path = u.pathname.toLowerCase(); host = u.hostname.toLowerCase(); } catch (_) {}
        try {
            const woo = $('body.single-product,.single-product,.woocommerce-product-gallery,.product_title,.woocommerce-tabs,.woocommerce-Tabs-panel').length > 0;
            if (woo && (/\/producto?s?\//i.test(path) || /\/product\//i.test(path) || $('h1.product_title,.product_title.entry-title').length)) return 'woocommerce-product';
            if ($('.fic_title,.wi_fic_desc').length) return 'fictionposts';
            if ($('.wp-manga,.site-content .c-page-content,[class*="wp-manga"],#manga-chapters-holder').length) return 'madara';
            if ($('.eplister,.bixbox,.ts-post-image,.serieslist').length) return 'lightnovelwp';
            if ($('[class*="fictioneer"],[data-fictioneer],.chapter-group,.story__chapters').length) return 'fictioneer';
            // Shuqi mobile renders only a tiny latest-chapter teaser in the
            // detail DOM while the complete TOC lives in reader/API state.
            if (this.isShuqiHost(host) && /\/book\/\d+(?:\.html)?\/?$/i.test(path)) return 'shuqi-mobile';
            // Yuewen mobile properties share numeric /book/<id> works and a
            // dedicated /chapterlist/<id> TOC. Treat this as an architecture, not
            // as an xs8 one-off, so Qidian/XXSY/Hongxiu-style sources avoid the
            // expensive generic profile scan and invented catalog probes.
            if (this.isYuewenHost(host) && /\/book\/\d+(?:\.html)?\/?$/i.test(path)) return 'yuewen-mobile';
            if (/\/book\/\d+(?:\.html)?\/?$/i.test(path) && $('a[href*="/chapterlist/"],a[href*="chapterList"]').length) return 'yuewen-mobile';
        } catch (_) {}
        return 'generic';
    }
    extractAdapterMetadata($, base) {
        const adapter = this.detectNovelAdapter($, base);
        if (adapter === 'fictionposts') return {adapter,selectors:{title:'.fic_title',summary:'.wi_fic_desc',chapterContent:'.chp_raw'},
            title:this.norm($('.fic_title').text()),summary:this.norm($('.wi_fic_desc').text()),author:this.norm($('.auth_name_fic').text()),
            cover:this.resolveAgainst($('.fic_image > img').attr('src'),base),genres:$('.fic_genre').map((_i,el)=>$(el).text()).get().join(', ')};
        if (adapter !== 'woocommerce-product') return { adapter, selectors: {} };
        const selectors = {};
        const titleNode = $('h1.product_title,.product_title.entry-title,.summary.entry-summary h1').first();
        const title = this.norm(titleNode.text());
        if (title) selectors.title = 'h1.product_title';
        let summary = '';
        const summaryNode = $('.woocommerce-product-details__short-description,.summary.entry-summary .woocommerce-product-details__short-description').first();
        if (summaryNode.length) {
            summary = this.sanitizeSummary(this.norm(summaryNode.text()));
            if (summary) selectors.summary = '.woocommerce-product-details__short-description';
        }
        let cover;
        const imageSelectors = [
            '.woocommerce-product-gallery__image img', '.woocommerce-product-gallery img',
            '.woocommerce-product-gallery__wrapper img', 'img.wp-post-image', '.product .images img',
        ];
        for (const sel of imageSelectors) {
            const node = $(sel).first();
            cover = this.extractImageUrl(node, base);
            if (cover) { selectors.cover = sel; break; }
        }
        // WooCommerce product attributes are frequently used by novel sites for
        // metadata. Slugs are more stable than translated labels and keep this
        // adapter language-independent (NOVA uses escritor/ilustrador/estado).
        const attrText = (slugs) => {
            for (const slug of slugs) {
                const row = $(`.woocommerce-product-attributes-item--attribute_pa_${slug} td,[class*="attribute_pa_${slug}"] td`).first();
                const value = this.norm(row.text());
                if (value) return value;
            }
            return '';
        };
        const labelAttr = (labels) => {
            let found = '';
            try {
                $('.woocommerce-product-attributes tr,.shop_attributes tr').each((_i, el) => {
                    if (found) return;
                    const row = $(el);
                    const label = this.norm(row.find('th,.woocommerce-product-attributes-item__label').first().text());
                    if (!label || !labels.some(rx => rx.test(label))) return;
                    found = this.norm(row.find('td,.woocommerce-product-attributes-item__value').first().text());
                });
            } catch (_) {}
            return found;
        };
        const author = attrText(['escritor','autor','author','writer']) || labelAttr([/^(?:escritor|autor|author|writer)$/i,/作[者家]/]);
        const artist = attrText(['ilustrador','artista','artist','illustrator']) || labelAttr([/^(?:ilustrador|artista|artist|illustrator)$/i,/插画|插畫|画师|畫師/]);
        const rawStatus = attrText(['estado','status','state']) || labelAttr([/^(?:estado|status|state|situa[cç][aã]o)$/i,/状态|狀態/]);
        const genres = [];
        try {
            $('.product_meta .posted_in a,a[rel="tag"][href*="product_cat"],a[href*="product-category"],a[href*="categoria-producto"]').each((_i, el) => {
                const value = this.norm($(el).text());
                if (value && !genres.includes(value)) genres.push(value);
            });
        } catch (_) {}
        return { adapter, title, summary, cover, author, artist, rawStatus, genres: genres.join(', '), selectors };
    }
    imageSrcsetCandidate(raw, base) {
        const text = String(raw || '').trim();
        if (!text) return undefined;
        let best;
        let bestScore = -1;
        for (const part of text.split(',')) {
            const bits = part.trim().split(/\s+/);
            const url = this.resolveAgainst(bits[0], base);
            if (!url || this.isPlaceholderImageUrl(url)) continue;
            const desc = bits[1] || '';
            const score = /^(\d+)w$/i.test(desc) ? Number(RegExp.$1) : (/^([\d.]+)x$/i.test(desc) ? Number(RegExp.$1) * 1000 : 1);
            if (score >= bestScore) { best = url; bestScore = score; }
        }
        return best;
    }
    isPlaceholderImageUrl(url) {
        const value = String(url || '').toLowerCase();
        return !value || value.startsWith('data:') || /(?:transparent|spacer|blank(?:[-_.]|$)|lazy[-_]?placeholder|placeholder(?:[-_.]|$)|woocommerce-placeholder|1x1|pixel\.gif|no[-_]?image)/i.test(value);
    }
    extractImageUrl(node, base) {
        if (!node || typeof node.attr !== 'function') return undefined;
        const directAttrs = [
            'data-large_image', 'data-lazy-src', 'data-litespeed-src', 'data-src', 'data-cfsrc', 'data-original',
            'data-orig-file', 'data-thumb', 'data-flickity-lazyload', 'src',
        ];
        for (const attr of directAttrs) {
            const url = this.resolveAgainst(node.attr(attr), base);
            if (url && !this.isPlaceholderImageUrl(url)) return url;
        }
        for (const attr of ['data-srcset','srcset']) {
            const url = this.imageSrcsetCandidate(node.attr(attr), base);
            if (url) return url;
        }
        try {
            const source = node.closest('picture').find('source').first();
            for (const attr of ['data-srcset','srcset']) {
                const url = this.imageSrcsetCandidate(source.attr(attr), base);
                if (url) return url;
            }
        } catch (_) {}
        const style = String(node.attr('style') || node.parent?.().attr?.('style') || '');
        const bg = (style.match(/url\((?:['"])?([^)'";]+)(?:['"])?\)/i) || [])[1];
        const bgUrl = this.resolveAgainst(bg, base);
        return bgUrl && !this.isPlaceholderImageUrl(bgUrl) ? bgUrl : undefined;
    }
    normalizeNovelStatus(value) {
        const raw = this.norm(value || '');
        if (!raw) return undefined;
        const v = raw.toLowerCase();
        if (/(?:completed|complete|finished|completad[oa]|completa|finalizad[oa]|terminad[oa]|conclu[ií]d[oa]|完结|完結|已完结|已完結|完本|完結済|완결)/i.test(v)) return 'Completed';
        if (/(?:licensed|licenciado|licenciada|授权|授權)/i.test(v)) return 'Licensed';
        if (/(?:cancelled|canceled|cancelad[oa]|取消|中止|연재중단)/i.test(v)) return 'Cancelled';
        if (/(?:hiatus|pausad[oa]|pausa|suspendid[oa]|on\s*hold|停更|休載|休载|휴재)/i.test(v)) return 'On Hiatus';
        if (/(?:inactive|inactiv[oa]|abandonad[oa]|弃坑|棄坑)/i.test(v)) return 'Inactive';
        if (/(?:ongoing|en\s*proceso|en\s*curso|publicando|em\s*andamento|em\s*curso|andamento|连载|連載|连载中|連載中|更新中|연재중)/i.test(v)) return 'Ongoing';
        return 'Unknown';
    }
    extractLdJson($) {
        const objects = [];
        $('script[type="application/ld+json"]').each((_i, el) => {
            const raw = $(el).contents().text();
            if (!raw)
                return;
            try {
                const parsed = JSON.parse(raw.trim());
                this.flattenLd(parsed, objects);
            }
            catch (_) { }
        });
        if (!objects.length)
            return null;
        const score = (obj) => {
            const type = Array.isArray(obj?.['@type']) ? obj['@type'].join(' ') : String(obj?.['@type'] || '');
            let s = 0;
            if (/(Book|Novel|CreativeWork|Article)/i.test(type))
                s += 10;
            if (obj?.name || obj?.headline)
                s += 4;
            if (obj?.description)
                s += 3;
            if (obj?.image)
                s += 2;
            if (obj?.author)
                s += 2;
            return s;
        };
        return objects.sort((a, b) => score(b) - score(a))[0];
    }
    flattenLd(value, out) {
        if (!value)
            return;
        if (Array.isArray(value)) {
            value.forEach(v => this.flattenLd(v, out));
            return;
        }
        if (typeof value !== 'object')
            return;
        out.push(value);
        if (Array.isArray(value['@graph']))
            value['@graph'].forEach((v) => this.flattenLd(v, out));
        if (Array.isArray(value.itemListElement))
            value.itemListElement.forEach((v) => this.flattenLd(v?.item || v, out));
    }
    extractLdImage(ld) {
        if (!ld?.image)
            return undefined;
        if (typeof ld.image === 'string')
            return ld.image;
        if (Array.isArray(ld.image)) {
            const first = ld.image[0];
            return typeof first === 'string' ? first : first?.url || first?.contentUrl;
        }
        return ld.image.url || ld.image.contentUrl;
    }
    pickText($, rawSelectors) {
        for (const raw of rawSelectors.filter(Boolean)) {
            const spec = this.parseSelectorSpec(raw);
            try {
                const node = $(spec.selector).first();
                const value = this.norm(spec.attr ? node.attr(spec.attr) : node.text());
                if (value)
                    return { value, selector: raw };
            }
            catch (_) { }
        }
        return { value: '' };
    }
    pickLongText($, rawSelectors) {
        let best = { value: '', selector: undefined, score: 0 };
        for (const raw of rawSelectors.filter(Boolean)) {
            const spec = this.parseSelectorSpec(raw);
            try {
                $(spec.selector).each((_i, el) => {
                    const value = this.norm(spec.attr ? $(el).attr(spec.attr) : $(el).text());
                    if (value.length < 20)
                        return;
                    const linkText = this.norm($(el).find('a').text()).length;
                    const signal = this.norm(`${raw} ${$(el).attr('class') || ''} ${$(el).attr('id') || ''}`).toLowerCase();
                    let score = Math.min(value.length, 6000) - linkText * 1.1;
                    if (/(summary|synopsis|intro|description|desc|简介|簡介|内容简介|內容簡介|书籍简介|作品简介)/i.test(signal))
                        score += 900;
                    if (/(chapter|catalog|directory|comment|review|recommend|目录|章|评论)/i.test(signal))
                        score -= 1000;
                    if (value.length > 6000)
                        score -= 600;
                    if (score > best.score)
                        best = { value, selector: raw, score };
                });
            }
            catch (_) { }
        }
        return { value: best.value, selector: best.selector };
    }
    pickUrlAttr($, base, rawSelectors) {
        for (const raw of rawSelectors.filter(Boolean)) {
            const spec = this.parseSelectorSpec(raw);
            try {
                const node = $(spec.selector).first();
                if ((!spec.attr || spec.attr === 'src') && String(node?.[0]?.name || '').toLowerCase() === 'img') {
                    const image = this.extractImageUrl(node, base);
                    if (image) return { value: image, selector: raw };
                }
                const attrs = spec.attr ? [spec.attr] : ['data-large_image','data-lazy-src','data-litespeed-src','data-src','data-original','src','content'];
                for (const attr of attrs) {
                    const value = this.resolveAgainst(node.attr(attr), base);
                    if (value && !this.isPlaceholderImageUrl(value))
                        return { value, selector: raw };
                }
                if (!spec.attr) {
                    const srcset = this.imageSrcsetCandidate(node.attr('data-srcset') || node.attr('srcset'), base);
                    if (srcset) return { value: srcset, selector: raw };
                }
            }
            catch (_) { }
        }
        return {};
    }
    parseSelectorSpec(raw) {
        const match = raw.match(/^(.*)@([a-zA-Z0-9_:-]+)$/);
        return match ? { selector: match[1], attr: match[2] } : { selector: raw };
    }
    scoreImagesForCover($, base) {
        let best = { score: -999 };
        $('img').each((_i, el) => {
            const node = $(el);
            const url = this.extractImageUrl(node, base);
            if (!url)
                return;
            const signal = this.norm([
                node.attr('class'), node.attr('id'), node.attr('alt'), node.attr('title'),
                node.parent().attr('class'), node.closest('figure,div,section').attr('class'),
            ].filter(Boolean).join(' ')).toLowerCase();
            let score = 0;
            if (/(cover|book|novel|poster|fengmian|fm|封面)/i.test(signal))
                score += 12;
            if (/(woocommerce-product-gallery|wp-post-image|product-gallery)/i.test(signal))
                score += 18;
            if (/(logo|avatar|icon|banner|advert|qr|二维码)/i.test(signal))
                score -= 12;
            const width = parseInt(node.attr('width') || '0', 10);
            const height = parseInt(node.attr('height') || '0', 10);
            if (width > 80 && height > 120)
                score += 4;
            if (height > width && height > 0)
                score += 2;
            if (score > best.score)
                best = { url, score };
        });
        return best.score >= 2 ? best.url : undefined;
    }
    cleanTitle(title, $) {
        let out = this.norm(title);
        if (!this.titleSiteNames) this.titleSiteNames = new WeakMap();
        let siteName = this.titleSiteNames.get($);
        if (siteName === undefined) {
            siteName = this.norm($('meta[property="og:site_name"],meta[name="og:site_name"]').attr('content'));
            this.titleSiteNames.set($, siteName);
        }
        if (siteName && out.length > siteName.length + 2) {
            out = out.replace(new RegExp('\\s*[-_|–—]\\s*' + this.escapeRegExp(siteName) + '\\s*$', 'i'), '');
        }
        return this.norm(out);
    }
    discoverCatalogLinks($, base) {
        const scored = [];
        const seen = new Set();
        $('a[href]').each((_i, el) => {
            const a = $(el);
            const href = this.resolveAgainst(a.attr('href'), base);
            if (!href || seen.has(href))
                return;
            let u;
            try {
                u = new URL(href);
            }
            catch (_) {
                return;
            }
            const bu = new URL(base);
            if (!this.sameSiteHost(u.hostname, bu.hostname))
                return;
            const text = this.norm(a.text());
            const signal = `${text} ${u.pathname} ${a.attr('class') || ''} ${a.attr('id') || ''}`;
            // A "read first chapter" link is not a catalog. Treating /chapter/<book>/<chapter>
            // as a TOC wasted seconds on Yuewen-like sites and sometimes polluted results.
            if (/\/chapter\/[^/]+\/[^/]+\/?$/i.test(u.pathname) && !/\/chapter\/list\//i.test(u.pathname)) return;
            let score = 0;
            if (/chapterlist|chapter-list|chapter_list|\/chapter\/list\//i.test(u.pathname)) score += 22;
            if (/(目录|章節|章节|全部章节|作品目录|chapter\s*list|chapters|catalog|catalogue|table\s*of\s*contents|toc|cap[ií]tulos|lista\s+de\s+cap[ií]tulos|[ií]ndice|sum[aá]rio|sommaire|inhaltsverzeichnis)/i.test(signal))
                score += 15;
            if (/(chapter\/list|chapter-list|chapters|catalog|catalogue|directory|toc|capitulos|capítulos|indice|índice|sumario|sumário)/i.test(u.pathname))
                score += 8;
            if (/(login|register|comment|download|app)/i.test(signal))
                score -= 10;
            if (score >= 8) {
                seen.add(href);
                scored.push({ url: href, score });
            }
        });
        const current = new URL(base);
        const m = current.pathname.match(/\/chapter\/([^/]+)\/([^/]+)/i);
        if (m) {
            const guessed = [
                `${current.origin}/chapter/list/${m[1]}/${m[2]}`,
                `${current.origin}/chapter/list/${m[1]}`,
            ];
            guessed.forEach((url, idx) => {
                if (!seen.has(url)) scored.push({ url, score: 9 - idx });
            });
        }
        // Compact route family used by many static Chinese portals:
        // /n/<slug>/ detail, /n/<slug>/list.html catalog, /n/<slug>/<id>.html chapter.
        const nRoute = current.pathname.match(/^\/n\/([^/]+)(?:\/(?:list\.html|\d+\.html))?\/?$/i);
        if (nRoute) {
            const listUrl = `${current.origin}/n/${nRoute[1]}/list.html`;
            if (!seen.has(listUrl)) scored.push({ url: listUrl, score: 18 });
        }
        return scored.sort((a, b) => b.score - a.score).map(x => x.url).slice(0, 8);
    }
    findBestChapterSelector($, base) {
        const candidates = [
            '[class*="chapter"] a[href]', '[id*="chapter"] a[href]',
            '[class*="catalog"] a[href]', '[id*="catalog"] a[href]',
            '[class*="directory"] a[href]', '[id*="directory"] a[href]',
            '[class*="volume"] a[href]', '.listmain a[href]', '#list a[href]',
            'ul a[href]', 'ol a[href]',
        ];
        let best = { score: 0, count: 0 };
        for (const selector of candidates) {
            let count = 0;
            let total = 0;
            try {
                $(selector).each((_i, el) => {
                    const a = $(el);
                    const href = this.chapterHref(a, base);
                    if (!href)
                        return;
                    const text = this.norm(a.text());
                    const score = this.chapterLinkScore(text, href, a);
                    if (score >= 4) {
                        count++;
                        total += score;
                    }
                });
            }
            catch (_) { }
            const score = total + count * 2;
            if (count >= 3 && score > best.score)
                best = { selector, score, count };
        }
        return best.selector;
    }
    isPlausibleChapterTitle(text, href, a) {
        const value = this.norm(text || '');
        if (!value || value.length > 220) return false;
        // Reject trademark/copyright/menu debris that may live on numeric URLs.
        if (!/[\p{L}\p{N}\u3400-\u9fff]/u.test(value)) return false;
        if (/^[©®™\s._·•…\-–—:：()（）\[\]]+$/u.test(value)) return false;
        if (/^(?:©|®|™)(?:\s|[.·•…_-])*$/u.test(value)) return false;
        if (/^(?:home|inicio|início|menu|login|register|作者|书架|書架|返回|目录|目錄)$/i.test(value)) return false;
        const explicit = /(?:第\s*[0-9零〇一二两三四五六七八九十百千万]+\s*[章节回話话]|chapter\s*[0-9ivxlcdm]+|chap(?:ter)?\.?\s*\d+|cap[ií]tulo\s*\d+|epis[oó]dio\s*\d+|\b\d+\s*[章节回])/i.test(value);
        if (explicit) return true;
        let path = ''; try { path = new URL(href).pathname; } catch (_) { path = String(href || ''); }
        const routeSignal = /(?:\/chapter\/|\/read\/|\/reader\/|\/n\/[^/]+\/\d+\.html$|\/\d{2,}\.(?:html?|php)$)/i.test(path);
        const classSignal = this.norm([a?.attr?.('class'), a?.parent?.().attr?.('class'), a?.closest?.('ul,ol,div,section')?.attr?.('class'), a?.closest?.('ul,ol,div,section')?.attr?.('id')].filter(Boolean).join(' '));
        return routeSignal && /(chapter|catalog|directory|toc|volume|list|目录|目錄|章节|章節)/i.test(classSignal);
    }
    extractChapterLinks($, base, preferredSelector) {
        const seen = new Set();
        const out = [];
        let order = 0;
        const collect = (selector) => {
            try {
                $(selector).each((_i, el) => {
                    const a = $(el);
                    const href = this.chapterHref(a, base);
                    if (!href) return;
                    const key = this.canonicalChapterIdentity(href);
                    if (!key || seen.has(key)) return;
                    let u, bu;
                    try { u = new URL(href); bu = new URL(base); } catch (_) { return; }
                    if (!this.sameSiteHost(u.hostname, bu.hostname)) return;
                    const work = bu.pathname.match(/^\/(?:book|chapterlist)\/(\d+)(?:\.html)?\/?$/);
                    const chapterWork = u.pathname.match(/^\/chapter\/(\d+)\//);
                    if (work && chapterWork && work[1] !== chapterWork[1]) return;
                    const text = this.norm(a.text());
                    if (!this.isPlausibleChapterTitle(text, href, a)) return;
                    const score = this.chapterLinkScore(text, href, a);
                    if (score < 4) return;
                    seen.add(key);
                    const info = this.extractChapterNumber(text, href);
                    out.push({ name: text, path: href, order: order++, ...info });
                });
            } catch (_) {}
        };
        // The learned/best selector is authoritative. v0.7.7 accidentally ignored
        // it and scanned the whole document, pulling footer/recommendation junk.
        if (preferredSelector) {
            collect(preferredSelector);
            if (out.length >= 3) return out;
        }
        collect('a[href]');
        return out;
    }
    chapterLinkScore(text, href, a) {
        if (!text)
            return -99;
        let score = 0;
        const path = (() => { try {
            return new URL(href).pathname;
        }
        catch (_) {
            return href;
        } })();
        const chapterText = /(第\s*[0-9零〇一二两三四五六七八九十百千万]+\s*[章节回話话]|chapter\s*[0-9ivxlcdm]+|chap(?:ter)?\.?\s*\d+|cap[ií]tulo\s*\d+|epis[oó]dio\s*\d+|\b\d+\s*[章节回])/i;
        if (chapterText.test(text))
            score += 9;
        if (/(chapter|chapitre|capitulo|capítulo|episode|reader|read|\/\d{2,}(?:\.html?)?$|\/\d+\/\d+)/i.test(path))
            score += 4;
        if (/\/n\/[^/]+\/\d+\.html$/i.test(path))
            score += 7;
        const signal = this.norm([
            a.attr?.('class'), a.parent?.().attr?.('class'), a.parent?.().parent?.().attr?.('class'),
            a.closest?.('ul,ol,div,section').attr?.('class'), a.closest?.('ul,ol,div,section').attr?.('id'),
        ].filter(Boolean).join(' '));
        if (/(chapter|catalog|directory|toc|volume|list|目录|章节|章)/i.test(signal))
            score += 4;
        if (/^(下一|上一|下一页|上一页|next|prev|previous|pr[oó]ximo|anterior|首页|home)$/i.test(text))
            score -= 10;
        if (/(login|register|comment|download|vote|author|作者|书架)/i.test(text))
            score -= 5;
        return score;
    }
    canonicalChapterIdentity(rawUrl) {
        try {
            const u = new URL(String(rawUrl || '').trim());
            u.hash = '';
            u.hostname = u.hostname.replace(/^www\./i, '');
            u.pathname = u.pathname.replace(/^\/amp(?=\/)/i, '');
            for (const key of Array.from(u.searchParams.keys())) {
                if (/^(?:utm_[^=]*|fbclid|gclid|yclid|ref|referrer|source|spm|share|amp)$/i.test(key)) u.searchParams.delete(key);
            }
            // AMP is a representation of the same chapter, not a second chapter.
            u.pathname = u.pathname.replace(/^\/amp(?=\/)/i, '').replace(/\/{2,}/g, '/');
            if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
            const entries = Array.from(u.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
            u.search = '';
            for (const [k, v] of entries) u.searchParams.append(k, v);
            return u.href;
        } catch (_) {
            return String(rawUrl || '').trim().replace(/#.*$/, '');
        }
    }
    chapterSequenceStats(items) {
        const values = (items || []).filter(x => x?.numberSource === 'text' && Number.isFinite(x.number)).map(x => Number(x.number));
        if (!values.length) return { count: 0, unique: 0, min: undefined, max: undefined, continuity: 0, gaps: 0 };
        const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
        const min = uniqueValues[0], max = uniqueValues[uniqueValues.length - 1];
        const span = Math.max(1, max - min + 1);
        let gaps = 0;
        for (let i = 1; i < uniqueValues.length; i++) gaps += Math.max(0, uniqueValues[i] - uniqueValues[i - 1] - 1);
        return { count: values.length, unique: uniqueValues.length, min, max, continuity: uniqueValues.length / span, gaps };
    }
    shouldPreferCompleteCatalog(current, deep) {
        const a = this.chapterSequenceStats(current);
        const b = this.chapterSequenceStats(deep);
        if (!deep?.length) return false;
        if (!this.hasLargeChapterGaps(current)) return false;
        if (this.hasLargeChapterGaps(deep)) return false;
        // A complete catalog should cover at least the same numbered interval as
        // the teaser. This rejects the common false positive of a contiguous
        // "latest 20 chapters" box replacing first+latest teaser data.
        const coversRange = Number.isFinite(a.min) && Number.isFinite(a.max) && Number.isFinite(b.min) && Number.isFinite(b.max)
            ? b.min <= a.min && b.max >= a.max
            : false;
        if (coversRange && b.unique >= Math.max(8, Math.floor(a.unique * 0.75))) return true;
        return deep.length >= Math.max(30, Math.floor((current || []).length * 0.9)) && b.continuity >= 0.9 && b.continuity > a.continuity + 0.2;
    }
    extractPartNumber(text) {
        const m = String(text || '').match(/(?:parte|part|pt\.?|часть)\s*[:#.-]?\s*(\d+)/i);
        return m ? Number(m[1]) : undefined;
    }
    extractWooCommerceChapters($, base) {
        const seen = new Set();
        const validChapter = (node, text) => {
            const href = this.chapterHref(node, base);
            if (!href) return null;
            let parsed, source;
            try { parsed = new URL(href); source = new URL(base); } catch (_) { return null; }
            if (!this.sameSiteHost(parsed.hostname, source.hostname)) return null;
            if (/(?:\/producto?s?\/|\/product\/|\/categoria\/|\/category\/|\/tag\/|\/mi-cuenta\/|\/cart\/|\/checkout\/)/i.test(parsed.pathname)) return null;
            const trusted = /(?:cap[ií]tulo|chapter|epis[oó]dio|episode|pr[oó]logo|prologue|ep[ií]logo|epilogue|interludio|interlude|extra|parte\s*\d+|part\s*\d+)/i.test(text);
            if (!trusted || text.length > 280) return null;
            const key = this.canonicalChapterIdentity(href);
            if (seen.has(key)) return null;
            seen.add(key);
            return href;
        };

        // Architecture fast-path used by WooCommerce + WPBakery/Visual Composer
        // novel sites. Official LNReader NOVA uses this exact structural family:
        // one wpb_wrapper per volume, .dt-fancy-title as volume heading and
        // .wpb_tab anchors as chapters. This is detected by DOM, never hostname.
        const vcOut = [];
        let vcOrder = 0;
        try {
            const groups = $('.vc_row div.vc_column-inner > div.wpb_wrapper');
            groups.each((_i, el) => {
                const group = $(el);
                const volumeLabel = this.norm(group.find('.dt-fancy-title').first().text());
                const vm = volumeLabel.match(/(?:volumen|volume|vol\.?|tomo|book)\s*[:#.-]?\s*(\d+)/i)
                    || volumeLabel.match(/第\s*([0-9零〇一二两三四五六七八九十百千万]+)\s*卷/i);
                const volume = vm ? this.parseNumberish(vm[1]) : undefined;
                const links = group.find('.wpb_tab a[href],.wpb_wrapper .wpb_tab a[href]');
                if (!links.length) return;
                let volumeOrder = 0;
                links.each((_j, chapterEl) => {
                    const node = $(chapterEl);
                    const text = this.norm(node.text());
                    if (!text) return;
                    const href = validChapter(node, text);
                    if (!href) return;
                    const info = this.extractChapterNumber(text, href);
                    const part = this.extractPartNumber(text);
                    let name = text;
                    if (volumeLabel && !text.toLowerCase().startsWith(volumeLabel.toLowerCase())) {
                        // Preserve volume context because Chapter 1/Part 1 repeats
                        // legitimately between volumes on this architecture.
                        name = `${volumeLabel} - ${text}`;
                    }
                    vcOut.push({
                        name, path: href, order: vcOrder++,
                        ...(Number.isFinite(volume) ? { volume, volumeOrder: volumeOrder++ } : {}),
                        ...(Number.isFinite(part) ? { part } : {}),
                        ...info,
                    });
                });
            });
        } catch (_) {}
        if (vcOut.length >= 3) return vcOut;

        let root = null;
        const selectors = ['#tab-description','.woocommerce-Tabs-panel--description','.woocommerce-tabs .panel.entry-content','.woocommerce-tabs .panel','.product .woocommerce-tabs'];
        for (const selector of selectors) {
            try {
                const node = $(selector).first();
                if (node?.length && node.find('a[href]').length >= 3) { root = node; break; }
            } catch (_) {}
        }
        if (!root) return [];
        const out = [];
        let order = 0;
        let volume;
        let volumeLabel = '';
        let volumeOrder = 0;
        root.find('h1,h2,h3,h4,h5,h6,p,strong,.dt-fancy-title,a[href]').each((_i, el) => {
            const node = $(el);
            const tag = String(el?.name || '').toLowerCase();
            const text = this.norm(node.text());
            if (!text) return;
            if (tag !== 'a') {
                const vm = text.match(/(?:volumen|volume|vol\.?|tomo|book)\s*[:#.-]?\s*(\d+)/i) || text.match(/第\s*([0-9零〇一二两三四五六七八九十百千万]+)\s*卷/i);
                if (vm && text.length <= 180) {
                    const next = this.parseNumberish(vm[1]);
                    if (Number.isFinite(next)) { volume = next; volumeLabel = text; volumeOrder = 0; }
                }
                return;
            }
            const href = validChapter(node, text);
            if (!href) return;
            const info = this.extractChapterNumber(text, href);
            const part = this.extractPartNumber(text);
            const name = volumeLabel && !text.toLowerCase().startsWith(volumeLabel.toLowerCase()) ? `${volumeLabel} - ${text}` : text;
            out.push({ name, path: href, order: order++, ...(Number.isFinite(volume) ? { volume, volumeOrder: volumeOrder++ } : {}), ...(Number.isFinite(part) ? { part } : {}), ...info });
        });
        return out;
    }
    extractArchitectureChapters($, base, profile) {
        const adapter = profile?.novelAdapter || this.detectNovelAdapter($, base);
        if (adapter === 'woocommerce-product') {
            const chapters = this.extractWooCommerceChapters($, base);
            if (chapters.length >= 3) return { adapter, chapters, chapterSelector: '#tab-description a[href]' };
        }
        return null;
    }
    async extractYuewenCatalog(base) {
        try {
            const u = new URL(base);
            const m = u.pathname.match(/\/book\/(\d+)(?:\.html)?\/?$/i);
            if (!m) return null;
            const catalogUrl = `${u.origin}/chapterlist/${m[1]}`;
            const deep = await this.fetchCatalogPages(catalogUrl, undefined, { overallMs: 6500, pageMs: 4800, maxPages: 12 });
            if (!deep?.items?.length) return null;
            return { catalogUrl, deep };
        } catch (error) { if (error?.catalogIncomplete || error?.protection?.challenge) throw error; return null; }
    }
    shuqiExpectedChapterCount($) {
        try {
            const text = this.norm($.root().text());
            const m = text.match(/(?:目录|目錄)\s*共\s*(\d{1,7})\s*(?:章|章节|章節)/i) || text.match(/共\s*(\d{1,7})\s*(?:章|章节|章節)/i);
            return m ? Number(m[1]) : 0;
        } catch (_) { return 0; }
    }
    md5Hex(input) {
        // Tiny self-contained MD5 used only for Shuqi's public catalog signature.
        // Keeping it here avoids adding a crypto dependency to every generated child.
        const add=(x,y)=>{const l=(x&65535)+(y&65535);return ((((x>>>16)+(y>>>16)+(l>>>16))&65535)<<16)|(l&65535);};
        const rol=(n,c)=>(n<<c)|(n>>>(32-c));
        const cmn=(q,a,b,x,s,t)=>add(rol(add(add(a,q),add(x,t)),s),b);
        const ff=(a,b,c,d,x,s,t)=>cmn((b&c)|((~b)&d),a,b,x,s,t);
        const gg=(a,b,c,d,x,s,t)=>cmn((b&d)|(c&(~d)),a,b,x,s,t);
        const hh=(a,b,c,d,x,s,t)=>cmn(b^c^d,a,b,x,s,t);
        const ii=(a,b,c,d,x,s,t)=>cmn(c^(b|(~d)),a,b,x,s,t);
        const utf8=unescape(encodeURIComponent(String(input||'')));
        const n=utf8.length, words=[];
        for(let i=0;i<n;i++) words[i>>2]=(words[i>>2]||0)|(utf8.charCodeAt(i)<<((i%4)*8));
        words[n>>2]=(words[n>>2]||0)|(0x80<<((n%4)*8));
        words[(((n+8)>>>6)<<4)+14]=n*8;
        let a=1732584193,b=-271733879,c=-1732584194,d=271733878;
        for(let i=0;i<words.length;i+=16){
            const oa=a,ob=b,oc=c,od=d,x=j=>words[i+j]||0;
            a=ff(a,b,c,d,x(0),7,-680876936); d=ff(d,a,b,c,x(1),12,-389564586); c=ff(c,d,a,b,x(2),17,606105819); b=ff(b,c,d,a,x(3),22,-1044525330);
            a=ff(a,b,c,d,x(4),7,-176418897); d=ff(d,a,b,c,x(5),12,1200080426); c=ff(c,d,a,b,x(6),17,-1473231341); b=ff(b,c,d,a,x(7),22,-45705983);
            a=ff(a,b,c,d,x(8),7,1770035416); d=ff(d,a,b,c,x(9),12,-1958414417); c=ff(c,d,a,b,x(10),17,-42063); b=ff(b,c,d,a,x(11),22,-1990404162);
            a=ff(a,b,c,d,x(12),7,1804603682); d=ff(d,a,b,c,x(13),12,-40341101); c=ff(c,d,a,b,x(14),17,-1502002290); b=ff(b,c,d,a,x(15),22,1236535329);
            a=gg(a,b,c,d,x(1),5,-165796510); d=gg(d,a,b,c,x(6),9,-1069501632); c=gg(c,d,a,b,x(11),14,643717713); b=gg(b,c,d,a,x(0),20,-373897302);
            a=gg(a,b,c,d,x(5),5,-701558691); d=gg(d,a,b,c,x(10),9,38016083); c=gg(c,d,a,b,x(15),14,-660478335); b=gg(b,c,d,a,x(4),20,-405537848);
            a=gg(a,b,c,d,x(9),5,568446438); d=gg(d,a,b,c,x(14),9,-1019803690); c=gg(c,d,a,b,x(3),14,-187363961); b=gg(b,c,d,a,x(8),20,1163531501);
            a=gg(a,b,c,d,x(13),5,-1444681467); d=gg(d,a,b,c,x(2),9,-51403784); c=gg(c,d,a,b,x(7),14,1735328473); b=gg(b,c,d,a,x(12),20,-1926607734);
            a=hh(a,b,c,d,x(5),4,-378558); d=hh(d,a,b,c,x(8),11,-2022574463); c=hh(c,d,a,b,x(11),16,1839030562); b=hh(b,c,d,a,x(14),23,-35309556);
            a=hh(a,b,c,d,x(1),4,-1530992060); d=hh(d,a,b,c,x(4),11,1272893353); c=hh(c,d,a,b,x(7),16,-155497632); b=hh(b,c,d,a,x(10),23,-1094730640);
            a=hh(a,b,c,d,x(13),4,681279174); d=hh(d,a,b,c,x(0),11,-358537222); c=hh(c,d,a,b,x(3),16,-722521979); b=hh(b,c,d,a,x(6),23,76029189);
            a=hh(a,b,c,d,x(9),4,-640364487); d=hh(d,a,b,c,x(12),11,-421815835); c=hh(c,d,a,b,x(15),16,530742520); b=hh(b,c,d,a,x(2),23,-995338651);
            a=ii(a,b,c,d,x(0),6,-198630844); d=ii(d,a,b,c,x(7),10,1126891415); c=ii(c,d,a,b,x(14),15,-1416354905); b=ii(b,c,d,a,x(5),21,-57434055);
            a=ii(a,b,c,d,x(12),6,1700485571); d=ii(d,a,b,c,x(3),10,-1894986606); c=ii(c,d,a,b,x(10),15,-1051523); b=ii(b,c,d,a,x(1),21,-2054922799);
            a=ii(a,b,c,d,x(8),6,1873313359); d=ii(d,a,b,c,x(15),10,-30611744); c=ii(c,d,a,b,x(6),15,-1560198380); b=ii(b,c,d,a,x(13),21,1309151649);
            a=ii(a,b,c,d,x(4),6,-145523070); d=ii(d,a,b,c,x(11),10,-1120210379); c=ii(c,d,a,b,x(2),15,718787259); b=ii(b,c,d,a,x(9),21,-343485551);
            a=add(a,oa);b=add(b,ob);c=add(c,oc);d=add(d,od);
        }
        const hex=n=>{let out='';for(let j=0;j<4;j++)out+=('0'+((n>>>(j*8))&255).toString(16)).slice(-2);return out;};
        return hex(a)+hex(b)+hex(c)+hex(d);
    }
    extractBalancedJsonObject(raw, marker) {
        const text=String(raw||''); let pos=text.indexOf(marker); if(pos<0)return null;
        let start=text.lastIndexOf('{',pos), attempts=0;
        while(start>=0&&attempts++<160){
            let depth=0,inStr=false,esc=false;
            for(let i=start;i<text.length&&i-start<18000000;i++){
                const ch=text[i];
                if(inStr){if(esc)esc=false;else if(ch==='\\')esc=true;else if(ch==='"')inStr=false;continue;}
                if(ch==='"'){inStr=true;continue;} if(ch==='{')depth++; else if(ch==='}'){depth--;if(depth===0){
                    const chunk=text.slice(start,i+1); if(chunk.includes(marker)){try{return JSON.parse(chunk);}catch(_){} } break;
                }}
            }
            start=text.lastIndexOf('{',start-1);
        }
        return null;
    }
    shuqiChaptersFromPayload(raw, bookId) {
        let obj=null;
        try { obj=typeof raw==='string'?JSON.parse(raw):raw; } catch (_) {}
        if (!obj && typeof raw==='string') obj=this.extractBalancedJsonObject(raw,'"chapterList"');
        const roots=[];
        const add=x=>{if(x&&typeof x==='object'&&!roots.includes(x))roots.push(x);};
        add(obj); add(obj?.data); add(obj?.book); add(obj?.data?.book);
        let chapterList=[];
        for(const r of roots){if(Array.isArray(r?.chapterList)&&r.chapterList.length){chapterList=r.chapterList;break;}}
        if(!chapterList.length)return [];
        const out=[]; let order=0;
        for(const volume of chapterList){
            const rows=Array.isArray(volume?.volumeList)?volume.volumeList:Array.isArray(volume?.chapters)?volume.chapters:[];
            const volumeName=this.norm(volume?.volumeName||volume?.name||'');
            for(const row of rows){
                const chapterId=String(row?.chapterId||row?.id||'');
                const name=this.norm(row?.chapterName||row?.name||row?.title||'');
                if(!chapterId||!name)continue;
                const path=`https://t.shuqi.com/reader/${bookId}/?forceChapterId=${encodeURIComponent(chapterId)}`;
                const info=this.extractChapterNumber(name,path);
                const ordinal=Number(row?.chapterOrdid||row?.chapterOrder||0);
                out.push({name:volumeName&&volumeName!=='正文'&&!name.includes(volumeName)?`${volumeName} - ${name}`:name,path,order:order++,...(Number.isFinite(ordinal)&&ordinal>0?{number:ordinal,numberSource:'text'}:info)});
            }
        }
        return this.mergeChapterCandidates(out);
    }
    async extractShuqiCatalog(novelUrl, $) {
        const bookId=this.shuqiBookId(novelUrl); if(!bookId)return null;
        const expected=this.shuqiExpectedChapterCount($);
        const ts=Math.floor(Date.now()/1000), uid='8000000', key='37e81a9d8f02596e1b895d07c171d5c9';
        const sign=this.md5Hex(`${bookId}${ts}${uid}${key}`);
        const urls=[
            `https://ocean.shuqireader.com/api/bcspub/qswebapi/book/chapterlist?_=${ts}&bookId=${bookId}&user_id=${uid}&sign=${sign}&timestamp=${ts}`,
            `https://www.shuqi.com/reader?bid=${bookId}`,
        ];
        const tasks=urls.map(async sourceUrl=>{
            try{
                const raw=await this.withAbortTimeout(signal=>this.getTextSingleStrategy(sourceUrl,'catalog',signal),5800,'catálogo Shuqi');
                const items=this.shuqiChaptersFromPayload(raw,bookId);
                return {sourceUrl,items};
            }catch(_){return {sourceUrl,items:[]};}
        });
        const results=await Promise.all(tasks);
        results.sort((a,b)=>b.items.length-a.items.length);
        const best=results[0];
        if(!best?.items?.length)return null;
        // If the detail page explicitly advertises thousands of chapters, three
        // latest rows are a teaser, never a complete TOC.
        if(expected>20&&best.items.length<Math.min(expected,Math.max(20,Math.floor(expected*0.35))))return null;
        return {items:best.items,sourceUrl:best.sourceUrl,expected};
    }
    detectRemoteCatalog($, base) {
        // WebNovelWorld-style documents explicitly advertise their chapter route.
        // Do not guess this protocol from a hostname or a generic chapter count.
        const title = $('h1.novel-title').length;
        const count = Number(this.norm($('.header-stats span').first().find('strong').text()).replace(/[,\s]/g, ''));
        let template = '';
        $('a[href*="/chapters/page-"]').each((_i, el) => {
            const href = this.resolveAgainst($(el).attr('href'), base);
            if (!href) return;
            const candidate = new URL(href), work = new URL(base);
            if (candidate.origin !== work.origin || !candidate.pathname.startsWith(work.pathname.replace(/\/$/, '') + '/chapters/page-')) return;
            if (/\/chapters\/page-\d+\/?$/.test(candidate.pathname)) template = href.replace(/(\/chapters\/page-)\d+(\/?)(?=[?#]|$)/, '$1{page}$2');
        });
        if (!title || !Number.isSafeInteger(count) || count < 1 || !template) return null;
        return {template, count, pageSize:100, totalPages:Math.ceil(count / 100)};
    }
    rememberRemoteCatalog(url, descriptor) {
        try { storage_1.storage.set(this.catalogCacheKey(url) + ':remote', JSON.stringify({url, descriptor, expires:Date.now() + 120000}), Date.now() + 120000); } catch (_) {}
    }
    getRemoteCatalog(url) {
        try {
            const raw = storage_1.storage.get(this.catalogCacheKey(url) + ':remote');
            const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
            return data?.url === url && data.expires > Date.now() ? data.descriptor : null;
        } catch (_) { return null; }
    }
    async fetchRemoteCatalogPage(url, descriptor, pageNo) {
        if (pageNo > descriptor.totalPages) return [];
        const pageUrl = descriptor.template.replace('{page}', String(pageNo));
        const html = await this.withAbortTimeout(signal => this.getTextSingleStrategy(pageUrl, 'catalog', signal), 6500, 'página remota do catálogo');
        const $ = (0, cheerio_1.load)(this.compactCatalogHtml(html));
        const items = [];
        $('.chapter-list li').each((_i, el) => {
            const node = $(el), a = node.find('a[href]').first();
            const path = this.resolveAgainst(a.attr('href'), pageUrl);
            if (!path || new URL(path).origin !== new URL(url).origin) return;
            const numberText = this.norm(node.find('.chapter-no').text());
            const title = this.norm(node.find('.chapter-title').text());
            const name = title ? `${numberText ? 'Chapter ' + numberText + ' - ' : ''}${title}` : this.norm(a.text());
            if (!name) return;
            items.push({name, path, page:String(pageNo),
                chapterNumber: Number(numberText) || (pageNo - 1) * descriptor.pageSize + items.length + 1,
                ...(node.find('[datetime]').attr('datetime') ? {releaseTime:node.find('[datetime]').attr('datetime')} : {})});
        });
        const unique = items.filter((item, i) => items.findIndex(x => x.path === item.path) === i);
        const expected = Math.min(descriptor.pageSize, descriptor.count - (pageNo - 1) * descriptor.pageSize);
        if (unique.length !== expected) throw this.catalogIncomplete('contagem da página remota diverge do total anunciado');
        return unique;
    }
    catalogIncomplete(message) {
        return Object.assign(new Error('Translator Hell: catálogo incompleto — ' + message + '. Tente novamente.'), {catalogIncomplete: true});
    }
    discoverChapterRequests($, base, profile) {
        const u = new URL(base), requests = [];
        const adapter = this.detectNovelAdapter($, base);
        // IDs are read from this work's DOM/route, never from a different saved novel.
        if (adapter === 'fictionposts') {
            const id=u.pathname.match(/^\/series\/(\d+)\//)?.[1];
            if (id) requests.push({url:u.origin+'/wp-admin/admin-ajax.php',method:'POST',
                body:'action=wi_getreleases_pagination&pagenum=-1&mypostid='+encodeURIComponent(id),newestFirst:true,selector:'.toc_w a.toc_a,.toc_w a[href]'});
        }
        if (adapter === 'madara' || $('#manga-chapters-holder').length) {
            const id = $('#manga-chapters-holder').attr('data-id') || $('.rating-post-id').attr('value');
            const root = u.href.split(/[?#]/)[0].replace(/\/?$/, '/');
            requests.push({url: root + 'ajax/chapters/', method: 'POST', selector: '.wp-manga-chapter a[href]'});
            if (/^\d+$/.test(String(id || ''))) {
                const wpRoot = $('link[rel="https://api.w.org/"]').attr('href');
                const api = this.resolveAgainst(wpRoot, base);
                const prefix = api && new URL(api).origin === u.origin ? new URL(api).pathname.split('/wp-json')[0] : '';
                requests.push({url: u.origin + prefix + '/wp-admin/admin-ajax.php', method: 'POST',
                    body: 'action=manga_get_chapters&manga=' + encodeURIComponent(id), selector: '.wp-manga-chapter a[href]'});
            }
        }
        const id = $('#rating[data-novel-id]').attr('data-novel-id');
        // Paginated/POST variants require additional site-specific parameters;
        // do not pretend the plain archive protocol supports them.
        if (/^\d+$/.test(String(id || '')) && !$('#indexListPage[data-total-chapters]').length) {
            requests.push({url: u.origin + '/ajax/chapter-archive?novelId=' + encodeURIComponent(id), method: 'GET', selector: '.list-chapter a[href],.chapter-list a[href],a[href]'});
        }
        return requests;
    }
    async extractAjaxCatalog($, base, profile) {
        const requests = this.discoverChapterRequests($, base, profile);
        if (!requests.length) return null;
        const deadline = Date.now() + 8500;
        for (const request of requests) {
            const queue = [request.url], seen = new Set();
            let items = [], first = true;
            while (queue.length) {
                if (Date.now() >= deadline || seen.size >= 80) throw this.catalogIncomplete('limite de páginas/tempo AJAX atingido');
                const url = queue.shift();
                if (seen.has(url)) continue;
                seen.add(url);
                let html;
                try {
                    html = await this.withAbortTimeout(async signal => {
                        const response = await (0, fetch_1.fetchApi)(url, {
                            method: request.method, credentials: 'include', signal,
                            headers: {Referer: base, 'X-Requested-With': 'XMLHttpRequest',
                                ...(request.body ? {'Content-Type': 'application/x-www-form-urlencoded'} : {})},
                            ...(request.body ? {body: request.body} : {}),
                        });
                        return await this.consumeHttpResponse(response, url);
                    }, Math.min(4500, deadline - Date.now()), 'catálogo AJAX');
                } catch (error) {
                    if (error?.protection?.challenge) throw error;
                    if (!first) throw this.catalogIncomplete('falha em uma página AJAX anunciada');
                    break;
                }
                try { const json = JSON.parse(html); if (typeof json?.html === 'string') html = json.html; } catch (_) {}
                const page$ = (0, cheerio_1.load)(html);
                const rows = this.extractChapterLinks(page$, base, request.selector);
                if (!rows.length) {
                    if (!first) throw this.catalogIncomplete('página AJAX anunciada sem capítulos');
                    break;
                }
                const merged = this.mergeChapterCandidates(items, rows);
                if (!first && merged.length === items.length) throw this.catalogIncomplete('paginação AJAX repetiu os capítulos');
                if (merged.length > 20000) throw this.catalogIncomplete('limite de 20000 capítulos atingido');
                items = merged; first = false;
                page$('a[rel="next"],.pagination a[href],.pagination a[data-page]').each((_i, el) => {
                    const a = page$(el), href = this.resolveAgainst(a.attr('href'), url);
                    if (!href) {if (Number(a.attr('data-page')) > 1) throw this.catalogIncomplete('paginador AJAX sem URL utilizável');return;}
                    const next = new URL(href), endpoint = new URL(request.url);
                    // Keep the same endpoint/work/body; reject external and unrelated links.
                    if (next.origin !== endpoint.origin || next.pathname !== endpoint.pathname) return;
                    for (const key of ['novelId', 'manga', 'bookId']) {
                        if (endpoint.searchParams.has(key) && next.searchParams.get(key) !== endpoint.searchParams.get(key)) return;
                    }
                    const pageKey = ['page','paged','p','chapter_page'].find(k => /^\d+$/.test(next.searchParams.get(k) || ''));
                    if (pageKey) {
                        const last = Number(next.searchParams.get(pageKey));
                        if (last > 80) throw this.catalogIncomplete('mais de 80 páginas AJAX anunciadas');
                        for (let n = 2; n <= last; n++) {
                            const numbered = new URL(next.href); numbered.searchParams.set(pageKey, String(n));
                            if (!seen.has(numbered.href) && !queue.includes(numbered.href)) queue.push(numbered.href);
                        }
                    } else if (Number(a.attr('data-page')) > 1 && next.href === url) {
                        throw this.catalogIncomplete('paginador AJAX sem parâmetro de página');
                    }
                    if (!seen.has(href) && !queue.includes(href)) queue.push(href);
                });
            }
            if (items.length) return {items:request.newestFirst ? items.slice().reverse().map((row,order)=>({...row,order})) : items, chapterSelector: request.selector};
        }
        return null;
    }
    async extractChaptersDeep($, novelUrl, profile) {
        // Architecture-specific parsers always run before generic URL guessing.
        const ajax = await this.extractAjaxCatalog($, novelUrl, profile);
        if (ajax?.items?.length) {
            const rows = this.sortChapters(ajax.items);
            return {chapters: rows.map((x, i) => ({name: x.name, path: x.path,
                chapterNumber: Number.isFinite(x.number) && x.numberSource === 'text' ? x.number : i + 1})),
                chapterSelector: ajax.chapterSelector};
        }
        const architecture = this.extractArchitectureChapters($, novelUrl, profile);
        if (architecture?.chapters?.length >= 3) {
            const sorted = this.sortChapters(this.mergeChapterCandidates(architecture.chapters)).slice(0, 20000);
            return {
                chapters: sorted.map((x, i) => ({ name:x.name, path:x.path, chapterNumber:i + 1 })),
                chapterSelector: architecture.chapterSelector,
            };
        }
        const adapter = profile?.novelAdapter || this.detectNovelAdapter($, novelUrl);
        if (adapter === 'yuewen-mobile') {
            const y = await this.extractYuewenCatalog(novelUrl);
            if (y?.deep?.items?.length >= 3) {
                const sorted = this.sortChapters(this.mergeChapterCandidates(y.deep.items)).slice(0, 20000);
                return {
                    chapters: sorted.map((x,i)=>({ name:x.name, path:x.path, chapterNumber:Number.isFinite(x.number)&&x.numberSource==='text'?x.number:i+1 })),
                    catalogUrl: y.catalogUrl,
                    ...(y.deep.chapterSelector ? {chapterSelector:y.deep.chapterSelector} : {}),
                };
            }
        }
        if (adapter === 'shuqi-mobile') {
            const sq = await this.extractShuqiCatalog(novelUrl, $);
            if (sq?.items?.length >= 3) {
                const sorted=this.sortChapters(this.mergeChapterCandidates(sq.items)).slice(0,20000);
                return {
                    chapters:sorted.map((x,i)=>({name:x.name,path:x.path,chapterNumber:Number.isFinite(x.number)&&x.numberSource==='text'?x.number:i+1})),
                    chapterSelector:'shuqi:catalog-api',
                };
            }
        }

        let staticDeep = null;
        // Static/mobile portal family: /n/<slug>/ -> /n/<slug>/list.html. v0.8.0
        // returned as soon as that page had 3 links, so a teaser like 1..34 +
        // 4893.. could become a fake two-page catalog. A fast path is now allowed
        // to return only after continuity validation.
        try {
            const nu = new URL(novelUrl);
            const nm = nu.pathname.match(/^\/n\/([^/]+)(?:\/(?:list\.html|\d+\.html))?\/?$/i);
            if (nm) {
                const listUrl = `${nu.origin}/n/${nm[1]}/list.html`;
                try {
                    // First inspect the canonical list page without guessing list_2,
                    // list_3... yet. Quanben-like portals may serve a cheap teaser on
                    // the normal page but a complete AMP TOC; probing four invented
                    // siblings first would only add latency.
                    const deep = await this.fetchCatalogPages(listUrl, undefined, { overallMs: 5200, pageMs: 4300, maxPages: 180, inferSiblings: false });
                    if (deep?.items?.length >= 3) {
                        if (!this.hasLargeChapterGaps(deep.items)) {
                            const sorted = this.sortChapters(this.mergeChapterCandidates(deep.items)).slice(0, 20000);
                            return {
                                chapters: sorted.map((x, i) => ({ name:x.name, path:x.path, chapterNumber:Number.isFinite(x.number)&&x.numberSource==='text'?x.number:i+1 })),
                                catalogUrl: listUrl,
                                ...(deep.chapterSelector ? {chapterSelector:deep.chapterSelector} : {}),
                            };
                        }
                        // A first+latest teaser is not a catalog. Prefer an alternate
                        // representation (commonly /amp/n/.../list.html) immediately.
                        const alternates = this.catalogRecoveryUrls(listUrl)
                            .filter(x => x !== listUrl);
                        for (const alt of alternates.slice(0, 2)) {
                            let altDeep = null;
                            try { altDeep = await this.fetchCatalogPages(alt, undefined, { overallMs: 6500, pageMs: 4800, maxPages: 180, inferSiblings: true }); } catch (error) { if (error?.catalogIncomplete || error?.protection?.challenge) throw error;}
                            if (!altDeep?.items?.length || !this.compatibleCatalogRepresentation(deep.items,altDeep.items,listUrl,alt)) continue;
                            if (this.shouldPreferCompleteCatalog(deep.items, altDeep.items) || !this.hasLargeChapterGaps(altDeep.items)) {
                                const sorted = this.sortChapters(this.mergeChapterCandidates(altDeep.items)).slice(0, 20000);
                                if (!this.hasExtremeChapterGap(sorted)) return {
                                    chapters: sorted.map((x, i) => ({ name:x.name, path:x.path, chapterNumber:Number.isFinite(x.number)&&x.numberSource==='text'?x.number:i+1 })),
                                    catalogUrl: alt,
                                    ...(altDeep.chapterSelector ? {chapterSelector:altDeep.chapterSelector} : {}),
                                };
                            }
                        }
                        staticDeep = { listUrl, deep };
                    }
                } catch (error) { if (error?.catalogIncomplete || error?.protection?.challenge) throw error;}
            }
        } catch (error) { if (error?.catalogIncomplete || error?.protection?.challenge) throw error;}

        let chapterSelector = profile?.selectors?.chapterLink || this.findBestChapterSelector($, novelUrl);
        let candidates = this.extractChapterLinks($, novelUrl, chapterSelector);
        let usedCatalog = '';
        if (staticDeep?.deep?.items?.length) {
            candidates = this.mergeChapterCandidates(candidates, staticDeep.deep.items);
            usedCatalog = staticDeep.listUrl;
            if (staticDeep.deep.chapterSelector) chapterSelector = staticDeep.deep.chapterSelector;
        }
        const savedRoute = this.novelRoute(profile, novelUrl);
        let catalogLinks = this.uniqueStrings([
            savedRoute?.catalogUrl || '',
            ...this.discoverCatalogLinks($, novelUrl),
        ]).filter(Boolean).filter(x => this.catalogBelongsToNovel(x, novelUrl));
        if (usedCatalog) catalogLinks = catalogLinks.filter(x => x !== usedCatalog);
        catalogLinks = this.rankCatalogUrls(catalogLinks, novelUrl);

        // Probe candidates sequentially under one deadline. Promise.all in v0.8.0
        // forced a valid 3.8 s /chapterlist result to wait for an invented 14 s
        // /catalog.html timeout. The first high-quality complete catalog wins now.
        const probeDeadline = Date.now() + 8500;
        const shouldProbeCatalog = catalogLinks.length > 0 && (!!savedRoute?.catalogUrl || candidates.length < 120 || this.hasLargeChapterGaps(candidates));
        if (shouldProbeCatalog) {
            for (const catalogUrl of catalogLinks.slice(0, 5)) {
                const remaining = probeDeadline - Date.now();
                if (remaining < 700) break;
                let deep = null;
                try { deep = await this.fetchCatalogPages(catalogUrl, chapterSelector, { overallMs:Math.min(5600, remaining), pageMs:Math.min(4700, remaining), maxPages:80 }); } catch (error) { if (error?.catalogIncomplete || error?.protection?.challenge) throw error;}
                if (!deep?.items?.length) continue;
                const deepItems = deep.items || [];
                const replaceTeaser = this.shouldPreferCompleteCatalog(candidates, deepItems);
                const merged = this.mergeChapterCandidates(candidates, deepItems);
                if (replaceTeaser || deepItems.length >= candidates.length || this.chapterCoverageScore(merged) > this.chapterCoverageScore(candidates)) {
                    candidates = replaceTeaser ? this.mergeChapterCandidates(deepItems) : merged;
                    usedCatalog = catalogUrl;
                    if (deep.chapterSelector) chapterSelector = deep.chapterSelector;
                }
                if (!this.hasLargeChapterGaps(candidates) && candidates.length >= Math.max(30, deepItems.length)) break;
            }
        }

        if (this.hasLargeChapterGaps(candidates) && Date.now() < probeDeadline) {
            const recoveryBase = usedCatalog || catalogLinks[0] || novelUrl;
            const recovery = this.rankCatalogUrls(this.catalogRecoveryUrls(recoveryBase), novelUrl)
                // Do not spend the recovery budget fetching the same teaser URL a
                // second time. For Quanben-like portals this makes the AMP/full
                // representation the immediate second chance.
                .filter(x => !usedCatalog || x !== usedCatalog);
            for (const recoveryUrl of recovery.slice(0, 3)) {
                const remaining = probeDeadline - Date.now();
                if (remaining < 700) break;
                let deep = null;
                try { deep = await this.fetchCatalogPages(recoveryUrl, undefined, { overallMs:Math.min(5000, remaining), pageMs:Math.min(4200, remaining), maxPages:100 }); } catch (error) { if (error?.catalogIncomplete || error?.protection?.challenge) throw error;}
                if (!deep?.items?.length) continue;
                candidates = this.shouldPreferCompleteCatalog(candidates, deep.items)
                    ? this.mergeChapterCandidates(deep.items)
                    : this.mergeChapterCandidates(candidates, deep.items);
                if (!this.hasLargeChapterGaps(candidates)) break;
            }
        }

        // Never publish a spectacular first+latest jump as if it were complete. If
        // the source prevented full recovery, retain the initial contiguous run so
        // LNReader does not show e.g. Chapter 34 -> 4893 while a later retry/cache
        // can still recover the complete TOC.
        if (this.hasExtremeChapterGap(candidates)) throw this.catalogIncomplete('lacuna extrema entre capítulos; teaser rejeitado');
        const sorted = this.sortChapters(candidates).slice(0, 20000);
        const chapters = sorted.map((x, i) => ({
            name: x.name,
            path: x.path,
            chapterNumber: Number.isFinite(x.number) && x.numberSource === 'text' ? x.number : i + 1,
        }));
        return { chapters, ...(usedCatalog ? { catalogUrl: usedCatalog } : {}), ...(chapterSelector ? { chapterSelector } : {}) };
    }
    mergeChapterCandidates(...groups) {
        const map = new Map();
        let order = 0;
        for (const group of groups) {
            for (const item of (group || [])) {
                if (!item?.path) continue;
                const key = this.canonicalChapterIdentity(item.path);
                const prev = map.get(key);
                if (!prev) {
                    map.set(key, { ...item, order: order++ });
                    continue;
                }
                const prevAmp = /\/amp\//i.test(String(prev.path || ''));
                const nextAmp = /\/amp\//i.test(String(item.path || ''));
                const betterPath = prevAmp && !nextAmp;
                const betterName = (item.name || '').length > (prev.name || '').length;
                if (betterPath || betterName) map.set(key, { ...prev, ...item, order: prev.order });
            }
        }
        return Array.from(map.values());
    }
    rankCatalogUrls(urls, novelUrl = '') {
        const seen = new Set();
        const scored = [];
        for (let i=0;i<(urls||[]).length;i++) {
            const url = String(urls[i] || '');
            if (!url || seen.has(url)) continue;
            seen.add(url);
            let score = 0, path = '';
            try { path = new URL(url).pathname.toLowerCase(); } catch (_) { path = url.toLowerCase(); }
            if (/\/chapter\/[^/]+\/[^/]+\/?$/i.test(path) && !/\/chapter\/list\//i.test(path)) score -= 100;
            if (/chapterlist|chapter-list|chapter_list|\/chapter\/list\//i.test(path)) score += 80;
            if (/(?:directory|toc|chapters)/i.test(path)) score += 60;
            if (/catalog|catalogue/i.test(path)) score += 45;
            if (/\/list(?:[_-]\d+)?\.(?:html?|php)$/i.test(path)) score += 55;
            if (novelUrl && url === novelUrl) score -= 40;
            scored.push({url, score, order:i});
        }
        return scored.filter(x=>x.score>-80).sort((a,b)=>b.score-a.score||a.order-b.order).map(x=>x.url);
    }
    hasExtremeChapterGap(items) {
        const values = (items || []).filter(x=>x?.numberSource==='text'&&Number.isFinite(x.number)).map(x=>Number(x.number));
        if (values.length < 8) return false;
        const u=[...new Set(values)].sort((a,b)=>a-b); let biggest=0;
        for(let i=1;i<u.length;i++) biggest=Math.max(biggest,u[i]-u[i-1]-1);
        return biggest >= Math.max(50, u.length * 2);
    }
    contiguousChapterFallback(items) {
        const numbered=(items||[]).filter(x=>x?.numberSource==='text'&&Number.isFinite(x.number)).sort((a,b)=>a.number-b.number||a.order-b.order);
        if(numbered.length<8)return items||[];
        const runs=[]; let current=[numbered[0]];
        for(let i=1;i<numbered.length;i++){
            const prev=Number(current[current.length-1].number), n=Number(numbered[i].number);
            if(n-prev<=2) current.push(numbered[i]);
            else { runs.push(current); current=[numbered[i]]; }
        }
        runs.push(current);
        let chosen=runs[0];
        const firstRun=runs.find(r=>Number(r[0]?.number)<=5 && r.length>=5);
        if(firstRun) chosen=firstRun;
        else for(const r of runs) if(r.length>chosen.length) chosen=r;
        const keep=new Set(chosen.map(x=>this.canonicalChapterIdentity(x.path)));
        return (items||[]).filter(x=>keep.has(this.canonicalChapterIdentity(x.path))).map((x,i)=>({...x,order:i}));
    }
    chapterCoverageScore(items) {
        const values = (items || []).filter(x => x?.numberSource === 'text' && Number.isFinite(x.number)).map(x => x.number);
        if (values.length < 3) return (items || []).length;
        const unique = [...new Set(values)].sort((a,b) => a-b);
        const span = Math.max(1, unique[unique.length - 1] - unique[0] + 1);
        const continuity = unique.length / span;
        return (items || []).length + continuity * 5000;
    }
    hasLargeChapterGaps(items) {
        const values = (items || []).filter(x => x?.numberSource === 'text' && Number.isFinite(x.number)).map(x => x.number);
        if (values.length < 8) return false;
        const unique = [...new Set(values)].sort((a,b) => a-b);
        let biggest = 0;
        let holes = 0;
        for (let i = 1; i < unique.length; i++) {
            const gap = unique[i] - unique[i-1] - 1;
            if (gap > 0) holes += gap;
            if (gap > biggest) biggest = gap;
        }
        const span = Math.max(1, unique[unique.length - 1] - unique[0] + 1);
        const coverage = unique.length / span;
        return biggest >= 8 || (span >= 50 && coverage < 0.82) || holes > Math.max(20, unique.length * 0.25);
    }
    compatibleCatalogRepresentation(seed, candidate, sourceUrl, targetUrl) {
        if (this.sameSiteHost(new URL(sourceUrl).hostname,new URL(targetUrl).hostname)) return true;
        // Never manufacture chapter URLs from their ordinal (upstream's sequential
        // mapping can be wrong when prologues create an offset).
        const identity = row => this.norm(row.name).replace(/\s+/g,'').replace(/[，。！？,:.!?]/g,'');
        const names=new Set((candidate||[]).map(identity));
        return (seed||[]).filter(row=>names.has(identity(row))).length >= Math.min(3,(seed||[]).length) && (seed||[]).length >= 3;
    }
    catalogRecoveryUrls(url) {
        const out = [];
        const add = value => { if (value && !out.includes(value)) out.push(value); };
        add(url);
        try {
            const u = new URL(url);
            const p = u.pathname;
            if (/^\/amp\//i.test(p)) {
                const x = new URL(u.href); x.pathname = p.replace(/^\/amp/i, ''); add(x.href);
            } else {
                const x = new URL(u.href); x.pathname = '/amp' + (p.startsWith('/') ? p : '/' + p); add(x.href);
            }
            if (/\/n\/[^/]+\/?$/i.test(p)) {
                const x = new URL(u.href); x.pathname = p.replace(/\/?$/, '/list.html'); add(x.href);
                const y = new URL(u.href); y.pathname = '/amp' + p.replace(/\/?$/, '/list.html'); add(y.href);
            }
            if (/\/n\/[^/]+\/list\.html$/i.test(p)) {
                const x = new URL(u.href); x.pathname = p.replace('/n/', '/amp/n/'); add(x.href);
            }
            // Explicit relation documented by the upstream Quanben adapter. This is
            // a route hint only; actual chapter hrefs and matching names are required.
            const slug=p.match(/^(?:\/amp)?\/n\/([^/]+)\//)?.[1];
            if (slug && /^(?:www\.)?quanben\.io$/i.test(u.hostname)) add('https://quanben5.com/n/'+slug+'/xiaoshuo.html');
        } catch (_) {}
        return out;
    }
    compactCatalogHtml(html) {
        const raw = String(html || '');
        if (raw.length <= 900000) return raw;
        const stripped = raw
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
            .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
        const lower = stripped.toLowerCase();
        let best = '';
        let bestScore = 0;
        const score = fragment => {
            const anchors = (fragment.match(/<a\b/gi) || []).length;
            const chapterSignals = (fragment.match(/(?:chapter|chapitre|cap[ií]tulo|第\s*[0-9零〇一二两三四五六七八九十百千万]+\s*[章节回話话]|章节|章節)/gi) || []).length;
            return anchors + chapterSignals * 3;
        };
        let pos = 0;
        while ((pos = lower.indexOf('<nav', pos)) >= 0) {
            const end = lower.indexOf('</nav>', pos);
            if (end < 0) break;
            const fragment = stripped.slice(pos, Math.min(stripped.length, end + 6));
            const sc = score(fragment);
            if (sc > bestScore) { best = fragment; bestScore = sc; }
            pos = end + 6;
        }
        for (const marker of ['chapter-list','chapterlist','chapter_list','catalog','catalogue','directory','listmain','toc','章节','章節','目录','目錄']) {
            let i = lower.indexOf(marker);
            let count = 0;
            while (i >= 0 && count++ < 6) {
                const fragment = stripped.slice(Math.max(0, i - 24000), Math.min(stripped.length, i + 1800000));
                const sc = score(fragment);
                if (sc > bestScore) { best = fragment; bestScore = sc; }
                i = lower.indexOf(marker, i + marker.length);
            }
        }
        if (best && bestScore >= 12) return best;
        // Script-heavy pages often shrink enough after stripping to make full DOM
        // parsing inexpensive. Otherwise preserve the full HTML as correctness fallback.
        return stripped.length <= Math.min(4000000, raw.length * 0.65) ? stripped : raw;
    }
    findNextCatalogPageRaw(html, base, visited) {
        const raw = String(html || '');
        const re = /<a\b([^>]{0,2500})>([\s\S]*?)<\/a>/gi;
        let m; let count = 0;
        while ((m = re.exec(raw)) && count++ < 12000) {
            const attrs = m[1] || '';
            const text = this.norm(String(m[2] || '').replace(/<[^>]+>/g, ' '));
            const rel = (attrs.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
            if (!/\bnext\b/i.test(rel) && !/^(下一页|下一頁|下页|下頁|next\s*page|next|›|»|→)$/i.test(text)) continue;
            const href = (attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
            const resolved = this.resolveAgainst(href, base);
            if (resolved && !visited.has(resolved)) return resolved;
        }
        return undefined;
    }
    findCatalogPageCandidatesRaw(html, base, visited = new Set()) {
        const found = [], seen = new Set();
        const add = (href, score, pageNo) => {
            const resolved = this.resolveAgainst(href, base);
            if (!resolved || !this.isCatalogPageUrl(resolved, base) || visited.has(resolved) || seen.has(resolved)) return;
            seen.add(resolved); found.push({url:resolved,score,pageNo:Number.isFinite(pageNo)?pageNo:999999});
        };
        const raw=String(html||'');
        // Anchors, selects/options and JS widgets frequently carry pagination URLs
        // outside visible <a> text. Parse URL-bearing attributes generically.
        const attrRe=/(?:href|value|data-url|data-href|data-page-url)\s*=\s*["']([^"']+)["']/gi;
        let m,count=0;
        while((m=attrRe.exec(raw))&&count++<24000){
            const href=m[1]; const resolved=this.resolveAgainst(href,base)||''; if(!resolved)continue;
            const around=raw.slice(Math.max(0,m.index-220),Math.min(raw.length,m.index+420));
            const text=this.norm(around.replace(/<[^>]+>/g,' '));
            const explicit=resolved.match(/[?&](?:page|p|pageNo|pageNum|paged)=(\d+)(?:&|$)/i)
                || resolved.match(/\/page\/(\d+)(?:\/|$)/i)
                || resolved.match(/(?:list|catalog|page|index|directory|toc)[_-]?(\d+)\.(?:html?|php)(?:$|[?#])/i);
            const pageNo=explicit?parseInt(explicit[1],10):undefined;
            if(/(?:next|下一页|下一頁|下页|下頁|siguiente|pr[oó]xim|suivant|weiter|›|»|→)/i.test(text)) add(href,100,pageNo);
            else if(Number.isFinite(pageNo)&&pageNo>1) add(href,70,pageNo);
        }
        return found.sort((a,b)=>b.score-a.score||a.pageNo-b.pageNo).map(x=>x.url).slice(0,48);
    }
    catalogPageDescriptor(rawUrl) {
        try {
            const u=new URL(rawUrl); let m;
            if((m=u.pathname.match(/^(.*?)(?:_(\d+))?(\.(?:html?|php))$/i)) && /(?:list|catalog|directory|toc|index)$/i.test(m[1].split('/').pop()||'')) {
                const prefix=m[1], ext=m[3], current=m[2]?parseInt(m[2],10):1;
                return {current, make:(n)=>{const x=new URL(u.href);x.pathname=n<=1?`${prefix}${ext}`:`${prefix}_${n}${ext}`;return x.href;}};
            }
            if((m=u.pathname.match(/^(.*?\/page\/)(\d+)(\/?$)/i))) {
                const prefix=m[1],suffix=m[3]||'/';return {current:parseInt(m[2],10),make:(n)=>{const x=new URL(u.href);x.pathname=`${prefix}${n}${suffix}`;return x.href;}};
            }
            for(const key of ['page','p','pageNo','pageNum','paged']) if(u.searchParams.has(key)) {
                const current=parseInt(u.searchParams.get(key)||'1',10)||1;return {current,make:(n)=>{const x=new URL(u.href);x.searchParams.set(key,String(n));return x.href;}};
            }
        } catch (_) {}
        return null;
    }
    inferCatalogSiblingPages(url, count = 4) {
        const d=this.catalogPageDescriptor(url); if(!d)return [];
        const out=[]; for(let n=Math.max(2,d.current+1);n<Math.max(2,d.current+1)+Math.max(1,count);n++)out.push(d.make(n));
        return out;
    }
    expandCatalogPageSeries(urls) {
        const groups=[];
        for(const url of (urls||[])){
            const d=this.catalogPageDescriptor(url); if(!d)continue;
            let sample2; try{sample2=d.make(2);}catch(_){continue;}
            const key=sample2.replace(/2(?=[^2]*$)/,'{n}');
            let g=groups.find(x=>x.key===key); if(!g){g={key,d,max:1};groups.push(g);} g.max=Math.max(g.max,d.current||1);
        }
        const best=groups.sort((a,b)=>b.max-a.max)[0];
        if(!best||best.max<3||best.max>180)return [];
        const out=[]; for(let n=2;n<=best.max;n++)out.push(best.d.make(n)); return out;
    }
    isCatalogPageUrl(candidate, base) {
        try {
            const a = new URL(candidate), b = new URL(base);
            if (!this.sameSiteHost(a.hostname, b.hostname)) return false;
            const strip = u => u.pathname.replace(/\/page\/\d+\/?$/, '/').replace(/_(\d+)(\.html?)$/, '$2').replace(/\/$/, '');
            if (strip(a) !== strip(b)) return false;
            // Pagination changes page keys only, not book IDs or search context.
            for (const u of [a,b]) {u.hash='';for(const k of ['page','p','pageNo','pageNum','paged'])u.searchParams.delete(k);}
            return a.search === b.search;
        } catch (_) {return false;}
    }
    findCatalogPageCandidates($, base, visited = new Set()) {
        const found = [];
        const seen = new Set();
        const add = (href, score, pageNo) => {
            const resolved = this.resolveAgainst(href, base);
            if (!resolved || !this.isCatalogPageUrl(resolved, base) || visited.has(resolved) || seen.has(resolved)) return;
            seen.add(resolved);
            found.push({ url: resolved, score, pageNo: Number.isFinite(pageNo) ? pageNo : 999999 });
        };
        $('a[href]').each((_i, el) => {
            const a = $(el);
            const href = a.attr('href');
            const text = this.norm(a.text());
            const rel = String(a.attr('rel') || '');
            const cls = this.norm(`${a.attr('class') || ''} ${a.attr('aria-label') || ''} ${a.parent?.().attr?.('class') || ''}`);
            const resolved = this.resolveAgainst(href, base) || '';
            let pageNo = /^\d{1,4}$/.test(text) ? parseInt(text, 10) : undefined;
            const explicitPage = resolved.match(/[?&](?:page|p|pageNo|pageNum|paged)=(\d+)(?:&|$)/i)
                || resolved.match(/\/page\/(\d+)(?:\/|$)/i)
                || resolved.match(/(?:list|catalog|page|index)[_-]?(\d+)\.(?:html?|php)(?:$|[?#])/i);
            if (!Number.isFinite(pageNo) && explicitPage) pageNo = parseInt(explicitPage[1], 10);
            if (/\bnext\b/i.test(rel) || /(?:下一页|下一頁|下页|下頁|next\s*page|next|siguiente|pr[oó]xima|pr[oó]ximo|suivant|weiter|›|»|→)/i.test(`${text} ${cls}`)) add(href, 100, pageNo);
            else if (Number.isFinite(pageNo) && pageNo > 1 && /(?:pagination|pager|pages?|paginaci[oó]n|paginacao|página|pagina|page-nav|nav-links)/i.test(cls)) add(href, 80, pageNo);
            else if (explicitPage && Number.isFinite(pageNo) && pageNo > 1) add(href, 60, pageNo);
        });
        return found.sort((a, b) => b.score - a.score || a.pageNo - b.pageNo).map(x => x.url).slice(0, 48);
    }
    async fetchCatalogPages(startUrl, preferredSelector, options = {}) {
        const overallMs=Math.max(1800,Number(options?.overallMs||11000));
        const pageMs=Math.max(1200,Number(options?.pageMs||5000));
        const maxPages=Math.max(1,Math.min(180,Number(options?.maxPages||120)));
        const inferSiblings=options?.inferSiblings !== false;
        const key = `${String(startUrl || '')}|${String(preferredSelector || '')}|${Math.round(overallMs/1000)}|${maxPages}|${inferSiblings?'infer':'direct'}`;
        const running = this.catalogFetchInFlight.get(key);
        if (running) return await running;
        const task = this.fetchCatalogPagesFresh(startUrl, preferredSelector, {overallMs,pageMs,maxPages,inferSiblings}).finally(() => this.catalogFetchInFlight.delete(key));
        this.catalogFetchInFlight.set(key, task);
        return await task;
    }
    async fetchCatalogPagesFresh(startUrl, preferredSelector, options = {}) {
        const perf = this.perfStart('chapterCatalog', startUrl);
        const overallMs=Math.max(1800,Number(options?.overallMs||11000));
        const pageMs=Math.max(1200,Number(options?.pageMs||5000));
        const maxPages=Math.max(1,Math.min(180,Number(options?.maxPages||120)));
        const inferSiblings=options?.inferSiblings !== false;
        const deadline=Date.now()+overallMs;
        const visited=new Set(),queued=new Set(),all=[],identitySeen=new Set();
        const required=new Set([startUrl]), failed=new Set(); let truncated=false;
        const queue=[startUrl]; queued.add(startUrl); let selector=preferredSelector;
        while(queue.length&&visited.size<maxPages&&all.length<20000&&Date.now()<deadline){
            const batch=[];
            while(queue.length&&batch.length<4){const next=queue.shift();if(!next||visited.has(next))continue;visited.add(next);batch.push(next);}
            if(!batch.length)break;
            const batchStarted=Date.now();
            const pages=await Promise.all(batch.map(async url=>{
                const remaining=deadline-Date.now(); if(remaining<300)return {url,html:'',$:null,ok:false,rawBytes:0,compactBytes:0};
                try{
                    const html=await this.withAbortTimeout(signal=>this.getTextSingleStrategy(url,'catalog',signal),Math.min(pageMs,remaining),'página do catálogo');
                    if(Date.now()>=deadline)return {url,html:'',$:null,ok:false,rawBytes:0,compactBytes:0};
                    const compact=this.compactCatalogHtml(html); const $=(0,cheerio_1.load)(compact);
                    return {url,html,$,ok:true,rawBytes:String(html||'').length,compactBytes:String(compact||'').length};
                }catch(error){return {url,html:'',$:null,ok:false,error,rawBytes:0,compactBytes:0};}
            }));
            this.perfMark(perf,'fetch-parse-batch',{pages:batch.length,batchMs:Date.now()-batchStarted,bytes:pages.reduce((n,x)=>n+(x.rawBytes||0),0)});
            for(const page of pages){
                if(!page.ok||!page.$){if(page.error?.protection?.challenge)throw page.error;if(required.has(page.url))failed.add(page.url);continue;}
                const $=page.$,url=page.url; const before=all.length;
                const pageSelector=this.findBestChapterSelector($,url)||selector;if(!selector&&pageSelector)selector=pageSelector;
                // A learned chapter selector is authoritative. The previous code
                // always merged a second global a[href] scan, which could re-add
                // menu/copyright/reader links and manufacture fake chapter gaps.
                const selectedItems=this.extractChapterLinks($,url,pageSelector);
                const fallbackItems=selectedItems.length>=3?[]:this.extractChapterLinks($,url,undefined);
                const items=this.mergeChapterCandidates(selectedItems,fallbackItems);
                for(const item of items){const id=this.canonicalChapterIdentity(item.path);if(identitySeen.has(id))continue;identitySeen.add(id);all.push({...item,order:all.length});}
                const direct=this.uniqueStrings([...this.findCatalogPageCandidates($,url,visited),...this.findCatalogPageCandidatesRaw(page.html,url,visited)]);
                const series=this.expandCatalogPageSeries(direct);
                let nextUrls=this.uniqueStrings([...series,...direct]);
                for(const next of nextUrls)required.add(next);
                const added=all.length-before;
                // Teaser pages without visible pager: test the conventional sibling
                // series in a four-page window. Continue only when the prior page
                // actually contributed new chapters, so invalid patterns self-stop.
                if(inferSiblings&&!nextUrls.length&&added>=5&&(this.hasLargeChapterGaps(all)||this.hasExtremeChapterGap(items))){
                    nextUrls=this.inferCatalogSiblingPages(url,4);
                } else if(inferSiblings&&!nextUrls.length&&added>=5&&this.catalogPageDescriptor(url)?.current>1){
                    nextUrls=this.inferCatalogSiblingPages(url,4);
                }
                for(const nextUrl of nextUrls){if(visited.has(nextUrl)||queued.has(nextUrl))continue;if(visited.size+queue.length>=maxPages){if(required.has(nextUrl))truncated=true;continue;}queued.add(nextUrl);queue.push(nextUrl);}
            }
            this.perfMark(perf,'merge-discover',{chapters:all.length,queued:queue.length});
            if(!queue.length)break;
        }
        if(all.length && (failed.size || truncated || queue.some(x=>required.has(x)))) throw this.catalogIncomplete('paginação anunciada não terminou');
        const stats=this.chapterSequenceStats(all);
        this.perfFinish(perf,failed.size?'error':stats.gaps?'partial':'ok',{pages:visited.size,chapters:all.length,min:stats.min,max:stats.max,gaps:stats.gaps});
        return {items:all,...(selector?{chapterSelector:selector}:{})};
    }
    findNextCatalogPage($, base, visited) {
        const direct = $('a[rel="next"]').first().attr('href');
        const resolvedDirect = this.resolveAgainst(direct, base);
        if (resolvedDirect && !visited.has(resolvedDirect))
            return resolvedDirect;
        let found;
        $('a[href]').each((_i, el) => {
            if (found)
                return;
            const a = $(el);
            const text = this.norm(a.text());
            const cls = this.norm(`${a.attr('class') || ''} ${a.attr('aria-label') || ''}`);
            if (!/(下一页|下页|next\s*page|next|›|»|下一頁)/i.test(`${text} ${cls}`))
                return;
            const href = this.resolveAgainst(a.attr('href'), base);
            if (href && !visited.has(href))
                found = href;
        });
        return found;
    }
    sortChapters(input) {
        const map = new Map();
        for (const item of input) {
            const key = this.canonicalChapterIdentity(item.path);
            const previous = map.get(key);
            if (!previous || item.name.length > previous.name.length)
                map.set(key, item);
        }
        const items = Array.from(map.values()).sort((a, b) => a.order - b.order);
        if (items.length < 2)
            return items;
        // Textual chapter numbers are strong evidence and are safe to sort numerically.
        const explicit = items.filter(x => x.numberSource === 'text' && Number.isFinite(x.number));
        const explicitCoverage = explicit.length / items.length;
        const volumeCoverage = items.filter(x => Number.isFinite(x.volume)).length / items.length;
        if (explicitCoverage >= 0.35) {
            if (volumeCoverage >= 0.25) {
                return items.sort((a, b) => {
                    const av = Number.isFinite(a.volume) ? a.volume : Number.MAX_SAFE_INTEGER;
                    const bv = Number.isFinite(b.volume) ? b.volume : Number.MAX_SAFE_INTEGER;
                    if (av !== bv) return av - bv;
                    // Product/volume pages often split one chapter into several
                    // "Parte N" links and include prologues without a number. Their
                    // DOM sequence is authoritative inside a numeric volume.
                    if (Number.isFinite(a.volumeOrder) && Number.isFinite(b.volumeOrder) && a.volumeOrder !== b.volumeOrder)
                        return a.volumeOrder - b.volumeOrder;
                    const an = a.numberSource === 'text' && Number.isFinite(a.number) ? a.number : Number.MAX_SAFE_INTEGER;
                    const bn = b.numberSource === 'text' && Number.isFinite(b.number) ? b.number : Number.MAX_SAFE_INTEGER;
                    if (an !== bn) return an - bn;
                    const ap = Number.isFinite(a.part) ? a.part : 0;
                    const bp = Number.isFinite(b.part) ? b.part : 0;
                    if (ap !== bp) return ap - bp;
                    return a.order - b.order;
                });
            }
            const distinctNumbers = new Set(explicit.map(x => x.number)).size;
            const repeated = explicit.length - distinctNumbers;
            // Repeated chapter numbers without volume context usually mean grouped
            // parts/volumes. Numeric sorting would produce 1,1,1,2,2,2 and destroy
            // the site's reading order. Preserve DOM order until a volume can be learned.
            if (repeated > 0) return items;
            return items.sort((a, b) => {
                const an = a.numberSource === 'text' && Number.isFinite(a.number) ? a.number : Number.MAX_SAFE_INTEGER;
                const bn = b.numberSource === 'text' && Number.isFinite(b.number) ? b.number : Number.MAX_SAFE_INTEGER;
                if (an !== bn) return an - bn;
                const ap = Number.isFinite(a.part) ? a.part : 0;
                const bp = Number.isFinite(b.part) ? b.part : 0;
                if (ap !== bp) return ap - bp;
                return a.order - b.order;
            });
        }
        // URL numbers are weak evidence (they may be database IDs). Only use them to
        // determine whether the DOM list itself is descending, never as an arbitrary sort key.
        const urlNumbered = items.filter(x => x.numberSource === 'url' && Number.isFinite(x.number));
        if (urlNumbered.length >= Math.max(5, Math.floor(items.length * 0.6))) {
            let asc = 0;
            let desc = 0;
            let prev;
            for (const item of items) {
                if (item.numberSource !== 'url' || !Number.isFinite(item.number))
                    continue;
                const n = item.number;
                if (prev !== undefined) {
                    if (n > prev)
                        asc++;
                    else if (n < prev)
                        desc++;
                }
                prev = n;
            }
            if (desc >= Math.max(3, asc * 2))
                return [...items].reverse();
        }
        // With no reliable numbering, preserve the site's catalog order.
        return items;
    }
    extractChapterNumber(text, href) {
        const volumeMatch = text.match(/第\s*([0-9零〇一二两三四五六七八九十百千万]+)\s*卷/i)
            || text.match(/(?:volume|vol\.?|tomo|tom|часть)\s*([0-9]+)/i);
        const chapterMatch = text.match(/第\s*([0-9零〇一二两三四五六七八九十百千万]+)\s*[章节回話话]/i)
            || text.match(/(?:chapter|chap(?:ter)?\.?|cap[ií]tulo|epis[oó]dio|chapitre|kapitel|rozdzia[lł]|глава|розділ|bölüm|chương|บทที่|ตอนที่)\s*[:#.-]?\s*([0-9]+)/i)
            || text.match(/^\s*0*([0-9]{1,6})\s*(?:[).\]．。:：、_-]|\s+)/);
        let number = chapterMatch ? this.parseNumberish(chapterMatch[1]) : undefined;
        let numberSource = Number.isFinite(number) ? 'text' : undefined;
        const volume = volumeMatch ? this.parseNumberish(volumeMatch[1]) : undefined;
        if (!Number.isFinite(number)) {
            try {
                const u = new URL(href);
                const queryCandidates = ['chapter', 'chapterId', 'chapter_id', 'cid', 'ch', 'episode', 'ep'];
                for (const key of queryCandidates) {
                    const raw = u.searchParams.get(key);
                    if (raw && /^\d+$/.test(raw)) {
                        number = parseInt(raw, 10);
                        numberSource = 'url';
                        break;
                    }
                }
                if (!Number.isFinite(number)) {
                    const path = u.pathname;
                    const semantic = path.match(/(?:chapter|chap|read|episode|ep)[\/_-]?(\d+)(?:\D|$)/i);
                    if (semantic) {
                        number = parseInt(semantic[1], 10);
                        numberSource = 'url';
                    }
                }
            }
            catch (_) { }
        }
        return {
            ...(Number.isFinite(number) ? { number, numberSource } : {}),
            ...(Number.isFinite(volume) ? { volume } : {}),
        };
    }
    parseNumberish(raw) {
        if (/^\d+$/.test(raw))
            return parseInt(raw, 10);
        return this.chineseNumber(raw);
    }
    chineseNumber(raw) {
        const s = raw.replace(/〇/g, '零');
        const digit = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
        const unit = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
        if (!s)
            return undefined;
        if ([...s].every(ch => ch in digit)) {
            const joined = [...s].map(ch => String(digit[ch])).join('');
            return parseInt(joined, 10);
        }
        let total = 0;
        let section = 0;
        let num = 0;
        let recognized = false;
        for (const ch of s) {
            if (ch in digit) {
                num = digit[ch];
                recognized = true;
            }
            else if (ch in unit) {
                recognized = true;
                const u = unit[ch];
                if (u === 10000) {
                    section = (section + num) * u;
                    total += section;
                    section = 0;
                    num = 0;
                }
                else {
                    if (num === 0)
                        num = 1;
                    section += num * u;
                    num = 0;
                }
            }
        }
        if (!recognized)
            return undefined;
        return total + section + num;
    }
    discoverSearchTemplates($, base) {
        const templates = [];
        $('form').each((_i, el) => {
            const form = $(el);
            let key = '';
            form.find('input[name]').each((_j, input) => {
                if (key)
                    return;
                const name = String($(input).attr('name') || '');
                const type = String($(input).attr('type') || 'text');
                if (/^(q|s|search|keyword|keywords|key|kw|wd|query|searchkey|search_key|searchword)$/i.test(name) && !/hidden|submit|button/i.test(type))
                    key = name;
            });
            if (!key)
                return;
            const method = String(form.attr('method') || 'get').toLowerCase();
            if (method !== 'get')
                return;
            const action = this.resolveAgainst(form.attr('action') || base, base);
            if (!action)
                return;
            try {
                const u = new URL(action);
                form.find('input[type="hidden"][name]').each((_k, input) => {
                    const node = $(input);
                    const name = this.norm(node.attr('name'));
                    const value = this.norm(node.attr('value'));
                    if (name && value && name !== key) u.searchParams.set(name, value);
                });
                u.searchParams.set(key, '__TH_QUERY__');
                templates.push(u.href.replace('__TH_QUERY__', '{query}'));
            }
            catch (_) { }
        });
        return this.uniqueStrings(templates).slice(0, 6);
    }
    compactBrowseHtml(html) {
        const raw = String(html || '');
        const stripped = raw.replace(/<!--[^]*?-->/g, '').replace(/<script\b[^]*?<\/script\s*>/gi, '').replace(/<style\b[^]*?<\/style\s*>/gi, '');
        // Official LNReader plugins increasingly avoid feeding multi-megabyte pages
        // to Cheerio on Hermes. First isolate repeated card blocks when possible.
        const cards = this.sliceBrowseCards(stripped);
        if (cards && cards.length >= 1000 && cards.length < stripped.length * 0.92) return cards;
        if (stripped.length <= 650000) return stripped;
        const lower = stripped.toLowerCase();
        const markers = ['products','product-grid','novel-list','book-list','search-results','archive','catalog','catalogo','catálogo','lista-de-novela','lista de novelas','woocommerce','page-item-detail'];
        let best = '', bestScore = 0;
        for (const marker of markers) {
            let i = lower.indexOf(marker), tries = 0;
            while (i >= 0 && tries++ < 4) {
                const fragment = stripped.slice(Math.max(0, i - 25000), Math.min(stripped.length, i + 850000));
                const anchors = (fragment.match(/<a\b/gi) || []).length;
                const cardSignals = (fragment.match(/(?:product|novel|book|obra|producto|woocommerce|page-item-detail)/gi) || []).length;
                const score = anchors + cardSignals * 2;
                if (score > bestScore) { best = fragment; bestScore = score; }
                i = lower.indexOf(marker, i + marker.length);
            }
        }
        return best && bestScore >= 12 ? best : stripped.slice(0, 900000);
    }
    sliceBrowseCards(html) {
        const raw = String(html || '');
        const blocks = [];
        const addMatches = (rx) => {
            const found = raw.match(rx) || [];
            for (const block of found) {
                if (block.length >= 80 && block.length <= 160000) blocks.push(block);
                if (blocks.length >= 90) break;
            }
        };
        addMatches(/<li\b[^>]*class=["'][^"']*(?:\bproduct\b|product-item|page-item-detail|novel-item|book-item)[^"']*["'][^>]*>[^]*?<\/li\s*>/gi);
        if (blocks.length < 4) addMatches(/<article\b[^>]*>[^]*?<\/article\s*>/gi);
        if (blocks.length < 4) return raw;
        return `<main data-th-card-slice="1">${blocks.slice(0, 90).join('')}</main>`;
    }
    detectSiteArchitecture(html, url = '') {
        const raw = String(html || '');
        const head = (raw.slice(0, 550000) + raw.slice(-140000)).toLowerCase();
        let host = '';
        try { host = new URL(url).hostname.toLowerCase(); } catch (_) {}
        // Strong DOM/theme signatures first. The named families mirror the official
        // LNReader multisrc corpus; host hints are only a last strong signal for
        // families whose theme intentionally carries little identifying markup.
        if (/search_main_box|fic_title|wi_fic_desc/.test(head)) return {type:'fictionposts',paginationMode:'query-pg'};
        if (/class=["'][^"']*list2/.test(head) && /\/n\/[^/]+\//.test(head)) return {type:'static-novel',paginationMode:'auto'};
        if (/woocommerce|woocommerce-loop-product|product-type-|class=["'][^"']*products\b/.test(head)) return { type:'woocommerce', paginationMode:'wordpress-path' };
        if (/wp-manga|page-item-detail|c-tabs-item__content|manga-title-badges/.test(head)) return { type:'madara', paginationMode:'wordpress-path' };
        if (/\beplister\b|ts-post-image|\bbixbox\b|serieslist/.test(head)) return { type:'lightnovelwp', paginationMode:'query-page' };
        if (/wp-content\/themes\/fictioneer|\bfictioneer[-_]|data-fictioneer|chapter-group/.test(head)) return { type:'fictioneer', paginationMode:'wordpress-path' };
        if (/novelfire/.test(host + ' ' + head.slice(0,90000))) return { type:'novelfire', paginationMode:'auto' };
        if (/ranobes/.test(host + ' ' + head.slice(0,90000))) return { type:'ranobes', paginationMode:'auto' };
        if (/readnovelfull/.test(host + ' ' + head.slice(0,90000))) return { type:'readnovelfull', paginationMode:'auto' };
        if (/\breadwn\b/.test(host + ' ' + head.slice(0,90000))) return { type:'readwn', paginationMode:'auto' };
        if (/webnovelworld/.test(host + ' ' + head.slice(0,90000))) return { type:'webnovelworld', paginationMode:'auto' };
        if (/novelcool/.test(host + ' ' + head.slice(0,90000))) return { type:'novelcool', paginationMode:'auto' };
        if (/mtlnovel/.test(host + ' ' + head.slice(0,90000))) return { type:'mtlnovel', paginationMode:'auto' };
        if (/hotnovelpub/.test(host + ' ' + head.slice(0,90000))) return { type:'hotnovelpub', paginationMode:'auto' };
        if (/ifreedom/.test(host + ' ' + head.slice(0,90000))) return { type:'ifreedom', paginationMode:'auto' };
        if (/rulate/.test(host + ' ' + head.slice(0,90000))) return { type:'rulate', paginationMode:'auto' };
        if (this.isShuqiHost(host) || /书旗小说|shuqi-reader|shuqireader/.test(head.slice(0,180000))) return { type:'shuqi', paginationMode:'static' };
        if (this.isYuewenHost(host) || /bookcover\.yuewen|\byuewen\b|阅文|潇湘书院|红袖添香|言情小说吧/.test(head.slice(0,180000))) return { type:'yuewen', paginationMode:'query-page' };
        if (/\/wp-content\/|\/wp-includes\/|wp-json/.test(head) || /\/index\.php\//i.test(String(url || ''))) return { type:'wordpress', paginationMode:'wordpress-path' };
        return { type:'generic', paginationMode:'auto' };
    }
    detectBrowseAdapter(html, url = '') {
        return this.detectSiteArchitecture(html, url);
    }
    compactNovelHtml(html, url = '') {
        let raw = String(html || '');
        if (!raw) return raw;
        const isWooProduct = /\/producto?s?\//i.test(String(url || '')) || /woocommerce-product-gallery|woocommerce-Tabs-panel|single-product/.test(raw);
        // Generic sources may keep chapter metadata in embedded JSON, so their
        // scripts remain intact. On a strongly identified WooCommerce product the
        // useful data is DOM-based; only JSON-LD is preserved.
        raw = raw
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')
            .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, '')
            .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, '');
        if (isWooProduct) {
            raw = raw
                .replace(/<script\b(?![^>]*application\/ld\+json)[\s\S]*?<\/script\s*>/gi, '')
                .replace(/<section\b[^>]*class=["'][^"']*(?:related|up-sells)[^"']*["'][\s\S]*?<\/section\s*>/gi, '')
                .replace(/<div\b[^>]*id=["']reviews["'][\s\S]*?(?=<\/main|<footer|$)/gi, '');
        }
        return raw;
    }
    createBrowseBudget(ms = 10500, maxAttempts = 4) {
        return { id: ++this.browseBudgetSeq, deadline: Date.now() + Math.max(1200, Number(ms || 10500)), maxAttempts: Math.max(1, Number(maxAttempts || 4)), attempts: 0, urls: new Set() };
    }
    browseBudgetExpired(budget) { return !budget || Date.now() >= budget.deadline || budget.attempts >= budget.maxAttempts; }
    claimBrowseAttempt(budget, url) {
        if (this.browseBudgetExpired(budget)) return false;
        const key = String(url || '');
        if (!key || budget.urls.has(key)) return false;
        budget.urls.add(key); budget.attempts += 1; return true;
    }
    fastListingLinksFromHtml(html, base) {
        const scored = [];
        const seen = new Set();
        const raw = String(html || '').replace(/<script\b[^]*?<\/script\s*>/gi, '').replace(/<style\b[^]*?<\/style\s*>/gi, '');
        const rx = /<a\b([^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*)>([^]*?)<\/a\s*>/gi;
        let m, n = 0;
        while ((m = rx.exec(raw)) && n++ < 1800) {
            const href = this.resolveAgainst(m[2], base);
            if (!href || seen.has(href)) continue;
            try { if (!this.sameSiteHost(new URL(href).hostname, new URL(base).hostname)) continue; } catch (_) { continue; }
            const text = this.norm(String(m[3] || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&'));
            let score = 0;
            const signal = `${text} ${href}`;
            if (/(lista\s+de\s+(?:novelas|obras|libros)|todas?\s+las?\s+novelas|all\s+(?:novels|books)|library|catalog(?:o|ue)?|catálogo|书库|書庫|全部作品|全部小说|小說|小说)/i.test(signal)) score += 18;
            if (/(\/lista-de-(?:novela|novelas|obra|obras)|\/novels?\/|\/books?\/|\/library\/|\/catalog(?:o|ue)?\/|\/series\/)/i.test(href)) score += 10;
            if (/(login|register|suscri|account|author|forum|faq|preguntas)/i.test(signal)) score -= 12;
            if (score >= 10) { seen.add(href); scored.push({ url: href, score }); }
        }
        return scored.sort((a,b)=>b.score-a.score).map(x=>x.url).slice(0, 6);
    }
    detectWooAjaxSearchAdapter(html, base, adapterType = '') {
        if (String(adapterType || '') !== 'woocommerce') return null;
        const raw = String(html || '');
        // The7/Instant-search WooCommerce sites expose a WordPress AJAX action
        // named product_search. Require a strong action/widget signal; a generic
        // WooCommerce store must not pay for an endpoint it does not advertise.
        const strong = /(?:action["'\s:=]+product_search|["']product_search["']|product-query|product-search|\bixwps\b)/i.test(raw);
        const the7 = /dt-css-grid|the7|wf-cell/i.test(raw);
        if (!strong || !the7) return null;
        try {
            const u = new URL('/wp-admin/admin-ajax.php', base);
            // Request the same useful shape expected by this architecture while the
            // POST body carries the action/query. Unknown query flags are benign for
            // WordPress and only this strongly detected adapter uses them.
            const params = {
                tags:'1', sku:'', limit:'30', category_results:'', order:'DESC', category_limit:'5',
                order_by:'title', product_thumbnails:'1', title:'1', excerpt:'1', content:'',
                categories:'1', attributes:'1',
            };
            for (const [k,v] of Object.entries(params)) u.searchParams.set(k, v);
            return { type:'the7-product-search', url:u.href };
        } catch (_) { return null; }
    }
    parseWooAjaxNovelItems(data, profile) {
        if (!Array.isArray(data)) return [];
        const out = [];
        for (const row of data) {
            const path = this.resolveAgainst(row?.url || row?.link || row?.permalink, profile?.origin || this.site);
            const name = this.norm(row?.title || row?.name || '');
            if (!path || !name || this.isGenericNovelTitle(name) || !this.sameSiteUrl(path, profile)) continue;
            const cover = this.resolveAgainst(row?.thumbnail || row?.image || row?.cover, profile?.origin || this.site);
            out.push({ name, path, ...(cover && !this.isPlaceholderImageUrl(cover) ? {cover} : {}) });
        }
        return this.dedupeNovelItems(out).slice(0, 40);
    }
    async searchWooAjax(profile, query) {
        if (String(profile?.searchAdapter || '') !== 'the7-product-search' || !profile?.searchAjaxUrl) return [];
        const body = `action=product_search&product-search=1&product-query=${encodeURIComponent(String(query || ''))}`;
        try {
            const response = await this.withAbortTimeout((signal) => (0, fetch_1.fetchApi)(profile.searchAjaxUrl, {
                method:'POST',
                headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'},
                body,
                ...(signal ? {signal} : {}),
            }), 4300, 'busca AJAX WooCommerce');
            if (!response?.ok) return [];
            const data = await this.withTimeout(response.json(), 1800, 'JSON da busca WooCommerce');
            return this.parseWooAjaxNovelItems(data, profile);
        } catch (_) { return []; }
    }
    async fetchBrowsePage(profile, url, query, budget, timeoutMs = 6200) {
        if (!this.claimBrowseAttempt(budget, url)) return null;
        const perf = this.perfStart('browsePage', url);
        try {
            const html = await this.withAbortTimeout((signal) => this.getTextSingleStrategy(url, 'catalog', signal), Math.min(timeoutMs, Math.max(500, budget.deadline - Date.now())), 'página de obras');
            this.perfMark(perf, 'fetch', { bytes: String(html || '').length });
            // Critical freeze guard: if Promise.race already timed out upstream, a
            // late network response must die here instead of entering Cheerio.
            if (Date.now() >= budget.deadline) { this.perfFinish(perf, 'expired-before-dom'); return null; }
            const adapter = this.detectBrowseAdapter(html, url);
            this.perfMark(perf, 'detect-adapter', { adapter: adapter.type });
            const ajaxSearch = this.detectWooAjaxSearchAdapter(html, url, adapter.type);
            const fastLinks = this.fastListingLinksFromHtml(html, url);
            const compact = this.compactBrowseHtml(html);
            this.perfMark(perf, 'compact', { bytes: String(compact || '').length });
            if (Date.now() >= budget.deadline) { this.perfFinish(perf, 'expired-after-compact'); return null; }
            const $ = (0, cheerio_1.load)(compact);
            this.perfMark(perf, 'parse-dom');
            if (Date.now() >= budget.deadline) { this.perfFinish(perf, 'expired-after-dom'); return null; }
            const adapterItems = this.extractAdapterBrowseItems($, url, query || '', adapter.type);
            this.perfMark(perf, 'adapter-items', {items:adapterItems.length});
            const genericItems = adapterItems.length >= 2 ? [] : this.extractNovelCandidates($, url, query || '');
            const items = this.dedupeNovelItems(adapterItems.length >= 2 ? adapterItems : genericItems);
            this.perfMark(perf, 'novel-items', {items:items.length});
            const discovered = this.uniqueStrings([...fastLinks, ...this.discoverListingLinks($, url)]);
            this.perfMark(perf, 'listing-links', {discovered:discovered.length});
            let filters = [];
            if (compact.length < 420000 && Date.now() + 120 < budget.deadline) {
                try { filters = this.discoverFilters($, url); } catch (_) {}
            }
            this.perfMark(perf, 'filters', {items:filters.length});
            this.perfFinish(perf, 'ok', { items: items.length, discovered: discovered.length });
            return { url, adapter: adapter.type, paginationMode: adapter.paginationMode, items, discovered, filters, ...(ajaxSearch ? {ajaxSearch} : {}), hasPagination: this.hasExplicitSourcePagination($, url) };
        } catch (error) { this.perfFinish(perf, 'error', { error: String(error?.message || error || '').slice(0,160) });
            if (error?.protection?.challenge || [401,403,429].includes(error?.status)) throw error;
            budget.lastError = error; return null; }
    }
    learnBrowseRow(profile, row) {
        if (!profile || !row) return;
        const refinement = {
            host: profile.host,
            listingUrls: this.uniqueStrings([this.listingBaseUrl(row.url), ...(profile.listingUrls || []).map(x => this.listingBaseUrl(x)), ...(row.discovered || []).map(x => this.listingBaseUrl(x))]).slice(0, 16),
            filterDefinitions: this.mergeFilterDefinitions(profile.filterDefinitions || [], row.filters || []),
            browseAdapter: row.adapter || profile.browseAdapter || 'generic',
            paginationMode: row.paginationMode || profile.paginationMode || 'auto',
            ...(row.ajaxSearch?.type ? { searchAdapter: row.ajaxSearch.type, searchAjaxUrl: row.ajaxSearch.url } : {}),
        };
        // refineProfile is local-only in children; never hold the catalog Promise.
        Promise.resolve(this.refineProfile(refinement)).catch(() => {});
    }
    async discoverSiteNovels(profile, pageNo, selectedFilters, sourceContext = '') {
        profile = this.ensureProfile(profile, profile?.seedUrl || profile?.novelUrl || this.site, profile?.host);
        if (!profile) return [];
        const page = Math.max(1, Number(pageNo || 1));
        if (sourceContext && this.sourceStaticContexts.has(sourceContext) && page > 1) return [];
        // Some portals (notably Shuqi's recommendation homepage) expose a static
        // curated landing page rather than a numeric catalog. Never fabricate
        // ?page=2/?page=3 for an architecture that explicitly declared itself
        // static; that only refetches the same cards and causes partial duplicates.
        if ((String(profile.paginationMode || '') === 'static' || String(profile.browseAdapter || '') === 'shuqi') && page > 1) {
            if (sourceContext) { this.sourceStaticContexts.add(sourceContext); this.sourcePageEnd.set(sourceContext, 2); }
            return [];
        }
        const noFilters = !selectedFilters || Object.keys(selectedFilters).length === 0;
        const budget = this.createBrowseBudget(page === 1 ? 10800 : 8200, page === 1 ? 4 : 2);

        // 1) Hot path: once a real listing URL has been learned, opening a source is
        // one request + one compact parse, matching the architecture of official
        // LNReader multi-source templates.
        if (profile.host.replace(/^www\./,'') === 'scribblehub.com' && !(profile.listingUrls || []).length) {
            profile = {...profile,browseAdapter:'fictionposts',paginationMode:'query-pg',listingUrls:[profile.origin + '/series-finder/?sf=1&sort=ratings&order=desc']};
        }
        const learned = this.uniqueStrings(profile.listingUrls || []).slice(0, 3);
        for (const listing of learned.slice(0, page === 1 ? 2 : 1)) {
            const target = this.pageVariant(this.applyDetectedFiltersToUrl(listing, profile, selectedFilters), page, profile);
            const row = await this.fetchBrowsePage(profile, target, '', budget, 6000);
            if (row?.items?.length >= 4) {
                this.learnBrowseRow(profile, row);
                return row.items.filter(x => this.sameSiteUrl(x.path, profile)).slice(0, 42);
            }
        }

        // 2) Cold start: inspect exactly one canonical homepage. Prefer a discovered
        // nav/catalog link (e.g. WordPress/WooCommerce) instead of guessing 10 paths.
        let homeRow = null;
        if (page === 1 && noFilters && !this.browseBudgetExpired(budget)) {
            const origin = this.siteOrigins(profile)[0] || profile.origin;
            if (origin) {
                const homeUrl = origin.endsWith('/') ? origin : origin + '/';
                homeRow = await this.fetchBrowsePage(profile, homeUrl, '', budget, 5200);
                if (homeRow) {
                    const listingLinks = this.uniqueStrings(homeRow.discovered || []);
                    if (listingLinks.length && !this.browseBudgetExpired(budget)) {
                        const target = this.pageVariant(listingLinks[0], page, { ...profile, browseAdapter: homeRow.adapter, paginationMode: homeRow.paginationMode });
                        const listRow = await this.fetchBrowsePage(profile, target, '', budget, 6000);
                        if (listRow?.items?.length >= 4) {
                            this.learnBrowseRow(profile, listRow);
                            return listRow.items.filter(x => this.sameSiteUrl(x.path, profile)).slice(0, 42);
                        }
                    }
                    if (homeRow.items?.length >= 8) {
                        this.learnBrowseRow(profile, homeRow);
                        if (sourceContext && (homeRow.paginationMode === 'static' || (!homeRow.hasPagination && !(homeRow.discovered || []).length))) {
                            this.sourceStaticContexts.add(sourceContext); this.sourcePageEnd.set(sourceContext, 2);
                        }
                        return homeRow.items.filter(x => this.sameSiteUrl(x.path, profile)).slice(0, 42);
                    }
                }
            }
        }

        // 3) Conservative generic fallback. At most the remaining budget (normally
        // one or two attempts), sequentially. Never spawn a Promise.all wave of heavy
        // DOMs because one useful page is all LNReader needs for this call.
        const origins = this.siteOrigins(profile);
        const common = ['/series/','/novels/','/books/','/library/','/catalogo/','/catalog/','/novelas/','/lista-de-novelas/','/all/'];
        const fallbacks = [];
        for (const origin of origins.slice(0, 1)) for (const path of common) fallbacks.push(origin + path);
        for (const raw of fallbacks) {
            if (this.browseBudgetExpired(budget)) break;
            const target = this.pageVariant(this.applyDetectedFiltersToUrl(raw, profile, selectedFilters), page, profile);
            const row = await this.fetchBrowsePage(profile, target, '', budget, 4800);
            if (row?.items?.length >= 4) {
                this.learnBrowseRow(profile, row);
                return row.items.filter(x => this.sameSiteUrl(x.path, profile)).slice(0, 42);
            }
        }
        if (budget.lastError) throw budget.lastError;
        return [];
    }
    discoverListingLinks($, base) {
        const scored = [];
        const seen = new Set();
        $('a[href]').each((_i, el) => {
            const a = $(el);
            const href = this.resolveAgainst(a.attr('href'), base);
            if (!href || seen.has(href))
                return;
            let u;
            try { u = new URL(href); }
            catch (_) { return; }
            let bu;
            try { bu = new URL(base); }
            catch (_) { return; }
            if (!this.sameSiteHost(u.hostname, bu.hostname))
                return;
            if (/^\/(?:book|novel|series|story|n)\/[^/]+\/?$/i.test(u.pathname) || this.isCanonicalNovelDetailUrl(href) || /\/(?:bookshelf|login|register|zhuanti)(?:\/|$)/i.test(u.pathname)) return;
            const text = this.norm(a.text());
            const signal = `${text} ${u.pathname} ${a.attr('class') || ''} ${a.attr('id') || ''}`;
            let score = 0;
            if (/(书库|書庫|全部作品|全部小说|小說|小说|排行榜|排行|榜单|榜單|分类|分類|browse|discover|all\s*books|all\s*novels|novels|books|library|ranking|rank|lista\s+de\s+(?:novelas|obras|libros)|todas?\s+las?\s+novelas|novelas|cat[aá]logo|biblioteca|obras|romans?|livres?|liste\s+des?\s+romans?|lista\s+de\s+romances)/i.test(signal))
                score += 12;
            if (/^(?:玄幻|奇幻|都市|言情|穿越|青春|仙侠|仙俠|武侠|武俠|灵异|靈異|悬疑|懸疑|历史|歷史|军事|軍事|游戏|遊戲|竞技|競技|科幻|职场|職場|官场|官場|现言|現言|耽美|其它|其他|fantasy|romance|mystery|horror|historical|sci[- ]?fi|xianxia|wuxia|xuanhuan)$/i.test(text))
                score += 10;
            if (/(\/all(?:\/|$)|\/rank(?:ing)?(?:\/|$)|\/books?(?:\/|$)|\/novels?(?:\/|$)|\/novelas?(?:\/|$)|\/obras?(?:\/|$)|\/library(?:\/|$)|\/biblioteca(?:\/|$)|\/category(?:\/|$)|\/categor(?:y|ia)(?:\/|$)|\/catalog(?:o|ue)?(?:\/|$)|\/lista(?:[-_/]|$)|lista-de-(?:novela|novelas|obra|obras)|\/list(?:\/|$)|\/c\/[^/]+(?:_\d+)?\.html$)/i.test(u.pathname))
                score += 8;
            if (/(login|register|author|writer|forum|comment|download|app|help)/i.test(signal))
                score -= 12;
            if (score >= 8) {
                seen.add(href);
                scored.push({ url: href, score });
            }
        });
        return scored.sort((a, b) => b.score - a.score).map(x => x.url).slice(0, 12);
    }
    siteOrigins(profile) {
        const out = [];
        const add = (value) => { if (value && !out.includes(value.replace(/\/$/, ''))) out.push(value.replace(/\/$/, '')); };
        add(profile.origin);
        try {
            const host = String(profile.host || new URL(profile.origin).hostname);
            const root = this.registrableDomain(host);
            if (root && root !== host) {
                add(`https://${root}`);
                add(`https://www.${root}`);
            }
        }
        catch (_) { }
        return out;
    }
    registrableDomain(host) {
        const parts = String(host || '').toLowerCase().split('.').filter(Boolean);
        if (parts.length <= 2)
            return parts.join('.');
        const suffix2 = parts.slice(-2).join('.');
        const twoLevel = new Set(['co.uk','org.uk','com.br','com.cn','com.tw','com.hk','com.au','com.sg','co.jp','co.kr','com.tr','com.ua','co.id','com.vn','co.th','com.mx','com.ar','com.co','com.pe','com.my','co.nz']);
        return twoLevel.has(suffix2) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
    }
    sameSiteHost(a, b) {
        const ah = String(a || '').toLowerCase().replace(/^www\./, '');
        const bh = String(b || '').toLowerCase().replace(/^www\./, '');
        return ah === bh || this.registrableDomain(ah) === this.registrableDomain(bh);
    }
    sameSiteUrl(url, profile) {
        try { return this.sameSiteHost(new URL(url).hostname, profile.host); }
        catch (_) { return false; }
    }
    listingBaseUrl(rawUrl) {
        try {
            const u = new URL(rawUrl);
            u.hash = '';
            u.pathname = u.pathname.replace(/\/page\/\d+\/?$/i, '/');
            for (const key of ['page', 'p', 'pageNo', 'pageNum', 'pg']) u.searchParams.delete(key);
            for (const key of Array.from(u.searchParams.keys())) {
                if (/^(?:utm_(?:source|medium|campaign|term|content|id)|fbclid|gclid|yclid|mc_cid|mc_eid)$/i.test(key)) u.searchParams.delete(key);
            }
            return u.href;
        } catch (_) { return rawUrl; }
    }
    pageVariant(rawUrl, pageNo, profile = null) {
        const baseUrl = this.listingBaseUrl(rawUrl);
        if (profile?.paginationMode === 'query-pg') {const u=new URL(baseUrl);u.searchParams.set('pg',String(pageNo));return u.href;}
        if (pageNo <= 1) return baseUrl;
        try {
            const u = new URL(baseUrl);
            if (/\/(?:c|category|class|channel)\/[^/]+(?:_\d+)?\.html$/i.test(u.pathname)) {
                u.pathname = u.pathname.replace(/(?:_\d+)?\.html$/i, `_${pageNo}.html`);
                return u.href;
            }
            if (/\/page\/\d+\/?$/i.test(u.pathname)) {
                u.pathname = u.pathname.replace(/\/page\/\d+\/?$/i, `/page/${pageNo}/`);
                return u.href;
            }
            const pageKeys = ['page', 'p', 'pageNo', 'pageNum', 'pg'];
            const existing = pageKeys.find(k => u.searchParams.has(k));
            if (existing) { u.searchParams.set(existing, String(pageNo)); return u.href; }
            const mode = String(profile?.paginationMode || '');
            const adapter = String(profile?.browseAdapter || '');
            // LNReader's LightNovelWP multisource uses /series/?page=N, while
            // WooCommerce/WordPress archive pages normally use /page/N/. Keep
            // the family distinction instead of treating every WP-derived site alike.
            if (mode === 'query-page' || adapter === 'lightnovelwp') {
                u.searchParams.set('page', String(pageNo));
                return u.href;
            }
            const wpLike = mode === 'wordpress-path' || /^(?:wordpress|woocommerce|madara)$/.test(adapter)
                || /\/(?:index\.php\/)?(?:lista(?:-de-[^/]+)?|filtro|category|categoria|tag|etiqueta-producto|product-category)\/?$/i.test(u.pathname);
            if (wpLike) {
                u.pathname = u.pathname.replace(/\/+$/, '') + `/page/${pageNo}/`;
                return u.href;
            }
            u.searchParams.set('page', String(pageNo));
            return u.href;
        } catch (_) { return rawUrl; }
    }
    async searchProfile(profile, query, pageNo) {
        profile = this.ensureProfile(profile, profile?.seedUrl || profile?.novelUrl || this.site, profile?.host);
        if (!profile) return [];
        // Some WooCommerce/The7 sources publish their first search page as
        // WordPress admin-ajax JSON rather than HTML. This adapter is only learned
        // after the source itself advertises product_search/ixwps signals.
        if (Number(pageNo || 1) === 1 && profile.searchAdapter === 'the7-product-search') {
            const ajaxItems = await this.searchWooAjax(profile, query);
            if (ajaxItems.length) return ajaxItems;
        }
        const templates = this.uniqueStrings([
            ...(profile.browseAdapter === 'fictionposts' || profile.host.replace(/^www\./,'') === 'scribblehub.com' ? [profile.origin + '/?s={query}&post_type=fictionposts'] : []),
            ...(profile.searchTemplates || []),
            `${profile.origin}/?s={query}`,
            `${profile.origin}/search?q={query}`,
            `${profile.origin}/search?keyword={query}`,
            `${profile.origin}/search/{query}`,
            `${profile.origin}/soushu/{query}.html`,
        ]);
        const budget = this.createBrowseBudget(7600, 4);
        for (const template of templates.slice(0, 4)) {
            if (this.browseBudgetExpired(budget)) break;
            const url = this.expandSearchTemplate(template, query, pageNo);
            if (!this.claimBrowseAttempt(budget, url)) continue;
            try {
                const html = await this.withAbortTimeout((signal) => this.getTextSingleStrategy(url, 'search', signal), Math.min(5200, Math.max(500, budget.deadline - Date.now())), 'busca da fonte');
                if (Date.now() >= budget.deadline) break;
                const compact = this.compactBrowseHtml(html);
                if (Date.now() >= budget.deadline) break;
                const $ = (0, cheerio_1.load)(compact);
                const learnedTemplates = this.discoverSearchTemplates($, url);
                if (learnedTemplates.length) Promise.resolve(this.refineProfile({ host: profile.host, searchTemplates: this.uniqueStrings([...(profile.searchTemplates || []), ...learnedTemplates]) })).catch(() => {});
                // Search pages use the same architecture cards as browse pages on
                // many official sources (WooCommerce/The7, Madara, LightNovelWP).
                // Prefer the family adapter so covers/lazy attributes are preserved;
                // generic anchor scoring remains the fallback for unknown themes.
                const detected = this.detectBrowseAdapter(compact, url);
                const adapterType = String(profile?.browseAdapter || detected?.type || 'generic');
                const adapterResults = this.extractAdapterBrowseItems($, url, query, adapterType);
                const results = (adapterResults.length ? adapterResults : this.extractNovelCandidates($, url, query)).filter(x => this.sameSiteUrl(x.path, profile));
                if (results.length) return this.dedupeNovelItems(results).slice(0, 40);
            } catch (error) { if (error?.protection?.challenge || [401,403,429].includes(error?.status)) throw error; budget.lastError=error; }
        }
        if (budget.lastError) throw budget.lastError;
        return [];
    }
    expandSearchTemplate(template, query, pageNo) {
        let url = template.replace(/\{query\}/g, encodeURIComponent(query));
        if (pageNo > 1) {
            try {
                const u = new URL(url);
                const pageKeys = ['page', 'p', 'pageNo', 'pageNum', 'pg'];
                const existing = pageKeys.find(k => u.searchParams.has(k));
                if (existing)
                    u.searchParams.set(existing, String(pageNo));
                else
                    u.searchParams.set('page', String(pageNo));
                url = u.href;
            }
            catch (_) { }
        }
        return url;
    }
    candidateNovelTitle(a, container, $) {
        const raw = [];
        const add = (value, score) => {
            const rawValue = this.norm(value);
            if (/\d+(?:\.\d+)?\s*(?:万|萬)?\s*本\s*$/i.test(rawValue) || /\b\d+\s*(?:copies?|books?|novels?)\s*$/i.test(rawValue))
                return;
            const title = this.cleanNovelTitleText(rawValue, $);
            if (!title || title.length < 2 || title.length > 150 || this.isGenericNovelTitle(title))
                return;
            raw.push({ title, score });
        };
        add(a.attr('title'), 12);
        try {
            a.find('h1,h2,h3,h4,[class*="title"],[class*="name"]').slice(0, 6).each((_i, el) => add($(el).text(), 11));
            container.find('h1,h2,h3,h4,[class*="book-title"],[class*="book-name"],[class*="novel-title"]').slice(0, 8).each((_i, el) => add($(el).text(), 10));
        } catch (_) { }
        try {
            const direct = this.norm(a.clone().children().remove().end().text());
            add(direct, 9);
        } catch (_) { }
        add(a.text(), 6);
        try {
            const img = container.find('img').first();
            add(img.attr('alt') || img.attr('title'), 5);
        } catch (_) { }
        raw.sort((x, y) => y.score - x.score || x.title.length - y.title.length);
        return raw[0]?.title || '';
    }
    extractAdapterBrowseItems($, base, query, adapterType) {
        const out = [];
        const seen = new Set();
        const q = String(query || '').trim().toLowerCase();
        const pushCard = (container, linkNode, imageNode) => {
            if (!linkNode || !linkNode.length) return;
            const href = this.resolveAgainst(linkNode.attr('href'), base);
            if (!href) return;
            try { if (!this.sameSiteHost(new URL(href).hostname, new URL(base).hostname)) return; } catch (_) { return; }
            const key = this.novelIdentity(href);
            if (!key || seen.has(key)) return;
            const name = this.norm(linkNode.text() || container.find('h1,h2,h3,h4,h5').first().text() || imageNode?.attr?.('alt'));
            if (!name || this.isGenericNovelTitle(name) || (q && !name.toLowerCase().includes(q))) return;
            const cover = imageNode?.length ? this.extractImageUrl(imageNode, base) : undefined;
            seen.add(key);
            out.push({ name, path: href, ...(cover ? { cover } : {}) });
        };
        try {
            if (adapterType === 'fictionposts' || adapterType === 'static-novel') {
                $(adapterType === 'fictionposts' ? '.search_main_box' : 'div.list2').each((_i, el) => {
                    const c=$(el);pushCard(c,c.find(adapterType === 'fictionposts' ? '.search_title > a' : 'h3 > a').first(),c.find('img').first());
                });
            } else if (adapterType === 'woocommerce') {
                // The first selector covers the dt-css-grid/WPBakery WooCommerce
                // archive used by the official NOVA source; the rest cover stock
                // WooCommerce themes. All are architecture selectors, not domains.
                const cards = $('.dt-css-grid div.wf-cell,ul.products li.product,.products .product,.woocommerce-loop-product,.type-product');
                cards.each((_i, el) => {
                    const c = $(el);
                    let a = c.find('h4.entry-title a').first();
                    if (!a.length) a = c.find('a.woocommerce-LoopProduct-link,a.woocommerce-loop-product__link,a[href*="/producto/"],a[href*="/product/"]').first();
                    if (!a.length) {
                        const h = c.find('h2.woocommerce-loop-product__title,h3.woocommerce-loop-product__title').first();
                        a = h.closest('a');
                    }
                    pushCard(c, a, c.find('img').first());
                });
            } else if (adapterType === 'madara') {
                $('.page-item-detail,.c-tabs-item__content .row,.row.c-tabs-item__content').each((_i, el) => {
                    const c=$(el); pushCard(c, c.find('.item-summary .post-title a,.post-title a').first(), c.find('.item-thumb img,img').first());
                });
            } else if (adapterType === 'lightnovelwp') {
                $('article,.utao,.listupd .bs,.serieslist li').each((_i, el) => {
                    const c=$(el); let a=c.find('h2 a,h3 a,.tt a,a[title]').first();
                    pushCard(c, a, c.find('.ts-post-image,img').first());
                });
            } else if (adapterType === 'fictioneer') {
                $('article,[class*="story-card"],[class*="fictioneer"] article').each((_i, el) => {
                    const c=$(el); pushCard(c, c.find('h2 a,h3 a,.entry-title a').first(), c.find('img').first());
                });
            } else if (adapterType === 'shuqi') {
                const byPath = new Map();
                $('a[href]').each((_i, el) => {
                    const a = $(el);
                    const href = this.resolveAgainst(a.attr('href'), base);
                    if (!href) return;
                    let u; try { u = new URL(href); } catch (_) { return; }
                    if (!this.isShuqiHost(u.hostname) || !/\/book\/\d+(?:\.html)?\/?$/i.test(u.pathname)) return;
                    const key = this.novelIdentity(href);
                    const prev = byPath.get(key) || { path:href, name:'', cover:'' };
                    let title = this.cleanNovelTitleText(a.attr('title') || a.text(), $);
                    if (!title || this.isGenericNovelTitle(title)) {
                        try { title = this.cleanNovelTitleText(a.find('[title],h1,h2,h3,h4,h5').first().attr('title') || a.find('h1,h2,h3,h4,h5').first().text(), $); } catch (_) {}
                    }
                    let cover = '';
                    try {
                        const img = a.find('img,picture img').first();
                        if (img?.length) cover = this.extractImageUrl(img, base) || '';
                    } catch (_) {}
                    if (title && !this.isGenericNovelTitle(title) && (!prev.name || title.length < prev.name.length + 80)) prev.name = title;
                    if (cover && !this.isPlaceholderImageUrl(cover)) prev.cover = cover;
                    byPath.set(key, prev);
                });
                for (const item of byPath.values()) {
                    if (!item.name || (q && !item.name.toLowerCase().includes(q))) continue;
                    out.push({name:item.name,path:item.path,...(item.cover?{cover:item.cover}:{})});
                }
            } else if (adapterType === 'yuewen') {
                // Numeric Yuewen work routes let us skip the O(N) generic anchor
                // scoring pass. Scope each anchor to its visual card so covers never
                // bleed from the first book into every result.
                $('a[href*="/book/"]').each((_i, el) => {
                    const a = $(el);
                    const href = this.resolveAgainst(a.attr('href'), base);
                    if (!href) return;
                    let u; try { u = new URL(href); } catch (_) { return; }
                    if (!/\/book\/\d+(?:\.html)?\/?$/i.test(u.pathname)) return;
                    const c = this.scopedNovelCard(a);
                    let titleLink = a;
                    const heading = c.find('h1 a[href*="/book/"],h2 a[href*="/book/"],h3 a[href*="/book/"],h4 a[href*="/book/"],[class*="title"] a[href*="/book/"]').first();
                    if (heading?.length) titleLink = heading;
                    pushCard(c, titleLink, c.find('img,picture img').first());
                });
            }
        } catch (_) {}
        return this.sanitizeNovelItemCovers(out);
    }
    scopedNovelCard(a, cache = new Map()) {
        // Bound descendant work before using Cheerio queries. Never scan a whole
        // page per anchor: a Promise timeout cannot interrupt synchronous DOM work.
        let node = a;
        for (let depth = 0; depth < 6; depth++) {
            node = node.parent();
            if (!node?.length || /^(?:html|body|main|nav|footer|header)$/.test(node[0]?.name || '')) break;
            const raw = node[0];
            let small = cache.get(raw);
            if (small === undefined) {
                const stack = [raw]; let visited = 0, images = 0, links = 0, chars = 0;
                while (stack.length && visited < 120) {
                    const child = stack.pop(); visited++;
                    if (child.name === 'img') images++;
                    if (child.name === 'a') links++;
                    if (child.type === 'text') chars += (child.data || '').length;
                    if (child.children?.length > 120 - visited) {stack.push(child);break;}
                    if (child.children) stack.push(...child.children);
                }
                small = !stack.length && images > 0 && links <= 18 && chars <= 1800;
                cache.set(raw, small);
            }
            if (small) return node;
        }
        return a;
    }
    deriveArchitectureCover(path, currentCover) {
        let u; try { u = new URL(String(path || '')); } catch (_) { return currentCover; }
        const host = u.hostname.toLowerCase();
        const qidian = u.pathname.match(/\/book\/(\d+)(?:\.html)?\/?$/i);
        if (qidian && this.isYuewenHost(host)) {
            // Yuewen properties expose stable public book-cover URLs by work id.
            // This repairs lazy SSR cards whose DOM reuses one stale placeholder.
            return `https://bookcover.yuewen.com/qdbimg/349573/${qidian[1]}/180`;
        }
        return currentCover;
    }
    sanitizeNovelItemCovers(items) {
        const list = (items || []).map(x => ({...x}));
        const counts = new Map();
        for (const item of list) if (item.cover) counts.set(item.cover, (counts.get(item.cover) || 0) + 1);
        for (const item of list) {
            const count = item.cover ? (counts.get(item.cover) || 0) : 0;
            const suspicious = count >= 3 && count >= Math.ceil(list.length * 0.35);
            if (suspicious || !item.cover) {
                const derived = this.deriveArchitectureCover(item.path, undefined);
                if (derived) item.cover = derived;
                else if (suspicious) delete item.cover;
            }
        }
        return list;
    }
    extractNovelCandidates($, base, query) {
        const byHref = new Map();
        const q = String(query || '').toLowerCase();
        const cardCache = new Map();
        $('a[href]').each((_i, el) => {
            const a = $(el);
            const href = this.resolveAgainst(a.attr('href'), base);
            if (!href)
                return;
            let parsed;
            try { parsed = new URL(href); } catch (_) { return; }
            let baseParsed;
            try { baseParsed = new URL(base); } catch (_) { return; }
            if (!this.sameSiteHost(parsed.hostname, baseParsed.hostname))
                return;
            const path = parsed.pathname + parsed.search;
            const lowerPath = path.toLowerCase();
            // Xs8 and many Chinese portals expose FAQ/category/ranking cards next to
            // books. Those cards often have covers and numbers (e.g. “1000本”), so
            // they must be rejected before generic visual scoring.
            if (/\/(?:ask|question|faq)(?:\/|$)/i.test(parsed.pathname))
                return;
            if (/\/(?:category|class|channel|rank(?:ing)?|sort|tag|list)(?:\/|$)/i.test(parsed.pathname) && !/\/(?:book|novel|detail)/i.test(parsed.pathname))
                return;
            const container = this.scopedNovelCard(a, cardCache);
            const text = this.candidateNovelTitle(a, container, $);
            if (!text)
                return;
            if (this.isGenericNovelTitle(text))
                return;
            if (/(?:\d+(?:\.\d+)?\s*(?:万|萬)?\s*本|\d+\s*(?:copies?|books?|novels?))\s*$/i.test(text))
                return;
            if (/(chapter|read|reader|episode|\/\d+\/\d+)/i.test(lowerPath) && this.chapterLinkScore(text, href, a) >= 4)
                return;
            let score = 0;
            if (/\/bookquery\//i.test(parsed.pathname)) score += 14; // Xs8 book result/detail route.
            if (/(\/book(?:\/|$)|\/novel(?:\/|$)|\/detail(?:\/|$)|\/info(?:\/|$)|\/products?(?:\/|$)|\/productos?(?:\/|$)|\/series(?:\/|$)|\/story(?:\/|$)|bookid=|novelid=|storyid=)/i.test(lowerPath))
                score += 10;
            // Compact Chinese novel portals frequently use /n/<slug>/ as the
            // canonical work route (quanben.io is a representative example).
            if (/\/n\/[^/?#]+\/?(?:$|\?)/i.test(lowerPath))
                score += 10;
            const parentSignal = this.norm([
                a.attr('class'), a.parent().attr('class'), container.attr('class'), container.attr('id'),
            ].filter(Boolean).join(' '));
            if (/(book|novel|result|item|search|recommend|work|story|product|producto|woocommerce|series|manga)/i.test(parentSignal))
                score += /(?:product|producto|woocommerce|page-item-detail)/i.test(parentSignal) ? 8 : 5;
            if (/(category|class|channel|rank|sort|tag|question|ask)/i.test(parentSignal))
                score -= 7;
            if (a.closest('h1,h2,h3,h4,h5').length)
                score += 3;
            if (a.closest('header,nav,footer').length)
                score -= 15;
            if (q && text.toLowerCase().includes(q))
                score += 6;
            const img = container.find('img').first();
            let cover = this.extractImageUrl(img, base);
            cover = this.deriveArchitectureCover(href, cover);
            if (cover)
                score += 3;
            const containerText = this.norm(container.text());
            if (/(作者|author)\s*[:：]/i.test(containerText))
                score += 5;
            if (/(内容简介|內容簡介|summary|synopsis)/i.test(containerText))
                score += 3;
            // A generic homepage card needs multiple independent “book” signals.
            if (score < 8)
                return;
            const current = byHref.get(href);
            const item = { name: text, path: href, ...(cover ? { cover } : {}) };
            if (!current || score > current.score || (score === current.score && text.length < current.item.name.length))
                byHref.set(href, { item, score });
        });
        return this.sanitizeNovelItemCovers(Array.from(byHref.values())
            .sort((a, b) => b.score - a.score)
            .map(x => x.item)
            .slice(0, 80));
    }
    dedupeNovelItems(items) {
        const positions = new Map();
        const out = [];
        for (const item of items) {
            const path = String(item?.path || '');
            if (!path) continue;
            const key = this.novelIdentity(path);
            const existingIndex = positions.get(key);
            if (existingIndex === undefined) {
                positions.set(key, out.length);
                out.push(item);
                continue;
            }
            const previous = out[existingIndex];
            const prevAmp = /\/amp\//i.test(String(previous?.path || ''));
            const nextAmp = /\/amp\//i.test(path);
            const better = (prevAmp && !nextAmp)
                || (!previous?.cover && !!item?.cover)
                || (String(item?.name || '').length > String(previous?.name || '').length && !this.isGenericNovelTitle(item?.name || ''));
            if (better) out[existingIndex] = item;
        }
        return this.sanitizeNovelItemCovers(out);
    }
    inferNovelUrl($, base) {
        const baseUrl = new URL(base);
        const compact = baseUrl.pathname.match(/^\/n\/([^/]+)\/(?:\d+\.html|list\.html)$/i);
        if (compact)
            return `${baseUrl.origin}/n/${compact[1]}/`;
        let best = { score: 0 };
        $('a[href]').each((_i, el) => {
            const a = $(el);
            const href = this.resolveAgainst(a.attr('href'), base);
            if (!href)
                return;
            let u;
            try {
                u = new URL(href);
            }
            catch (_) {
                return;
            }
            if (!this.sameSiteHost(u.hostname, baseUrl.hostname))
                return;
            const text = this.norm(a.text());
            const signal = `${text} ${u.pathname} ${u.search}`;
            let score = 0;
            if (/(作品详情|书籍详情|小说详情|返回书页|book\s*detail|novel\s*detail|book\s*home)/i.test(text))
                score += 15;
            if (/(\/book(?:\/|\?|$)|\/detail(?:\/|\?|$)|\/novel(?:\/|\?|$)|bookId=)/i.test(signal))
                score += 8;
            if (/(chapter|read|reader)/i.test(u.pathname))
                score -= 7;
            if (score > best.score)
                best = { url: href, score };
        });
        return best.score >= 7 ? best.url : undefined;
    }
    mergeProtection(oldValue, meta) {
        const old = oldValue && typeof oldValue === 'object' ? oldValue : {};
        const m = meta && typeof meta === 'object' ? meta : {};
        if (!old.cloudflare && !m.cloudflare)
            return Object.keys(old).length ? old : undefined;
        return {
            ...old,
            cloudflare: Boolean(old.cloudflare || m.cloudflare),
            challenge: m.challenge !== undefined ? Boolean(m.challenge) : Boolean(old.challenge),
            turnstile: Boolean(old.turnstile || m.turnstile),
            requiresCookie: Boolean(old.requiresCookie || m.requiresCookie || m.challenge),
            challengeType: m.turnstile ? 'turnstile' : (m.challenge ? 'managed' : old.challengeType),
            lastStatus: Number(m.status || old.lastStatus || 0) || undefined,
            detectedAt: Number(old.detectedAt || Date.now()),
            lastSeenAt: Date.now(),
        };
    }
    detectProtection(response, html, requestUrl) {
        const body = String(html || '');
        const lower = body.slice(0, 260000).toLowerCase();
        const getHeader = (name) => {
            try { return String(response?.headers?.get?.(name) || ''); }
            catch (_) { return ''; }
        };
        const server = getHeader('server').toLowerCase();
        const cfRay = getHeader('cf-ray');
        const cfCache = getHeader('cf-cache-status');
        const cfMitigated = getHeader('cf-mitigated').toLowerCase();
        const setCookie = getHeader('set-cookie').toLowerCase();
        const headerCloudflare = server.includes('cloudflare') || Boolean(cfRay) || Boolean(cfCache) || cfMitigated.includes('challenge');
        const weakCloudflare = /\/cdn-cgi\/(?:challenge-platform|scripts|images|trace)|cloudflare-static|challenges\.cloudflare\.com/i.test(lower);
        const turnstile = /cf-turnstile|turnstile(?:\.render|\/v0\/api\.js)|cf-chl-widget|challenge-platform\/h\/g\/turnstile|challenges\.cloudflare\.com\/turnstile/i.test(lower);
        const title = (lower.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
        const blockedTitle = /just a moment|attention required.*cloudflare|checking your browser|security verification/.test(title);
        const interstitial = /cf-browser-verification|id=["']challenge-form|enable javascript and cookies to continue|checking your browser before accessing/.test(lower);
        const denied = [403, 429, 503].includes(Number(response?.status));
        const challenge = cfMitigated.includes('challenge') || blockedTitle || interstitial ||
            (denied && (turnstile || /cf_chl_|challenge-platform|cf-challenge/.test(lower)));
        const cookieSignal = /(?:^|[;, ]|__)(?:cf_clearance|__cf_bm|cf_chl_[a-z0-9_]+)/i.test(setCookie) || challenge;
        return {
            url: requestUrl,
            finalUrl: String(response?.url || requestUrl || ''),
            status: Number(response?.status || 0),
            cloudflare: Boolean(headerCloudflare || weakCloudflare || challenge || turnstile),
            challenge: Boolean(challenge),
            turnstile: Boolean(turnstile),
            requiresCookie: Boolean(cookieSignal),
        };
    }
    chapterHref(a, base) {
        const rawCandidates = [
            a.attr?.('href'), a.attr?.('data-url'), a.attr?.('data-href'), a.attr?.('data-link'),
            a.attr?.('data-chapter-url'), a.attr?.('data-reader-url'), a.attr?.('data-read-url'), a.attr?.('data-target-url'),
        ];
        for (const raw of rawCandidates) {
            const value = String(raw || '').trim();
            if (!value || value === '#' || /^javascript:/i.test(value))
                continue;
            const resolved = this.resolveAgainst(value, base);
            if (resolved)
                return resolved;
        }
        const onclick = String(a.attr?.('onclick') || '');
        const match = onclick.match(/(?:location(?:\.href)?\s*=|window\.open\s*\()\s*['\"]([^'\"]+)['\"]/i)
            || onclick.match(/['\"](https?:\/\/[^'\"]+|\/[^'\"]*(?:chapter|read|reader|episode)[^'\"]*)['\"]/i);
        return match ? this.resolveAgainst(match[1], base) : undefined;
    }
    extractChapterPayload($, html, url, profile) {
        const rootInfo = this.findMainRoot($, profile?.selectors?.chapterContent);
        const direct = this.trimChapterBlocks(this.extractTextBlocks($, rootInfo.node), url);
        if (this.isReadableChapterBlocks(direct))
            return { blocks: direct, selector: rootInfo.selector, source: 'dom' };
        const embedded = this.trimChapterBlocks(this.extractEmbeddedChapterBlocks($, html), url);
        if (this.isReadableChapterBlocks(embedded))
            return { blocks: embedded, source: 'embedded' };
        const body = this.trimChapterBlocks(this.extractTextBlocks($, $('body').first()), url);
        if (this.isReadableChapterBlocks(body) && this.looksLikeChapterPage($, url))
            return { blocks: body, source: 'body' };
        return null;
    }
    isReadableChapterBlocks(blocks) {
        const cleaned = (blocks || []).map(v => this.norm(v)).filter(Boolean);
        const total = cleaned.reduce((n, v) => n + v.length, 0);
        if (!cleaned.length || total < 80)
            return false;
        const sample = cleaned.slice(0, 12).join(' ').toLowerCase();
        if (/just a moment|verify you are human|enable javascript and cookies|attention required.*cloudflare|checking your browser/i.test(sample))
            return false;
        if (cleaned.length === 1 && total < 160)
            return false;
        return true;
    }
    trimChapterBlocks(blocks, url) {
        let items = (blocks || []).map(v => this.norm(v)).filter(Boolean);
        if (!items.length)
            return [];
        const navNoise = /^(?:[«‹<]\s*)?(?:上一章|下一章|上一节|下一节|上一页|下一页|前一章|后一章|目录|目錄|章节目录|章節目錄|返回目录|返回目錄|返回书页|返回書頁|加入书架|加入書架|收藏|书签|書籤|投票|推荐票|推薦票|打赏|打賞|评论|評論|报错|報錯|分享|登录|登錄|注册|註冊|首页|首頁|书库|書庫|继续阅读|繼續閱讀|next\s*chapter|previous\s*chapter|prev(?:ious)?|next|contents?|table\s+of\s+contents|add\s+to\s+library|bookmark|comments?|share)(?:\s*[»›>])?$/i;
        const chromeNoise = /(?:本章未完|点击.*下一页|點擊.*下一頁|请收藏本站|請收藏本站|手机阅读|手機閱讀|下载.*app|下載.*app|最新网址|最新網址|备用网址|備用網址|请记住本站|請記住本站|章节报错|章節報錯|返回顶部|返回頂部|广告|廣告)/i;
        items = items.filter(text => {
            if (text.length <= 140 && (navNoise.test(text) || chromeNoise.test(text)))
                return false;
            if (/^(?:Copyright|All Rights Reserved|ICP备|ICP備|公网安备|公網安備)/i.test(text))
                return false;
            return true;
        });
        if (!items.length)
            return [];
        const headingRe = /^(?:正文\s*)?(?:第\s*[0-9０-９零〇一二两兩三四五六七八九十百千万萬亿億]+\s*[章回节節卷篇话話]|(?:chapter|chap\.?|cap[ií]tulo|chapitre|epis[oó]dio)\s*[0-9ivxlcdm]+\b|序章|序言|楔子|前言|引子|正文)/i;
        let start = -1;
        for (let i = 0; i < Math.min(items.length, 45); i++) {
            const text = items[i];
            if (text.length <= 180 && headingRe.test(text)) {
                const after = items.slice(i + 1).reduce((n, v) => n + v.length, 0);
                if (after >= 30) {
                    start = i;
                    break;
                }
            }
        }
        // Novel sites frequently prepend breadcrumb/title/author/read controls. Once a
        // real chapter heading is found, everything before it is presentation chrome.
        if (start > 0)
            items = items.slice(start);
        const out = [];
        for (let i = 0; i < items.length; i++) {
            const text = items[i];
            const enoughBody = out.reduce((n, v) => n + v.length, 0) > 30;
            const tailNav = text.length <= 180 && (navNoise.test(text) || chromeNoise.test(text) || /^(?:相关推荐|相關推薦|推荐阅读|推薦閱讀|猜你喜欢|猜你喜歡|本书推荐|本書推薦|作者有话说|作者有話說)/i.test(text));
            if (tailNav && enoughBody && i >= Math.floor(items.length * 0.45))
                break;
            if (out.length && out[out.length - 1] === text)
                continue;
            out.push(text);
        }
        // Avoid retaining an isolated website/title string before a content body when
        // no explicit 第N章 heading exists.
        if (out.length > 5 && out[0].length < 45 && !headingRe.test(out[0])) {
            const firstTwo = out.slice(1).reduce((n, v) => n + v.length, 0);
            if (firstTwo > 400 && /(?:小说|小說|阅读|閱讀|书城|書城|作者|首页|首頁|目录|目錄)/i.test(out[0]))
                out.shift();
        }
        return out.slice(0, 2500);
    }
    extractEmbeddedChapterBlocks($, html) {
        const candidates = [];
        const pushCandidate = (value, key = '', bonus = 0) => {
            if (typeof value !== 'string')
                return;
            const blocks = this.blocksFromPayload(value);
            if (!blocks.length)
                return;
            const total = blocks.reduce((n, v) => n + v.length, 0);
            if (total < 80)
                return;
            const keySignal = /(chapter.?content|content|body|text|paragraph|article|reader|html|txt|正文|内容|內容)/i.test(key) ? 1400 : 0;
            const navPenalty = /(summary|description|synopsis|intro|comment|menu|catalog|chapter.?list)/i.test(key) ? 900 : 0;
            candidates.push({ blocks, score: total + Math.min(blocks.length, 120) * 35 + keySignal + bonus - navPenalty });
        };
        const walk = (value, key = '', depth = 0) => {
            if (depth > 9 || value == null)
                return;
            if (typeof value === 'string') {
                if (value.length >= 80 && (/(chapter.?content|content|body|text|paragraph|article|reader|html|txt|正文|内容|內容)/i.test(key) || value.length >= 450))
                    pushCandidate(value, key);
                return;
            }
            if (Array.isArray(value)) {
                if (/(paragraph|content|body|text|lines|blocks)/i.test(key) && value.length && value.every(x => typeof x === 'string'))
                    pushCandidate(value.join('\n'), key, 600);
                for (let i = 0; i < Math.min(value.length, 500); i++)
                    walk(value[i], key, depth + 1);
                return;
            }
            if (typeof value === 'object') {
                for (const [k, v] of Object.entries(value))
                    walk(v, k, depth + 1);
            }
        };
        $('script').each((_i, el) => {
            const node = $(el);
            const raw = String(node.contents().text() || '').trim();
            if (!raw)
                return;
            const type = String(node.attr('type') || '').toLowerCase();
            const id = String(node.attr('id') || '').toLowerCase();
            if (/json/.test(type) || /__next_data__|__nuxt_data__|initial-state|initial_state|app-data|page-data/.test(id)) {
                try { walk(JSON.parse(raw), id || type, 0); }
                catch (_) { }
            }
            for (const marker of ['__INITIAL_STATE__', '__INITIAL_DATA__', '__APOLLO_STATE__', '__NUXT__', '__NEXT_DATA__', 'chapterData', 'readerData', 'pageData']) {
                const parsed = this.extractAssignedJson(raw, marker);
                if (parsed)
                    walk(parsed, marker, 0);
            }
            const parseRe = /JSON\.parse\(\s*("(?:\\.|[^"\\])*")\s*\)/g;
            let pm;
            let pc = 0;
            while ((pm = parseRe.exec(raw)) && pc++ < 12) {
                try {
                    const decoded = JSON.parse(pm[1]);
                    const object = JSON.parse(decoded);
                    walk(object, 'JSON.parse', 0);
                }
                catch (_) { }
            }
            const re = /[\"'](chapterContent|chapter_content|contentHtml|content_html|articleBody|body|content|paragraphs|text|txtContent|readerContent)[\"']\s*:\s*(\"(?:\\.|[^\"\\])*\")/gi;
            let m;
            let count = 0;
            while ((m = re.exec(raw)) && count++ < 40) {
                try { pushCandidate(JSON.parse(m[2]), m[1], 800); }
                catch (_) { }
            }
        });
        if (!candidates.length) {
            const re = /[\"'](chapterContent|chapter_content|contentHtml|content_html|articleBody|txtContent|readerContent)[\"']\s*:\s*(\"(?:\\.|[^\"\\])*\")/gi;
            let m;
            let count = 0;
            while ((m = re.exec(String(html || ''))) && count++ < 30) {
                try { pushCandidate(JSON.parse(m[2]), m[1], 900); }
                catch (_) { }
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        return candidates[0]?.blocks || [];
    }
    extractAssignedJson(raw, marker) {
        const text = String(raw || '');
        const idx = text.indexOf(marker);
        if (idx < 0)
            return null;
        let eq = text.indexOf('=', idx + marker.length);
        if (eq < 0)
            return null;
        let start = eq + 1;
        while (start < text.length && /\s/.test(text[start]))
            start++;
        const opener = text[start];
        if (opener !== '{' && opener !== '[')
            return null;
        const closer = opener === '{' ? '}' : ']';
        let depth = 0;
        let quote = '';
        let escaped = false;
        for (let i = start; i < Math.min(text.length, start + 2_000_000); i++) {
            const ch = text[i];
            if (quote) {
                if (escaped) { escaped = false; continue; }
                if (ch === '\\') { escaped = true; continue; }
                if (ch === quote) quote = '';
                continue;
            }
            if (ch === '"' || ch === "'") { quote = ch; continue; }
            if (ch === opener) depth++;
            if (ch === closer) {
                depth--;
                if (depth === 0) {
                    const chunk = text.slice(start, i + 1);
                    try { return JSON.parse(chunk); }
                    catch (_) { return null; }
                }
            }
        }
        return null;
    }
    blocksFromPayload(value) {
        let raw = String(value || '').trim();
        if (!raw)
            return [];
        raw = raw.replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>').replace(/\\n/g, '\n').replace(/\\r/g, '\n');
        if (/<(?:p|div|br|article|section)\b/i.test(raw)) {
            const $$ = (0, cheerio_1.load)(`<div id="__th_payload">${raw}</div>`);
            const blocks = this.extractTextBlocks($$, $$('#__th_payload'));
            if (blocks.length)
                return blocks;
        }
        raw = (0, cheerio_1.load)(`<div>${raw}</div>`).text();
        let blocks = raw.split(/\n+/).map(v => this.norm(v)).filter(Boolean);
        if (blocks.length < 2 && raw.length > 220) {
            const sentenceLike = raw.match(/[^。！？!?]{10,}[。！？!?]?/g) || [];
            if (sentenceLike.length >= 2)
                blocks = sentenceLike.map(v => this.norm(v)).filter(Boolean);
        }
        return blocks.slice(0, 2500);
    }
    discoverChapterContentUrls($, base) {
        const out = [];
        const add = (raw) => {
            const url = this.resolveAgainst(raw, base);
            if (!url || url === base || out.includes(url))
                return;
            try {
                if (!this.sameSiteHost(new URL(url).hostname, new URL(base).hostname))
                    return;
            }
            catch (_) { return; }
            out.push(url);
        };
        add($('link[rel="canonical"]').first().attr('href'));
        $('iframe[src],frame[src]').each((_i, el) => add($(el).attr('src')));
        $('a[href],a[data-url],a[data-href],[data-chapter-url],[data-reader-url]').each((_i, el) => {
            const a = $(el);
            const text = this.norm(`${a.text()} ${a.attr('class') || ''} ${a.attr('id') || ''}`);
            if (!/(继续阅读|開始閱讀|开始阅读|阅读|read|reader|chapter|正文|content|下一步|continue)/i.test(text))
                return;
            add(this.chapterHref(a, base));
        });
        return out.slice(0, 6);
    }
    looksLikeChapterPage($, url) {
        const path = new URL(url).pathname;
        if (/(chapter|read|reader|episode)/i.test(path))
            return true;
        const root = this.findMainRoot($);
        const blocks = this.extractTextBlocks($, root.node);
        return blocks.length >= 8 && this.extractChapterLinks($, url).length < 5;
    }
    findMainRoot($, preferred) {
        if (preferred) {
            try {
                const node = $(preferred).first();
                if (this.norm(node.text()).length > 120)
                    return { node, selector: preferred };
            }
            catch (_) { }
        }
        const selectors = [
            '#chaptercontent', '#chapter-content', '#chapterContent', '.chp_raw', '#contentbody', '#content', '#articlecontent', '#articleContent', '#readcontent', '#read-content', '#reader-content', '#J_BookRead',
            '.chapter-content', '.chapter_content', '.chapterContent', '.read-content', '.reader-content',
            '.article-content', '.content', '.contentbox', '.readArea', '.readarea', '.reader_box .content', '.reading-content', '.novel-content', '.text-content', '.page-content', '.muye-reader-content', '.reader-main', '.chapter-body',
            // WooCommerce + WPBakery/Visual Composer chapter body used by NOVA-like
            // sites. Keeping it as an architecture selector also avoids choosing the
            // surrounding product/menu DOM when a chapter page is large.
            '.wpb_text_column.wpb_content_element > .wpb_wrapper', '.wpb_text_column > .wpb_wrapper',
            '[class*="chapter-content"]', '[class*="read-content"]', '[class*="reader-content"]',
            '[itemprop="articleBody"]', 'article', 'main',
        ];
        let best = { node: $('body').first(), selector: undefined, score: 0 };
        for (const selector of selectors) {
            try {
                $(selector).each((_i, el) => {
                    const node = $(el);
                    const textLen = this.norm(node.text()).length;
                    const pCount = node.find('p').length;
                    const linkLen = this.norm(node.find('a').text()).length;
                    const score = textLen + pCount * 130 - linkLen * 1.4;
                    if (textLen > 150 && score > best.score)
                        best = { node, selector, score };
                });
            }
            catch (_) { }
        }
        $('div,section').each((_i, el) => {
            const node = $(el);
            const text = this.norm(node.text());
            if (text.length < 300)
                return;
            const pCount = node.find('p').length;
            const brCount = (node.html() || '').match(/<br\b/gi)?.length || 0;
            const linkLen = this.norm(node.find('a').text()).length;
            const signal = this.norm(`${node.attr('class') || ''} ${node.attr('id') || ''}`);
            let score = text.length + pCount * 120 + brCount * 35 - linkLen * 1.8;
            if (/(content|chapter|article|reader|read|正文|contentbox)/i.test(signal))
                score += 600;
            if (/(nav|menu|comment|recommend|list|catalog|footer|header|sidebar)/i.test(signal))
                score -= 700;
            if (score > best.score)
                best = { node, selector: this.selectorForElement(node), score };
        });
        return { node: best.node, ...(best.selector ? { selector: best.selector } : {}) };
    }
    selectorForElement(node) {
        const id = String(node.attr('id') || '').trim();
        if (id && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(id))
            return '#' + id;
        const classes = String(node.attr('class') || '').trim().split(/\s+/).filter((x) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(x));
        if (classes.length)
            return '.' + classes.slice(0, 2).join('.');
        return undefined;
    }
    extractTextBlocks($, root) {
        const clone = root.clone();
        clone.find('script,style,noscript,iframe,nav,form,button,svg,canvas,video,audio,aside,footer,header').remove();
        clone.find('[class*="ad"],[id*="ad"],.ads,.advertisement,.banner,.navigation,.nav,.footer,.header,[class*="breadcrumb"],[class*="chapter-nav"],[class*="page-nav"],[class*="toolbar"],[class*="recommend"],[class*="related"],[class*="comment"],[class*="share"],[class*="footer"],[class*="header"],[id*="footer"],[id*="header"]').remove();
        let blocks = [];
        clone.find('p,h2,h3,blockquote,li').each((_i, el) => {
            const text = this.norm($(el).text());
            if (text.length >= 1)
                blocks.push(text);
        });
        if (blocks.length < 3) {
            const html = clone.html() || '';
            const normalizedBreaks = html
                .replace(/<br\s*\/?\s*>/gi, '\n')
                .replace(/<\/p\s*>/gi, '\n')
                .replace(/<\/div\s*>/gi, '\n');
            const text = (0, cheerio_1.load)(`<div>${normalizedBreaks}</div>`).text();
            blocks = text.split(/\n+/).map((v) => this.norm(v)).filter((v) => v.length > 0);
        }
        const out = [];
        for (const text of blocks) {
            if (out.length && out[out.length - 1] === text)
                continue;
            if (/^(上一章|下一章|上一页|下一页|目录|返回目录|加入书架|投票|评论)$/i.test(text))
                continue;
            out.push(text);
        }
        return out.slice(0, 2500);
    }
    catalogCacheKey(url) {
        let hash = 2166136261;
        for (const ch of String(url || '')) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
        return this.catalogStoragePrefix + (hash >>> 0).toString(36);
    }
    setCatalogCache(url, chapters) {
        const key = String(url || '');
        const rows = Array.isArray(chapters) ? chapters.slice(0, 20000) : [];
        const entry = {url: key, rows, expires: Date.now() + 120000};
        this.catalogMemory.delete(key);
        this.catalogMemory.set(key, entry);
        while (this.catalogMemory.size > 4) this.catalogMemory.delete(this.catalogMemory.keys().next().value);
        try { storage_1.storage.set(this.catalogCacheKey(url), JSON.stringify(entry), entry.expires); } catch (_) {}
    }
    getCatalogCache(url) {
        const key = String(url || '');
        let entry = this.catalogMemory.get(key);
        if (!entry) {
            try {
                const raw = storage_1.storage.get(this.catalogCacheKey(url));
                entry = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } catch (_) {}
        }
        if (entry?.url === key && entry.expires > Date.now() && Array.isArray(entry.rows)) return entry.rows;
        this.catalogMemory.delete(key);
        return [];
    }
    loadStrategyStats() {
        if (this.strategyStatsLoaded) return;
        this.strategyStatsLoaded = true;
        try {
            const raw = storage_1.storage.get(this.strategyStatsStorageKey);
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (parsed && typeof parsed === 'object') this.strategyStats = parsed;
        } catch (_) { this.strategyStats = {}; }
    }
    persistStrategyStatsSoon() {
        if (this.strategyStatsDirty) return;
        this.strategyStatsDirty = true;
        setTimeout(() => {
            this.strategyStatsDirty = false;
            try { storage_1.storage.set(this.strategyStatsStorageKey, JSON.stringify(this.strategyStats), Date.now() + 7 * 24 * 60 * 60 * 1000); } catch (_) {}
        }, 300);
    }
    strategyKey(operation, url) {
        let host = 'site';
        try { host = new URL(String(url || this.site)).hostname || host; } catch (_) {}
        return `${host}|${String(operation || 'generic')}`;
    }
    strategyBucket(operation, url) {
        this.loadStrategyStats();
        const key = this.strategyKey(operation, url);
        if (!this.strategyStats[key]) this.strategyStats[key] = {
            total: 0,
            native: { count: 0, ok: 0, fail: 0, totalMs: 0, ewmaMs: 0 },
            js: { count: 0, ok: 0, fail: 0, totalMs: 0, ewmaMs: 0 },
        };
        return this.strategyStats[key];
    }
    strategyScore(stat) {
        if (!stat || !stat.count) return Number.POSITIVE_INFINITY;
        const successRate = stat.ok / Math.max(1, stat.count);
        const avg = stat.ok ? stat.totalMs / stat.ok : 60000;
        return avg * (1 + (1 - successRate) * 4);
    }
    strategyWinner(bucket) {
        const ns = this.strategyScore(bucket.native);
        const js = this.strategyScore(bucket.js);
        if (!Number.isFinite(ns) && !Number.isFinite(js)) return 'native';
        return js < ns ? 'js' : 'native';
    }
    chooseStrategy(operation, url, jsAvailable = true) {
        const bucket = this.strategyBucket(operation, url);
        if (!jsAvailable) return 'native';
        const n = bucket.native || {};
        const j = bucket.js || {};
        const nCount = Number(n.count || 0), jCount = Number(j.count || 0);
        const nOk = Number(n.ok || 0), jOk = Number(j.ok || 0);
        // v0.8.1: stability first. Older builds intentionally alternated native/JS
        // during the first ten requests. On mobile that made an otherwise fast
        // source randomly pay for the slower transport. We now keep a successful
        // transport and learn the alternative only when the winner fails (the
        // fallback in runAdaptiveStrategy records that sample automatically).
        if (!nCount && !jCount) return 'native';
        if (nOk && !jOk) return 'native';
        if (jOk && !nOk) return 'js';
        if (nOk || jOk) {
            const winner = this.strategyWinner(bucket);
            // Very sparse health probe only after enough real traffic. One slow
            // experimental call every 30 requests cannot dominate normal browsing.
            const total = Number(bucket.total || 0);
            if (total >= 30 && total % 30 === 29) return winner === 'native' ? 'js' : 'native';
            return winner;
        }
        // Both strategies have only failed so far: alternate once to recover.
        return nCount <= jCount ? 'native' : 'js';
    }
    recordStrategy(operation, url, strategy, elapsedMs, ok) {
        const bucket = this.strategyBucket(operation, url);
        const stat = bucket[strategy] || (bucket[strategy] = { count:0, ok:0, fail:0, totalMs:0, ewmaMs:0 });
        const ms = Math.max(1, Number(elapsedMs || 1));
        stat.count += 1;
        bucket.total = Number(bucket.total || 0) + 1;
        if (ok) {
            stat.ok += 1;
            stat.totalMs += ms;
            stat.ewmaMs = stat.ewmaMs ? Math.round(stat.ewmaMs * 0.72 + ms * 0.28) : ms;
        } else stat.fail += 1;
        this.persistStrategyStatsSoon();
    }
    async runAdaptiveStrategy(operation, url, nativeFn, jsFn) {
        const jsAvailable = typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function' && typeof jsFn === 'function';
        const selected = 'native'; // Prefer LNReader's configured User-Agent, including after WebView.
        const first = selected === 'js' ? jsFn : nativeFn;
        const second = selected === 'js' ? nativeFn : jsFn;
        const started = Date.now();
        try {
            const value = await first();
            this.recordStrategy(operation, url, selected, Date.now() - started, true);
            return value;
        } catch (error) {
            this.recordStrategy(operation, url, selected, Date.now() - started, false);
            if (error?.protection?.challenge || error?.name === 'AbortError') throw error;
            if (typeof second !== 'function') throw error;
            const fallbackName = selected === 'js' ? 'native' : 'js';
            if (fallbackName === 'js' && !jsAvailable) throw error;
            const fallbackStart = Date.now();
            try {
                const value = await second();
                this.recordStrategy(operation, url, fallbackName, Date.now() - fallbackStart, true);
                return value;
            } catch (fallbackError) {
                this.recordStrategy(operation, url, fallbackName, Date.now() - fallbackStart, false);
                throw fallbackError;
            }
        }
    }
    loadPersistentChapterCache() {
        if (this.persistentChapterCacheLoaded) return;
        this.persistentChapterCacheLoaded = true;
        try {
            const raw = storage_1.storage.get(this.persistentChapterCacheStorageKey);
            const rows = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(rows)) {
                for (const row of rows.slice(-4)) {
                    if (Array.isArray(row) && row.length >= 2) this.persistentChapterCache.set(String(row[0]), String(row[1]));
                }
            }
        } catch (_) {}
    }
    getPersistentChapterCache(url) {
        this.loadPersistentChapterCache();
        return this.persistentChapterCache.get(String(url || ''));
    }
    setPersistentChapterCache(url, html) {
        this.loadPersistentChapterCache();
        this.persistentChapterCache.set(String(url || ''), String(html || ''));
        while (this.persistentChapterCache.size > 4) {
            const first = this.persistentChapterCache.keys().next().value;
            if (!first) break;
            this.persistentChapterCache.delete(first);
        }
        try { storage_1.storage.set(this.persistentChapterCacheStorageKey, JSON.stringify(Array.from(this.persistentChapterCache.entries())), Date.now() + 24 * 60 * 60 * 1000); } catch (_) {}
    }
    async prefetchChapter(path, delayMs = 0) {
        const url = this.asHttpUrl(path);
        if (!url || this.chapterCache.has(url) || this.getPersistentChapterCache(url) || this.chapterPrefetchInFlight.has(url)) return;
        this.chapterPrefetchInFlight.add(url);
        try {
            if (delayMs) await this.sleep(delayMs);
            if (this.chapterCache.has(url) || this.getPersistentChapterCache(url)) return;
            await this.parseChapter(url);
        } catch (_) {
        } finally { this.chapterPrefetchInFlight.delete(url); }
    }
    async prefetchNextKnownChapter(currentUrl) {
        for (const novel of this.metadataCache.values()) {
            const chapters = Array.isArray(novel?.chapters) ? novel.chapters : [];
            const i = chapters.findIndex(ch => this.asHttpUrl(ch?.path) === currentUrl);
            if (i >= 0 && chapters[i + 1]?.path) {
                await this.prefetchChapter(chapters[i + 1].path, 900);
                return;
            }
        }
    }
    loadNovelHintCache() {
        if (this.novelHintCacheLoaded) return;
        this.novelHintCacheLoaded = true;
        try {
            const raw = storage_1.storage.get(this.novelHintStorageKey);
            const rows = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(rows)) for (const row of rows.slice(-500)) {
                if (Array.isArray(row) && row.length >= 2 && row[1] && typeof row[1] === 'object') this.novelHintCache.set(String(row[0]), row[1]);
            }
        } catch (_) {}
    }
    persistNovelHintsSoon() {
        if (this.novelHintCacheDirty) return;
        this.novelHintCacheDirty = true;
        setTimeout(() => {
            this.novelHintCacheDirty = false;
            try { storage_1.storage.set(this.novelHintStorageKey, JSON.stringify(Array.from(this.novelHintCache.entries()).slice(-500)), Date.now() + 7 * 24 * 60 * 60 * 1000); } catch (_) {}
        }, 220);
    }
    rememberNovelHints(items) {
        this.loadNovelHintCache();
        let changed = false;
        for (const item of (items || [])) {
            if (!item?.path) continue;
            const key = this.novelIdentity(String(item.path));
            if (!key) continue;
            const previous = this.novelHintCache.get(key) || {};
            const next = {
                ...(previous || {}),
                ...(item.name && !this.isGenericNovelTitle(item.name) ? {name:String(item.name)} : {}),
                ...(item.cover && !this.isPlaceholderImageUrl(item.cover) ? {cover:String(item.cover)} : {}),
                updatedAt:Date.now(),
            };
            this.novelHintCache.set(key, next); changed = true;
        }
        while (this.novelHintCache.size > 500) { const first=this.novelHintCache.keys().next().value; if(!first) break; this.novelHintCache.delete(first); }
        if (changed) this.persistNovelHintsSoon();
    }
    getNovelHint(url) {
        this.loadNovelHintCache();
        return this.novelHintCache.get(this.novelIdentity(String(url || '')));
    }
    loadPersistentDisplayCache() {
        if (this.displayCacheLoaded) return;
        this.displayCacheLoaded = true;
        try {
            const raw = storage_1.storage.get(this.displayCacheStorageKey);
            const rows = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (Array.isArray(rows)) {
                for (const row of rows.slice(-900)) {
                    if (Array.isArray(row) && row.length >= 2)
                        this.displayTitleCache.set(String(row[0]), String(row[1]));
                }
            }
        } catch (_) {}
    }
    persistDisplayCacheSoon() {
        if (this.displayCacheDirty) return;
        this.displayCacheDirty = true;
        setTimeout(() => {
            this.displayCacheDirty = false;
            try {
                const rows = Array.from(this.displayTitleCache.entries()).slice(-900);
                storage_1.storage.set(this.displayCacheStorageKey, JSON.stringify(rows), Date.now() + 7 * 24 * 60 * 60 * 1000);
            } catch (_) {}
        }, 250);
    }
    getDisplayCache(key) {
        this.loadPersistentDisplayCache();
        return this.displayTitleCache.get(key);
    }
    setDisplayCache(key, value) {
        this.loadPersistentDisplayCache();
        this.displayTitleCache.set(key, value);
        while (this.displayTitleCache.size > 900) {
            const first = this.displayTitleCache.keys().next().value;
            if (!first) break;
            this.displayTitleCache.delete(first);
        }
        this.persistDisplayCacheSoon();
    }
    async googleTranslateCached(text) {
        const source = String(text || '');
        const key = `${this.targetLanguage}\u0000${source}`;
        const cached = this.getDisplayCache(key);
        if (cached !== undefined)
            return cached;
        try {
            const value = await this.googleTranslate(source);
            // A successful response may legitimately equal the source (same-language
            // site, proper nouns, acronyms). Only network/parser failures stay uncached.
            this.setDisplayCache(key, value);
            return value;
        }
        catch (_) {
            return source;
        }
    }
    async googleTranslateList(values, timeoutMs = 9000) {
        const src = (values || []).map(v => String(v || ''));
        if (!src.length)
            return [];
        const out = new Array(src.length);
        const translatedOk = new Array(src.length).fill(false);
        const pending = [];
        for (let i = 0; i < src.length; i++) {
            const key = `${this.targetLanguage}\u0000${src[i]}`;
            const cached = this.getDisplayCache(key);
            if (cached !== undefined) {
                out[i] = cached;
                translatedOk[i] = true;
            }
            else pending.push(i);
        }
        const batches = [];
        let current = [];
        let size = 0;
        for (const index of pending) {
            const add = src[index].length + 36;
            // Larger batches reduce round-trips for catalogs such as WooCommerce
            // archives, but stay well under Google GTX's practical GET limits.
            if (current.length && (size + add > 2700 || current.length >= 28)) {
                batches.push(current);
                current = [];
                size = 0;
            }
            current.push(index);
            size += add;
        }
        if (current.length) batches.push(current);
        let cursor = 0;
        const workers = Math.min(3, batches.length || 1);
        await Promise.all(Array.from({ length: workers }, async () => {
            while (true) {
                const bi = cursor++;
                if (bi >= batches.length) break;
                const indexes = batches[bi];
                // Private-use sentinels survive machine translation more reliably
                // than natural-language punctuation. A secondary THSEP regex also
                // tolerates services that strip the private-use characters.
                const nonce = Math.random().toString(36).slice(2, 9);
                const token = `\uE000THSEP${bi}_${nonce}\uE001`;
                const joined = indexes.map(i => src[i]).join(`\n${token}\n`);
                let success = false;
                try {
                    const translated = await this.googleTranslate(joined, timeoutMs);
                    let parts = translated.split(token);
                    if (parts.length !== indexes.length) {
                        parts = translated.split(/[\uE000]?THSEP\d*[_-]?[a-z0-9]*[\uE001]?/gi);
                    }
                    // Last safe fallback: if the translator preserved line count and
                    // the batch had one title per line, use those lines. Never guess
                    // segmentation when counts differ.
                    if (parts.length !== indexes.length && indexes.length > 1) {
                        const lines = translated.split(/\r?\n/).map(v => this.norm(v)).filter(Boolean);
                        if (lines.length === indexes.length) parts = lines;
                    }
                    if (parts.length === indexes.length) {
                        indexes.forEach((idx, k) => {
                            out[idx] = this.norm(parts[k]) || src[idx];
                            translatedOk[idx] = true;
                        });
                        success = true;
                    }
                } catch (_) {}
                if (!success) {
                    let next=0; const deadline=Date.now()+3800;
                    await Promise.all(Array.from({length:Math.min(3,indexes.length)},async()=>{
                        while(next<indexes.length && Date.now()<deadline){
                            const idx=indexes[next++];
                            try {const value=await this.googleTranslate(src[idx],Math.min(1600,deadline-Date.now()));
                                if(this.norm(value)){out[idx]=value;translatedOk[idx]=true;}
                            } catch (_) {}
                        }
                    }));
                    this.emitPerf({operation:'translation-display',status:translatedOk.some(Boolean)?'partial':'error',totalMs:0,
                        stages:[{stage:'batch-fallback',items:indexes.length,translated:indexes.filter(i=>translatedOk[i]).length,target:this.targetLanguage}]});
                }
                if (!success) indexes.forEach(idx => { if (out[idx] === undefined) out[idx] = src[idx]; });
                for (const idx of indexes) {
                    // Crucial: a timeout/HTTP/parser failure must not permanently cache
                    // the untranslated source. A later page open can retry normally.
                    if (translatedOk[idx]) {
                        const key = `${this.targetLanguage}\u0000${src[idx]}`;
                        this.setDisplayCache(key, out[idx] || src[idx]);
                    }
                }
            }
        }));
        return out.map((v, i) => v || src[i]);
    }
    applyCachedNovelItemTitles(items) {
        const list = Array.isArray(items) ? items : [];
        return list.map(item => {
            const original = this.cleanNovelTitleText(item?.name || '', () => ({ attr:()=>'', text:()=>'' })) || item?.name || '';
            const cached = this.getDisplayCache(`${this.targetLanguage}\u0000${original}`);
            return { ...item, name: cached || original || item?.name };
        });
    }
    hasUncachedNovelTitles(items) {
        const list = Array.isArray(items) ? items : [];
        return list.some(item => {
            const original = this.cleanNovelTitleText(item?.name || '', () => ({ attr:()=>'', text:()=>'' })) || item?.name || '';
            return !!original && this.getDisplayCache(`${this.targetLanguage}\u0000${original}`) === undefined;
        });
    }
    async translateNovelItemTitlesGoogle(items) {
        const list = Array.isArray(items) ? items : [];
        if (!list.length) return [];
        const originals = list.map(x => this.cleanNovelTitleText(x?.name || '', () => ({ attr:()=>'', text:()=>'' })) || x?.name || '');
        const names = await this.googleTranslateList(originals, 1800);
        return list.map((item, i) => ({ ...item, name: names[i] || originals[i] || item.name }));
    }
    async translateDisplayBatches(values, batchSize = 24, concurrency = 4, timeoutMs = 9000) {
        const src = (values || []).map(v => String(v || ''));
        const out = src.slice();
        const jobs = [];
        for (let i = 0; i < src.length; i += batchSize) jobs.push({ start: i, values: src.slice(i, i + batchSize) });
        let cursor = 0;
        const workers = Math.min(2, Math.max(1, concurrency), jobs.length || 1);
        await Promise.all(Array.from({ length: workers }, async () => {
            while (true) {
                const job = jobs[cursor++];
                if (!job) break;
                try {
                    const translated = await this.googleTranslateList(job.values, timeoutMs);
                    translated.forEach((v, j) => { out[job.start + j] = v || job.values[j]; });
                } catch (_) {
                    job.values.forEach((v, j) => { out[job.start + j] = this.getDisplayCache(`${this.targetLanguage}\u0000${v}`) || v; });
                }
            }
        }));
        return out;
    }
    async warmDisplayTranslations(values) {
        const src = (values || []).map(v => String(v || '')).filter(Boolean);
        for (let i = 0; i < src.length; i += 24) {
            const batch = src.slice(i, i + 24).filter(text => !this.getDisplayCache(`${this.targetLanguage}\u0000${text}`));
            if (batch.length) {
                try { await this.googleTranslateList(batch); } catch (_) {}
                await this.sleep(80);
            }
        }
    }
    cleanChapterTitleText(text) {
        let out = this.norm(text);
        out = out
            .replace(/^\s*[•·●○]\s*/, '')
            .replace(/\s*(?:\[|【|\()?\s*(?:新|NEW|免费|免費|VIP|更新|置顶|置頂)\s*(?:\]|】|\))?\s*$/i, '')
            .replace(/\s+(?:更新时间|更新時間)\s*[:：].*$/i, '')
            .trim();
        return this.norm(out);
    }
    async translateChapterTitlesGoogle(chapters) {
        const list = Array.isArray(chapters) ? chapters : [];
        if (!list.length)
            return [];
        const originals = list.map(x => this.cleanChapterTitleText(x?.name || ''));
        const names = await this.googleTranslateList(originals);
        return list.map((chapter, i) => ({ ...chapter, name: names[i] || originals[i] || chapter.name }));
    }
    async translateChapterTitlesProgressive(chapters) {
        const list = Array.isArray(chapters) ? chapters : [];
        if (!list.length) return [];
        const originals = list.map(x => this.cleanChapterTitleText(x?.name || ''));
        // LNReader exposes parseNovel as one Promise, not an incremental chapter-list
        // stream. Therefore never leak untranslated tail items: translate in fast,
        // bounded waves while the app keeps its own loading placeholder visible.
        const names = await this.translateDisplayBatches(originals, 32, 5);
        return list.map((chapter, i) => ({ ...chapter, name: names[i] || originals[i] || chapter.name }));
    }
    async translateMany(texts) {
        const out = new Array(texts.length);
        let cursor = 0;
        const config = await this.loadTranslationConfig();
        const hasAI = this.availableProviderIds(config).length > 0;
        const workers = Math.min(hasAI ? 1 : 2, texts.length || 1);
        await Promise.all(Array.from({ length: workers }, async () => {
            while (true) {
                const index = cursor++;
                if (index >= texts.length)
                    break;
                try {
                    out[index] = await this.translateText(texts[index], config);
                }
                catch (_) {
                    try {
                        out[index] = await this.googleTranslate(texts[index]);
                    }
                    catch (_) {
                        out[index] = texts[index];
                    }
                }
                await this.sleep(hasAI ? 120 : 70);
            }
        }));
        return out;
    }
    async translateText(text, suppliedConfig) {
        const source = String(text || '');
        if (!this.norm(source))
            return source;
        const config = suppliedConfig || await this.loadTranslationConfig();
        const ids = this.availableProviderIds(config);
        if (!ids.length)
            return this.googleTranslate(source);
        const chunks = this.splitLongText(source, 3000);
        const translated = [];
        for (const chunk of chunks) {
            translated.push(await this.translateChunkWithFallback(chunk, config));
            if (chunks.length > 1)
                await this.sleep(80);
        }
        return translated.join('');
    }
    async loadTranslationConfig(force = false) {
        const now = Date.now();
        if (!force && this.aiConfigCache && now - this.aiConfigFetchedAt < 60000) return this.aiConfigCache;
        let config = this.embeddedTranslationConfig && typeof this.embeddedTranslationConfig === 'object' ? this.embeddedTranslationConfig : { providers: {} };
        // Children carry a private BYOK snapshot. Reading 127.0.0.1 here used to
        // delay the first translation whenever the Factory server was not running.
        if (this.mode !== 'child') {
            try {
                const data = await this.factoryRequest('/api/factory/config', { method: 'GET' });
                if (data && typeof data === 'object' && Object.keys(data.providers || {}).length) config = data;
            } catch (_) {}
        }
        this.aiConfigCache = config; this.aiConfigFetchedAt = now; return config;
    }
    availableProviderIds(config) {
        const providers = config?.providers || {};
        const defaultLatency = { G: 1100, P: 1700, Z: 2300, H: 2600 };
        return ['G', 'P', 'Z', 'H']
            .filter(id => this.norm(providers?.[id]?.key || ''))
            .sort((a, b) => {
                const ah = this.providerHealth.get(a) || {};
                const bh = this.providerHealth.get(b) || {};
                const now = Date.now();
                const ac = Number(ah.cooldownUntil || 0) > now ? 1 : 0;
                const bc = Number(bh.cooldownUntil || 0) > now ? 1 : 0;
                if (ac !== bc)
                    return ac - bc;
                const af = Number(ah.failures || 0);
                const bf = Number(bh.failures || 0);
                if (af !== bf)
                    return af - bf;
                return Number(ah.avgLatency || defaultLatency[a]) - Number(bh.avgLatency || defaultLatency[b]);
            });
    }
    async translateChunkWithFallback(chunk, config) {
        const ids = this.availableProviderIds(config);
        let lastError;
        for (const id of ids) {
            const health = this.providerHealth.get(id) || {};
            if (Number(health.cooldownUntil || 0) > Date.now())
                continue;
            const started = Date.now();
            try {
                let value = await this.aiProviderTranslate(id, chunk, config.providers[id]);
                // Multiple BYOK providers cooperate only when useful: a suspicious
                // primary translation is reviewed by a second configured model.
                // Normal good translations stay single-provider for speed.
                if (this.needsTranslationRepair(chunk, value)) {
                    const second = ids.find(other => other !== id && Number((this.providerHealth.get(other) || {}).cooldownUntil || 0) <= Date.now());
                    if (second) {
                        try { value = await this.aiProviderRepair(second, chunk, value, config.providers[second]); } catch (_) {}
                    } else {
                        try {
                            const google = await this.googleTranslate(chunk);
                            if (!this.needsTranslationRepair(chunk, google)) value = google;
                        } catch (_) {}
                    }
                }
                const elapsed = Date.now() - started;
                const previous = Number(health.avgLatency || elapsed);
                this.providerHealth.set(id, {
                    failures: Math.max(0, Number(health.failures || 0) - 1),
                    cooldownUntil: 0,
                    avgLatency: Math.round(previous * 0.7 + elapsed * 0.3),
                });
                return value;
            }
            catch (error) {
                lastError = error;
                const status = Number(error?.status || 0);
                const failures = Number(health.failures || 0) + 1;
                const cooldown = status === 429 ? 45000 :
                    (status === 401 || status === 403) ? 180000 : Math.min(60000, 5000 * failures);
                this.providerHealth.set(id, {
                    failures,
                    cooldownUntil: Date.now() + cooldown,
                    avgLatency: Number(health.avgLatency || 3000),
                });
            }
        }
        try {
            return await this.googleTranslate(chunk);
        }
        catch (googleError) {
            throw lastError || googleError;
        }
    }
    needsTranslationRepair(source, target) {
        const s = this.norm(source);
        const t = this.norm(target);
        if (!t) return true;
        if (s.length > 20 && s === t) return true;
        if (/\b(?:i cannot|i can't|cannot comply|as an ai|translation:|here is the translation)\b/i.test(t)) return true;
        const targetKey = String(this.targetLanguage || '').toLowerCase();
        const latinTarget = !/^(zh|ja|ko)/.test(targetKey);
        if (latinTarget) {
            const hanSource = (s.match(/[\u3400-\u9fff]/g) || []).length;
            const hanTarget = (t.match(/[\u3400-\u9fff]/g) || []).length;
            if (hanSource >= 4 && hanTarget >= Math.max(3, Math.floor(hanSource * 0.08))) return true;
        }
        return !this.auditTranslation(s, t);
    }
    async aiProviderRepair(id, source, candidate, providerConfig) {
        const def = this.providerDefinition(id);
        const key = this.norm(providerConfig?.key || '');
        if (!def || !key) throw new Error('Translator Hell: provedor de revisão sem chave');
        const system = `Você é um revisor de tradução literária. Compare o original com a tradução candidata e devolva SOMENTE uma versão corrigida em ${this.targetLabel}. Remova trechos que ficaram no idioma original, preserve nomes, números, pontuação, diálogos e sentido. Não explique.`;
        const body = {
            model: providerConfig?.model || def.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: `ORIGINAL:\n${source}\n\nTRADUÇÃO CANDIDATA:\n${candidate}` },
            ],
            temperature: 0.1,
            stream: false,
            max_tokens: 4096,
        };
        if (def.glm) body.thinking = { type: 'disabled' };
        const response = await (0, fetch_1.fetchApi)(providerConfig?.url || def.url, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) { const error = new Error(`Translator Hell: ${def.label} revisão HTTP ${response.status}`); error.status = response.status; throw error; }
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        let value = typeof content === 'string' ? content : Array.isArray(content) ? content.map(part => typeof part === 'string' ? part : (part?.text || part?.content || '')).join('') : '';
        value = this.cleanAiOutput(value);
        if (!this.auditTranslation(source, value)) throw new Error('Translator Hell: revisão suspeita');
        return value;
    }
    providerDefinition(id) {
        return {
            P: {
                label: 'Pollinations',
                url: 'https://gen.pollinations.ai/v1/chat/completions',
                model: 'nova-fast',
            },
            Z: {
                label: 'Z.AI',
                url: 'https://api.z.ai/api/paas/v4/chat/completions',
                model: 'glm-4.7-flash',
                glm: true,
            },
            H: {
                label: 'BigModel/HEIA',
                url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
                model: 'glm-4.7-flash',
                glm: true,
            },
            G: {
                label: 'Groq',
                url: 'https://api.groq.com/openai/v1/chat/completions',
                model: 'openai/gpt-oss-20b',
            },
        }[id];
    }
    async aiProviderTranslate(id, text, providerConfig) {
        const def = this.providerDefinition(id);
        const key = this.norm(providerConfig?.key || '');
        if (!def || !key)
            throw new Error('Translator Hell: provedor sem chave');
        const system = `Você é um tradutor literário. Traduza fielmente o texto do usuário para ${this.targetLabel}. Preserve nomes próprios, números, pontuação, diálogos e sentido. Não resuma, não explique e devolva somente a tradução. Preserve exatamente marcadores privados como \uE000THP\uE001 quando aparecerem.`;
        const body = {
            model: providerConfig?.model || def.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: text },
            ],
            temperature: 0.15,
            stream: false,
            max_tokens: 4096,
        };
        if (def.glm)
            body.thinking = { type: 'disabled' };
        const response = await (0, fetch_1.fetchApi)(providerConfig?.url || def.url, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const error = new Error(`Translator Hell: ${def.label} HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        let value = '';
        if (typeof content === 'string')
            value = content;
        else if (Array.isArray(content))
            value = content.map(part => typeof part === 'string' ? part : (part?.text || part?.content || '')).join('');
        value = this.cleanAiOutput(value);
        if (!this.auditTranslation(text, value))
            throw new Error(`Translator Hell: ${def.label} devolveu tradução suspeita`);
        return value;
    }
    auditTranslation(source, target) {
        const s = this.norm(source);
        const t = this.norm(target);
        if (!t)
            return false;
        if (s.length > 100 && t.length < s.length * 0.12)
            return false;
        if (s.length > 60 && t.length > s.length * 8)
            return false;
        return true;
    }
    cleanAiOutput(value) {
        let out = String(value || '').trim();
        if (out.startsWith('```') && out.endsWith('```'))
            out = out.replace(/^```(?:text|markdown)?\s*/i, '').replace(/\s*```$/, '');
        return this.cleanTranslationArtifacts(out.trim());
    }
    async googleTranslate(text, timeoutMs = 10000) {
        const source = String(text || '');
        if (!this.norm(source))
            return source;
        const chunks = this.splitLongText(source);
        const translated = [];
        for (const chunk of chunks) {
            const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
                encodeURIComponent(this.targetLanguage) + '&dt=t&q=' + encodeURIComponent(chunk);
            const response = await this.withAbortTimeout((signal) => (0, fetch_1.fetchApi)(url, { method: 'GET', ...(signal ? { signal } : {}) }), timeoutMs, 'Google Translate');
            if (!response.ok)
                throw new Error(`Translator Hell: Google HTTP ${response.status}`);
            const data = await this.withTimeout(response.json(), Math.min(2500, Math.max(500, timeoutMs)), 'JSON Google Translate');
            const value = Array.isArray(data?.[0]) ? data[0].map((part) => part?.[0] || '').join('') : '';
            if (!this.norm(value))
                throw new Error('Translator Hell: resposta vazia do Google');
            translated.push(this.cleanTranslationArtifacts(value));
            if (chunks.length > 1)
                await this.sleep(60);
        }
        return this.cleanTranslationArtifacts(translated.join(''));
    }
    splitLongText(text, max = 3400) {
        if (text.length <= max)
            return [text];
        const out = [];
        let rest = text;
        while (rest.length > max) {
            const positions = [
                rest.lastIndexOf('\n', max), rest.lastIndexOf('。', max), rest.lastIndexOf('！', max),
                rest.lastIndexOf('？', max), rest.lastIndexOf('. ', max), rest.lastIndexOf(' ', max),
            ];
            let cut = Math.max(...positions);
            if (cut < Math.floor(max * 0.45))
                cut = max;
            else
                cut += 1;
            out.push(rest.slice(0, cut));
            rest = rest.slice(cut);
        }
        if (rest)
            out.push(rest);
        return out;
    }
    async decodeHttpResponse(response) {
        // Chinese sites still commonly declare GBK/GB2312/GB18030. Response.text()
        // is not consistently charset-aware across RN/Hermes builds, so sniff the
        // header/meta declaration and use TextDecoder when the runtime supports it.
        if (typeof TextDecoder !== 'function' || typeof response?.arrayBuffer !== 'function')
            return this.repairUnicodeText(await response.text());
        try {
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let charset = '';
            try {
                const ct = String(response?.headers?.get?.('content-type') || '');
                charset = (ct.match(/charset\s*=\s*["']?([^;"'\s]+)/i) || [])[1] || '';
            } catch (_) {}
            if (!charset) {
                let head = '';
                const limit = Math.min(bytes.length, 8192);
                for (let i = 0; i < limit; i++) head += bytes[i] < 128 ? String.fromCharCode(bytes[i]) : ' ';
                charset = (head.match(/<meta[^>]+charset\s*=\s*["']?([^"'\s/>]+)/i) || [])[1] ||
                    (head.match(/<meta[^>]+content=["'][^"']*charset=([^"';\s>]+)/i) || [])[1] || '';
            }
            charset = String(charset || 'utf-8').toLowerCase().replace(/[_\s]/g, '-');
            if (/^(gbk|gb2312|x-gbk|cp936)$/.test(charset)) charset = 'gb18030';
            if (/^utf8$/.test(charset)) charset = 'utf-8';
            const candidates = [charset, 'utf-8'].filter((v, i, a) => v && a.indexOf(v) === i);
            for (const label of candidates) {
                try { return this.repairUnicodeText(new TextDecoder(label, { fatal: false }).decode(bytes)); } catch (_) {}
            }
            return this.repairUnicodeText(new TextDecoder('utf-8').decode(bytes));
        } catch (_) {
            return this.repairUnicodeText(await response.text());
        }
    }
    async consumeHttpResponse(response, url) {
        const html = await this.decodeHttpResponse(response);
        const meta = this.detectProtection(response, html, url);
        this.fetchMeta.set(url, meta);
        if (meta.finalUrl && meta.finalUrl !== url) this.fetchMeta.set(meta.finalUrl, meta);
        if (!response.ok || meta.challenge) {
            const message = meta.challenge
                ? `Translator Hell: Cloudflare detectado (HTTP ${response.status}). Abra o WebView desta fonte e conclua a verificação.`
                : `Translator Hell: HTTP ${response.status}${[401,403].includes(Number(response.status)) ? ' — acesso recusado. Abra o WebView desta fonte; login/verificação podem ser necessários.' : ''}`;
            const error = new Error(message);
            error.status = Number(response.status || 0);
            error.cloudflare = Boolean(meta.challenge);
            error.protection = meta;
            throw error;
        }
        return html;
    }
    declaredLegacyCharset(response) {
        let charset = '';
        try { charset = (String(response?.headers?.get?.('content-type') || '').match(/charset\s*=\s*["']?([^;"'\s]+)/i) || [])[1] || ''; } catch (_) {}
        charset = String(charset || '').toLowerCase().replace(/[_\s]/g, '-');
        if (/^(gbk|gb2312|x-gbk|cp936)$/.test(charset)) return 'gb18030';
        if (/^(gb18030|big5|big5-hkscs|shift-jis|shift_jis|euc-jp|euc-kr|windows-1252|iso-8859-1)$/.test(charset)) return charset.replace('shift_jis', 'shift-jis');
        return '';
    }
    async getTextNative(url, signal = null) {
        const init = {
            method: 'GET',
            credentials: 'include',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            },
            ...(signal ? { signal } : {}),
        };
        const response = await (0, fetch_1.fetchApi)(url, init);
        const encoding = this.declaredLegacyCharset(response);
        if (encoding && typeof FileReader !== 'undefined' && typeof response.clone === 'function') {
            try {
                const blob = await response.clone().blob();
                const html = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(String(reader.result || ''));
                    reader.onerror = reader.onabort = reject;
                    reader.readAsText(blob, encoding);
                });
                return await this.consumeHttpResponse({ok: response.ok, status: response.status,
                    url: response.url, headers: response.headers, text: async () => html}, url);
            } catch (error) { if (error?.status || error?.protection) throw error; }
        }
        return await this.consumeHttpResponse(response, url);
    }
    async getTextJs(url, signal = null) {
        if (typeof globalThis === 'undefined' || typeof globalThis.fetch !== 'function')
            throw new Error('JS fetch indisponível');
        const response = await globalThis.fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            },
            ...(signal ? { signal } : {}),
        });
        return await this.consumeHttpResponse(response, url);
    }
    async getTextSingleStrategy(url, operation = 'generic', signal = null) {
        let knownProtection = this.embeddedProfile?.protection;
        try { knownProtection = this.mergeProtection(knownProtection, this.readLocalProfile()?.protection) || knownProtection; } catch (_) {}
        if (knownProtection?.cloudflare) return await this.getTextNative(url, signal);
        const jsAvailable = typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function';
        const strategy = 'native'; // fetchApi shares the app User-Agent used by WebView.
        const actual = strategy === 'js' && jsAvailable ? 'js' : 'native';
        const started = Date.now();
        try {
            const value = actual === 'js' ? await this.getTextJs(url, signal) : await this.getTextNative(url, signal);
            this.recordStrategy(operation, url, actual, Date.now() - started, true);
            return value;
        } catch (error) {
            this.recordStrategy(operation, url, actual, Date.now() - started, false);
            throw error;
        }
    }
    async getText(url, operation = 'generic', signal = null) {
        let knownProtection = this.embeddedProfile?.protection;
        try { knownProtection = this.mergeProtection(knownProtection, this.readLocalProfile()?.protection) || knownProtection; } catch (_) {}
        if (knownProtection?.cloudflare) {
            try { return await this.getTextNative(url, signal); }
            catch (error) {
                if (error?.cloudflare || error?.protection?.cloudflare) throw error;
                return await this.getTextJs(url, signal);
            }
        }
        return await this.runAdaptiveStrategy(
            String(operation || 'generic'),
            url,
            () => this.getTextNative(url, signal),
            () => this.getTextJs(url, signal),
        );
    }
    asHttpUrl(value) {
        try {
            const u = new URL(String(value || '').trim());
            return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
        }
        catch (_) {
            return null;
        }
    }
    requireHttpUrl(value) {
        const url = this.asHttpUrl(value);
        if (!url)
            throw new Error('Translator Hell: URL http(s) inválida');
        return url;
    }
    resolveAgainst(raw, base) {
        if (!raw)
            return undefined;
        const cleaned = String(raw).trim();
        if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('javascript:'))
            return undefined;
        try {
            const url = new URL(cleaned, base);
            if (url.protocol !== 'http:' && url.protocol !== 'https:')
                return undefined;
            url.hash = '';
            return url.href;
        }
        catch (_) {
            return undefined;
        }
    }
    repairUnicodeText(value) {
        let text = String(value ?? '');
        // Legacy v0.6.2 paragraph marker could be mutated by Google/AI into
        // visible private-use squares such as "□THP□". Remove every known form.
        text = text
            .replace(/[\uE000-\uF8FF]+\s*THP\s*[\uE000-\uF8FF]+/gi, '\n')
            .replace(/[□�]\s*THP\s*[□�]/gi, '\n')
            .replace(/__THP(?:ARAGRAPH)?(?:BREAK)?__/gi, '\n');
        // Repair common UTF-8-as-Latin1 mojibake when the whole suspicious run
        // can be losslessly re-decoded. Do not touch ordinary Spanish/French text.
        if (/(?:Ã.|Â.|â[€™œ“”–—]|ðŸ|ä[¸º½¼]|å[-¿]|æ[-¿]|ç[-¿])/u.test(text)) {
            try {
                if (typeof escape === 'function') {
                    const repaired = decodeURIComponent(escape(text));
                    const before = (text.match(/[ÃÂâðäåæç]/g) || []).length;
                    const after = (repaired.match(/[ÃÂâðäåæç]/g) || []).length;
                    if (after < before) text = repaired;
                }
            } catch (_) {}
        }
        try { if (typeof text.normalize === 'function') text = text.normalize('NFC'); } catch (_) {}
        return text;
    }
    cleanTranslationArtifacts(value) {
        return this.repairUnicodeText(value)
            .replace(/\uFFFD+/g, '')
            .replace(/[\uE000-\uF8FF]+/g, '')
            .replace(/\r\n?/g, '\n');
    }
    norm(value) {
        return this.repairUnicodeText(value).replace(/\u00a0/g, ' ').replace(/[\t\r ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    }
    uniqueStrings(values) {
        const seen = new Set();
        const out = [];
        for (const value of values) {
            const v = String(value || '').trim();
            if (!v || seen.has(v))
                continue;
            seen.add(v);
            out.push(v);
        }
        return out;
    }
    async resolveSiteIconDeep($, base, current) {
        const value = String(current || '');
        // A declared icon/touch-icon/OG image is already better than probing.
        if (value && !/\/favicon\.(?:ico|png)(?:$|[?#])/i.test(value)) return value;
        try {
            const manifestHref = $('link[rel="manifest"]').first().attr('href');
            const manifestUrl = this.resolveAgainst(manifestHref, base);
            if (manifestUrl) {
                const raw = await this.withTimeout(this.getText(manifestUrl, 'factory'), 3500, 'manifesto do site');
                const manifest = JSON.parse(raw);
                const icons = Array.isArray(manifest?.icons) ? manifest.icons.filter(x => x && x.src) : [];
                const score = (icon) => {
                    const sizes = String(icon?.sizes || '');
                    const nums = (sizes.match(/\d+/g) || []).map(Number);
                    const biggest = nums.length ? Math.max(...nums) : 0;
                    const type = String(icon?.type || '').toLowerCase();
                    return biggest + (/png/.test(type) ? 2000 : /webp/.test(type) ? 1000 : 0);
                };
                icons.sort((a, b) => score(b) - score(a));
                const picked = this.resolveAgainst(icons[0]?.src, manifestUrl);
                if (picked) return picked;
            }
        } catch (_) {}
        return value || this.resolveAgainst('/favicon.ico', base);
    }
    extractSiteIconCandidates($, base) {
        const out = [];
        const add = (raw) => { const value=this.resolveAgainst(raw, base); if (value && !out.includes(value)) out.push(value); };
        try {
            $('link[rel],meta[name],meta[property]').each((_i, el) => {
                const n=$(el); const rel=String(n.attr('rel')||'').toLowerCase();
                const key=String(n.attr('name')||n.attr('property')||'').toLowerCase();
                if (/(?:^|\s)(?:icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)(?:\s|$)/i.test(rel)) add(n.attr('href'));
                if (['msapplication-tileimage','og:logo','logo'].includes(key)) add(n.attr('content'));
            });
        } catch (_) {}
        try { add(new URL('/favicon.ico', base).href); } catch (_) {}
        return out.slice(0, 12);
    }
    extractSiteIcon($, base) {
        const candidates = [
            'link[rel="apple-touch-icon"]@href',
            'link[rel="apple-touch-icon-precomposed"]@href',
            'link[rel="shortcut icon"]@href',
            'link[rel="icon"]@href',
            'meta[name="msapplication-TileImage"]@content',
            'meta[property="og:logo"],meta[name="og:logo"]@content',
        ];
        const picked = this.pickUrlAttr($, base, candidates).value;
        if (picked)
            return picked;
        try { return new URL('/favicon.ico', base).href; }
        catch (_) { return undefined; }
    }
    extractSiteManifest($, base) {
        try {
            const href = $('link[rel="manifest"]').first().attr('href');
            return this.resolveAgainst(href, base);
        } catch (_) { return undefined; }
    }
    prettyHost(host) {
        const raw = String(host || '').toLowerCase().replace(/:\d+$/, '');
        let parts = raw.split('.').filter(Boolean);
        while (parts.length > 2 && /^(www\d*|m|mobile|wap|touch|t|read|reader|app)$/i.test(parts[0]))
            parts.shift();
        const twoLevelSuffixes = new Set([
            'co.uk', 'org.uk', 'com.br', 'com.cn', 'com.tw', 'com.hk', 'com.au', 'com.sg', 'co.jp', 'co.kr',
            'com.tr', 'com.ua', 'co.id', 'com.vn', 'co.th', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'com.my', 'co.nz',
        ]);
        let key = parts[0] || raw;
        if (parts.length >= 2) {
            const suffix2 = parts.slice(-2).join('.');
            key = twoLevelSuffixes.has(suffix2) && parts.length >= 3 ? parts[parts.length - 3] : parts[parts.length - 2];
        }
        key = key.replace(/^xn--/i, '').replace(/[-_]+/g, ' ').trim() || raw;
        return key.replace(/\b\w/g, ch => ch.toUpperCase());
    }
    escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    median(values) {
        if (!values.length)
            return 0;
        const a = [...values].sort((x, y) => x - y);
        const mid = Math.floor(a.length / 2);
        return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.default = new TranslatorHellFactoryRuntime();
