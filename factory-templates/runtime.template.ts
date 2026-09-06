/**
 * LEGACY/REFERENCE SOURCE ONLY — v0.8.1
 *
 * The executable generator template is `runtime.template.js`. The Factory server
 * injects CONFIG into that file and all 15 prebuilt Masters are generated from it.
 * This older typed mirror is kept only as historical/reference material and MUST
 * NOT be used as the build source until it is mechanically regenerated from the
 * authoritative runtime.
 */

import { fetchApi } from '@libs/fetch';
import { load as loadCheerio } from 'cheerio';

declare const __TH_CONFIG__: any;
const CONFIG: any = __TH_CONFIG__;

type AnyObj = Record<string, any>;

type LearnedProfile = {
  id?: string;
  host: string;
  origin: string;
  siteName?: string;
  siteIconUrl?: string;
  seedUrl?: string;
  novelRoutes?: Record<string, { novelUrl: string; catalogUrl?: string; updatedAt?: number }>;
  selectors?: AnyObj;
  searchTemplates?: string[];
  listingUrls?: string[];
  createdAt?: number;
  updatedAt?: number;
  protection?: AnyObj;
};

type ChapterCandidate = {
  name: string;
  path: string;
  order: number;
  number?: number;
  volume?: number;
  numberSource?: 'text' | 'url';
};

class TranslatorHellFactoryRuntime {
  id = CONFIG.id;
  name = CONFIG.name;
  icon = CONFIG.icon || 'src/multi/translatorhell/factory_ance_v072.png';
  site = CONFIG.site || 'https://example.com';
  version = CONFIG.version || '0.8.1';
  filters = undefined;
  imageRequestInit = undefined;
  webStorageUtilized = true;

  private targetLanguage = String(CONFIG.targetLanguage || 'pt');
  private targetLabel = String(CONFIG.targetLabel || this.targetLanguage);
  private factoryBase = String(CONFIG.factoryBase || 'http://127.0.0.1:8765').replace(/\/$/, '');
  private mode = CONFIG.mode || 'child';
  private embeddedProfile: LearnedProfile | null = CONFIG.profile || null;
  private chapterCache = new Map<string, string>();
  private metadataCache = new Map<string, any>();
  private metadataInFlight = new Map<string, Promise<any>>();
  private catalogFetchInFlight = new Map<string, Promise<any>>();
  private profileCache = new Map<string, LearnedProfile>();
  private aiConfigCache: any = null;
  private aiConfigFetchedAt = 0;
  private providerHealth = new Map<string, any>();
  private fetchMeta = new Map<string, any>();

  async popularNovels(pageNo: number, _options: any): Promise<any[]> {
    // Master is a factory/command source, not a bookshelf.
    if (this.mode === 'master') return [];
    if (pageNo > 5) return [];
    const profile = await this.getCurrentProfile();
    if (!profile) return [];
    return this.discoverSiteNovels(profile, pageNo);
  }

  async searchNovels(searchTerm: string, pageNo: number): Promise<any[]> {
    const asUrl = this.asHttpUrl(searchTerm);

    if (asUrl) {
      return this.searchByUrl(asUrl);
    }
    if (pageNo > 3) return [];

    const query = this.norm(searchTerm);
    if (!query) return [];

    if (this.mode === 'master') {
      const profiles = await this.getProfiles();
      const selected = profiles.slice(0, 10);
      const results: any[] = [];
      let cursor = 0;
      const workers = Math.min(3, selected.length || 1);
      await Promise.all(Array.from({ length: workers }, async () => {
        while (true) {
          const i = cursor++;
          if (i >= selected.length) break;
          try {
            const found = await this.searchProfile(selected[i], query, pageNo);
            results.push(...found);
          } catch (_) {}
        }
      }));
      return this.dedupeNovelItems(results).slice(0, 60);
    }

    const profile = await this.getCurrentProfile();
    if (!profile) return [];
    return this.searchProfile(profile, query, pageNo);
  }

  private async searchByUrl(inputUrl: string): Promise<any[]> {
    let url = inputUrl;
    try {
      const html = await this.getText(url);
      const $ = loadCheerio(html);
      const inferredNovel = this.inferNovelUrl($, url);
      if (inferredNovel && inferredNovel !== url) {
        try {
          const novelHtml = await this.getText(inferredNovel);
          const novel$ = loadCheerio(novelHtml);
          const profile = this.learnProfile(novel$, inferredNovel, url);
          await this.registerProfile(profile);
          if (this.mode === 'master') return [];
          const metadata = this.extractMetadata(novel$, inferredNovel);
          return [{
            name: metadata.title || profile.siteName || profile.host,
            path: inferredNovel,
            ...(metadata.cover ? { cover: metadata.cover } : {}),
          }];
        } catch (_) {}
      }

      const profile = this.learnProfile($, url);
      await this.registerProfile(profile);
      if (this.mode === 'master') return [];
      const metadata = this.extractMetadata($, url);
      return [{
        name: metadata.title || profile.siteName || profile.host,
        path: url,
        ...(metadata.cover ? { cover: metadata.cover } : {}),
      }];
    } catch (error: any) {
      try {
        const u = new URL(url);
        const meta = this.fetchMeta.get(url) || error?.protection || {};
        const profile: LearnedProfile = {
          host: u.hostname,
          origin: u.origin,
          siteName: this.prettyHost(u.hostname),
          seedUrl: url,
          selectors: {},
          searchTemplates: [],
          ...(meta?.cloudflare ? { protection: this.mergeProtection(undefined, meta) } : {}),
        };
        await this.registerProfile(profile);
        if (this.mode === 'master') return [];
        if (meta?.cloudflare && meta?.challenge) throw new Error('Translator Hell: Cloudflare detectado. Abra o WebView desta fonte, conclua a verificação e tente novamente.');
        return [{ name: profile.siteName || profile.host, path: url }];
      } catch (_) {
        return [];
      }
    }
  }

  private novelIdentity(rawUrl: string): string {
    try {
      const u = new URL(String(rawUrl || '').trim());
      u.hash = '';
      for (const key of Array.from(u.searchParams.keys())) {
        if (/^(?:utm_[^=]*|fbclid|gclid|yclid|ref|referrer|source)$/i.test(key)) u.searchParams.delete(key);
      }
      u.pathname = u.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';
      return `${this.id}|${u.href}`;
    } catch (_) { return `${this.id}|${String(rawUrl || '').trim()}`; }
  }

  private novelRoute(profile: LearnedProfile | null | undefined, novelUrl: string): any {
    const routes = profile?.novelRoutes;
    return routes && typeof routes === 'object' ? routes[this.novelIdentity(novelUrl)] || null : null;
  }

  async parseNovel(novelPath: string): Promise<any> {
    const key = this.novelIdentity(novelPath);
    const cached = this.metadataCache.get(key);
    if (cached) return cached;
    const running = this.metadataInFlight.get(key);
    if (running) return await running;
    const task = this.parseNovelFresh(novelPath).finally(() => this.metadataInFlight.delete(key));
    this.metadataInFlight.set(key, task);
    return await task;
  }

  private async parseNovelFresh(novelPath: string): Promise<any> {
    let url = this.requireHttpUrl(novelPath);
    let html = await this.getText(url);
    let $ = loadCheerio(html);
    const inferredNovel = this.inferNovelUrl($, url);
    if (inferredNovel && inferredNovel !== url && this.looksLikeChapterPage($, url)) {
      try {
        url = inferredNovel;
        html = await this.getText(url);
        $ = loadCheerio(html);
      } catch (_) {}
    }

    let profile = await this.profileForUrl(url);
    const learned = this.learnProfile($, url);
    profile = this.mergeProfiles(profile, learned);
    await this.registerProfile(profile);

    const metadata = this.extractMetadata($, url, profile);
    const chapterResult = await this.extractChaptersDeep($, url, profile);
    let chapters = chapterResult.chapters;

    if (!chapters.length) {
      chapters = [{ name: metadata.title || 'Capítulo', path: url, chapterNumber: 1 }];
    }

    let name = metadata.title || profile.siteName || profile.host;
    let summary = metadata.summary || '';
    try {
      if (name) name = await this.translateText(name);
      if (summary) summary = await this.translateText(summary);
    } catch (_) {}

    const novel: any = {
      name,
      path: url,
      ...(metadata.cover ? { cover: metadata.cover } : {}),
      ...(metadata.author ? { author: metadata.author } : {}),
      ...(summary ? { summary } : {}),
      chapters,
    };

    const novelKey = this.novelIdentity(url);
    const refinement: AnyObj = {
      host: profile.host,
      novelRoutes: {
        [novelKey]: { novelUrl: url, ...(chapterResult.catalogUrl ? { catalogUrl: chapterResult.catalogUrl } : {}), updatedAt: Date.now() },
      },
      selectors: {
        ...(profile.selectors || {}),
        ...(metadata.selectors || {}),
        ...(chapterResult.chapterSelector ? { chapterLink: chapterResult.chapterSelector } : {}),
      },
      searchTemplates: this.uniqueStrings([
        ...(profile.searchTemplates || []),
        ...this.discoverSearchTemplates($, url),
      ]),
      listingUrls: this.uniqueStrings([
        ...(profile.listingUrls || []),
        ...this.discoverListingLinks($, url),
      ]),
    };
    await this.refineProfile(refinement);

    this.metadataCache.set(novelKey, novel);
    if (this.metadataCache.size > 8) {
      const first = this.metadataCache.keys().next().value;
      if (first) this.metadataCache.delete(first);
    }
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.requireHttpUrl(chapterPath);
    const hit = this.chapterCache.get(url);
    if (hit) return hit;

    const profile = await this.profileForUrl(url);
    const attempted = new Set<string>();
    const queue: string[] = [url];
    let extracted: any = null;
    let cloudflareSeen = false;
    let lastError: any = null;

    while (queue.length && attempted.size < 4 && !extracted) {
      const current = queue.shift();
      if (!current || attempted.has(current)) continue;
      attempted.add(current);
      try {
        const html = await this.getText(current);
        const $ = loadCheerio(html);
        const meta = this.fetchMeta.get(current) || {};
        if (meta.cloudflare) cloudflareSeen = true;
        extracted = this.extractChapterPayload($, html, current, profile);
        if (!extracted || extracted.blocks.length < 1) {
          for (const candidate of this.discoverChapterContentUrls($, current)) {
            if (!attempted.has(candidate) && !queue.includes(candidate)) queue.push(candidate);
          }
          extracted = null;
        }
      } catch (error: any) {
        lastError = error;
        if (error?.cloudflare || error?.protection?.cloudflare) cloudflareSeen = true;
      }
    }

    if (!extracted || !extracted.blocks.length) {
      if (cloudflareSeen && profile) {
        try { await this.refineProfile({ host: profile.host, protection: this.mergeProtection(profile.protection, { cloudflare: true, challenge: true }) }); } catch (_) {}
      }
      if (cloudflareSeen || profile?.protection?.cloudflare)
        throw new Error('Translator Hell: Cloudflare detectado. Abra o WebView desta fonte, conclua a verificação e toque em Tentar novamente.');
      if (lastError && /HTTP\s+(401|403|429|503)/i.test(String(lastError?.message || ''))) throw lastError;
      throw new Error('Translator Hell: conteúdo do capítulo não encontrado. O site pode carregar o texto por JavaScript; tente o WebView uma vez e repita.');
    }

    const translated = await this.translateMany(extracted.blocks);
    const result = translated.filter(Boolean).map((text: string) => `<p>${this.escapeHtml(text)}</p>`).join('\n');
    if (!result) throw new Error('Translator Hell: tradutor retornou conteúdo vazio');

    this.chapterCache.set(url, result);
    if (this.chapterCache.size > 4) {
      const first = this.chapterCache.keys().next().value;
      if (first) this.chapterCache.delete(first);
    }

    if (profile) {
      const refinement: AnyObj = {
        host: profile.host,
        selectors: {
          ...(profile.selectors || {}),
          ...(extracted.selector ? { chapterContent: extracted.selector } : {}),
        },
      };
      const meta = this.fetchMeta.get(url);
      if (meta?.cloudflare) refinement.protection = this.mergeProtection(profile.protection, meta);
      await this.refineProfile(refinement);
    }

    return result;
  }

  resolveUrl = (path: string, _isNovel?: boolean): string => {
    return this.asHttpUrl(path) || path;
  };

  private async getProfiles(): Promise<LearnedProfile[]> {
    try {
      const data = await this.factoryRequest('/api/factory/profiles', { method: 'GET' });
      return Array.isArray(data?.profiles) ? data.profiles : [];
    } catch (_) {
      return this.embeddedProfile ? [this.embeddedProfile] : [];
    }
  }

  private async getCurrentProfile(): Promise<LearnedProfile | null> {
    if (this.mode === 'master') return null;
    const host = CONFIG.host || this.embeddedProfile?.host;
    if (!host) return this.embeddedProfile;
    const hit = this.profileCache.get(host);
    if (hit) return hit;
    try {
      const data = await this.factoryRequest('/api/factory/profile?host=' + encodeURIComponent(host), { method: 'GET' });
      if (data?.profile) {
        this.profileCache.set(host, data.profile);
        return data.profile;
      }
    } catch (_) {}
    return this.embeddedProfile;
  }

  private async profileForUrl(url: string): Promise<LearnedProfile> {
    const u = new URL(url);
    const host = u.hostname;
    const hit = this.profileCache.get(host);
    if (hit) return hit;

    if (this.mode === 'child' && this.embeddedProfile && this.sameSiteHost(this.embeddedProfile.host, host)) {
      const current = await this.getCurrentProfile();
      if (current) return current;
    }

    try {
      const data = await this.factoryRequest('/api/factory/profile?host=' + encodeURIComponent(host), { method: 'GET' });
      if (data?.profile) {
        this.profileCache.set(host, data.profile);
        return data.profile;
      }
    } catch (_) {}

    return {
      host,
      origin: u.origin,
      siteName: this.prettyHost(host),
      seedUrl: url,
      selectors: {},
      searchTemplates: [],
    };
  }

  private async registerProfile(profile: LearnedProfile): Promise<void> {
    if (!profile?.host) return;
    this.profileCache.set(profile.host, profile);
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
      });
      if (data?.profile) this.profileCache.set(profile.host, data.profile);
    } catch (_) {
      // The source keeps working even when the local factory server is unavailable.
    }
  }

  private async refineProfile(refinement: AnyObj): Promise<void> {
    if (!refinement?.host) return;
    try {
      const data = await this.factoryRequest('/api/factory/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refinement,
          targetKey: CONFIG.targetKey,
          targetLanguage: this.targetLanguage,
          manifestLang: CONFIG.manifestLang,
          targetLabel: CONFIG.targetLabel,
          mode: this.mode,
        }),
      });
      if (data?.profile) this.profileCache.set(refinement.host, data.profile);
    } catch (_) {}
  }

  private async factoryRequest(path: string, init: any): Promise<any> {
    const response = await fetchApi(this.factoryBase + path, init);
    if (!response.ok) throw new Error(`Translator Hell Factory HTTP ${response.status}`);
    return await response.json();
  }

  private learnProfile($: any, url: string, originalUrl?: string): LearnedProfile {
    const u = new URL(url);
    const metadata = this.extractMetadata($, url);
    const catalogLinks = this.discoverCatalogLinks($, url);
    const chapterSelector = this.findBestChapterSelector($, url);
    const listingUrls = this.discoverListingLinks($, url);
    // Child plugin identity deliberately comes from DNS, not page branding.
    // This keeps generated sources stable even when a site changes its <title>/branding.
    const siteName = this.prettyHost(u.hostname);
    const siteIconUrl = this.extractSiteIcon($, url);

    return {
      host: u.hostname,
      origin: u.origin,
      siteName,
      ...(siteIconUrl ? { siteIconUrl } : {}),
      seedUrl: originalUrl || url,
      selectors: {
        ...(metadata.selectors || {}),
        ...(chapterSelector ? { chapterLink: chapterSelector } : {}),
      },
      searchTemplates: this.discoverSearchTemplates($, url),
      listingUrls,
      ...(this.fetchMeta.get(url)?.cloudflare ? { protection: this.mergeProtection(undefined, this.fetchMeta.get(url)) } : {}),
    };
  }

  private mergeProfiles(a: LearnedProfile | null | undefined, b: LearnedProfile | null | undefined): LearnedProfile {
    if (!a) return b as LearnedProfile;
    if (!b) return a;
    return {
      ...a,
      ...b,
      selectors: { ...(a.selectors || {}), ...(b.selectors || {}) },
      searchTemplates: this.uniqueStrings([...(a.searchTemplates || []), ...(b.searchTemplates || [])]),
      listingUrls: this.uniqueStrings([...(a.listingUrls || []), ...(b.listingUrls || [])]),
      novelRoutes: { ...(a.novelRoutes || {}), ...(b.novelRoutes || {}) },
      protection: this.mergeProtection(a.protection, b.protection),
    };
  }

  private extractMetadata($: any, base: string, profile?: LearnedProfile): AnyObj {
    const ld = this.extractLdJson($);
    const selectors: AnyObj = {};

    let title = this.norm(ld?.name || ld?.headline || '');
    if (!title) {
      const titlePick = this.pickText($, [
        profile?.selectors?.title,
        'meta[property="og:title"]@content',
        'meta[name="twitter:title"]@content',
        'h1.book-name', 'h1.book-title', 'h1.novel-title', '.book-name h1', '.book-title h1',
        'h1', '[itemprop="name"]', 'title',
      ]);
      title = titlePick.value;
      if (titlePick.selector) selectors.title = titlePick.selector;
    }
    title = this.cleanTitle(title, $);

    let summary = this.norm(ld?.description || '');
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
      if (summaryPick.selector) selectors.summary = summaryPick.selector;
    }
    if (!summary) summary = this.norm($('meta[name="description"]').attr('content'));
    if (summary.length > 8000) summary = summary.slice(0, 8000);

    let author = '';
    if (ld?.author) {
      if (typeof ld.author === 'string') author = this.norm(ld.author);
      else if (Array.isArray(ld.author)) author = this.norm(ld.author.map((x: any) => x?.name || x).join(', '));
      else author = this.norm(ld.author?.name || '');
    }
    if (!author) {
      const authorPick = this.pickText($, [
        profile?.selectors?.author,
        '[rel="author"]', '[itemprop="author"]', '.author', '.book-author', '.writer',
        '.novel-author', '[class*="author"]', '[class*="writer"]', 'meta[name="author"]@content',
      ]);
      author = authorPick.value.replace(/^(author|作者|作家|writer)\s*[:：]?\s*/i, '');
      if (authorPick.selector) selectors.author = authorPick.selector;
    }
    if (author.length > 160) author = author.slice(0, 160);

    let cover = this.resolveAgainst(this.extractLdImage(ld), base);
    if (!cover) {
      const coverPick = this.pickUrlAttr($, base, [
        profile?.selectors?.cover,
        '.book-cover img@src', '.novel-cover img@src', '.cover img@src',
        '.book-img img@src', '.book-image img@src', '.bookpic img@src', '.book-pic img@src',
        '.detail-cover img@src', '.novel-info img@src', '.book-info img@src',
        '[itemprop="image"]@src', '[class*="cover"] img@src',
        'meta[property="og:image"]@content',
        'meta[name="twitter:image"]@content',
      ]);
      cover = coverPick.value;
      if (coverPick.selector) selectors.cover = coverPick.selector;
    }
    if (!cover) cover = this.scoreImagesForCover($, base);

    return { title, summary, author, cover, selectors };
  }

  private extractLdJson($: any): any {
    const objects: any[] = [];
    $('script[type="application/ld+json"]').each((_i: number, el: any) => {
      const raw = $(el).contents().text();
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw.trim());
        this.flattenLd(parsed, objects);
      } catch (_) {}
    });
    if (!objects.length) return null;
    const score = (obj: any) => {
      const type = Array.isArray(obj?.['@type']) ? obj['@type'].join(' ') : String(obj?.['@type'] || '');
      let s = 0;
      if (/(Book|Novel|CreativeWork|Article)/i.test(type)) s += 10;
      if (obj?.name || obj?.headline) s += 4;
      if (obj?.description) s += 3;
      if (obj?.image) s += 2;
      if (obj?.author) s += 2;
      return s;
    };
    return objects.sort((a, b) => score(b) - score(a))[0];
  }

  private flattenLd(value: any, out: any[]): void {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(v => this.flattenLd(v, out));
      return;
    }
    if (typeof value !== 'object') return;
    out.push(value);
    if (Array.isArray(value['@graph'])) value['@graph'].forEach((v: any) => this.flattenLd(v, out));
    if (Array.isArray(value.itemListElement)) value.itemListElement.forEach((v: any) => this.flattenLd(v?.item || v, out));
  }

  private extractLdImage(ld: any): string | undefined {
    if (!ld?.image) return undefined;
    if (typeof ld.image === 'string') return ld.image;
    if (Array.isArray(ld.image)) {
      const first = ld.image[0];
      return typeof first === 'string' ? first : first?.url || first?.contentUrl;
    }
    return ld.image.url || ld.image.contentUrl;
  }

  private pickText($: any, rawSelectors: Array<string | undefined>): { value: string; selector?: string } {
    for (const raw of rawSelectors.filter(Boolean) as string[]) {
      const spec = this.parseSelectorSpec(raw);
      try {
        const node = $(spec.selector).first();
        const value = this.norm(spec.attr ? node.attr(spec.attr) : node.text());
        if (value) return { value, selector: raw };
      } catch (_) {}
    }
    return { value: '' };
  }

  private pickLongText($: any, rawSelectors: Array<string | undefined>): { value: string; selector?: string } {
    let best = { value: '', selector: undefined as string | undefined, score: 0 };
    for (const raw of rawSelectors.filter(Boolean) as string[]) {
      const spec = this.parseSelectorSpec(raw);
      try {
        $(spec.selector).each((_i: number, el: any) => {
          const value = this.norm(spec.attr ? $(el).attr(spec.attr) : $(el).text());
          if (value.length < 20) return;
          const linkText = this.norm($(el).find('a').text()).length;
          const signal = this.norm(`${raw} ${$(el).attr('class') || ''} ${$(el).attr('id') || ''}`).toLowerCase();
          let score = Math.min(value.length, 6000) - linkText * 1.1;
          if (/(summary|synopsis|intro|description|desc|简介|簡介|内容简介|內容簡介|书籍简介|作品简介)/i.test(signal)) score += 900;
          if (/(chapter|catalog|directory|comment|review|recommend|目录|章|评论)/i.test(signal)) score -= 1000;
          if (value.length > 6000) score -= 600;
          if (score > best.score) best = { value, selector: raw, score };
        });
      } catch (_) {}
    }
    return { value: best.value, selector: best.selector };
  }

  private pickUrlAttr($: any, base: string, rawSelectors: Array<string | undefined>): { value?: string; selector?: string } {
    for (const raw of rawSelectors.filter(Boolean) as string[]) {
      const spec = this.parseSelectorSpec(raw);
      try {
        const node = $(spec.selector).first();
        const attrs = spec.attr ? [spec.attr] : ['src', 'data-src', 'data-original', 'content'];
        for (const attr of attrs) {
          const value = this.resolveAgainst(node.attr(attr), base);
          if (value) return { value, selector: raw };
        }
      } catch (_) {}
    }
    return {};
  }

  private parseSelectorSpec(raw: string): { selector: string; attr?: string } {
    const match = raw.match(/^(.*)@([a-zA-Z0-9_:-]+)$/);
    return match ? { selector: match[1], attr: match[2] } : { selector: raw };
  }

  private scoreImagesForCover($: any, base: string): string | undefined {
    let best: { url?: string; score: number } = { score: -999 };
    $('img').each((_i: number, el: any) => {
      const node = $(el);
      const raw = node.attr('data-src') || node.attr('data-original') || node.attr('src');
      const url = this.resolveAgainst(raw, base);
      if (!url) return;
      const signal = this.norm([
        node.attr('class'), node.attr('id'), node.attr('alt'), node.attr('title'),
        node.parent().attr('class'), node.closest('figure,div,section').attr('class'),
      ].filter(Boolean).join(' ')).toLowerCase();
      let score = 0;
      if (/(cover|book|novel|poster|fengmian|fm|封面)/i.test(signal)) score += 12;
      if (/(logo|avatar|icon|banner|advert|qr|二维码)/i.test(signal)) score -= 12;
      const width = parseInt(node.attr('width') || '0', 10);
      const height = parseInt(node.attr('height') || '0', 10);
      if (width > 80 && height > 120) score += 4;
      if (height > width && height > 0) score += 2;
      if (score > best.score) best = { url, score };
    });
    return best.score >= 2 ? best.url : undefined;
  }

  private cleanTitle(title: string, $: any): string {
    let out = this.norm(title);
    const siteName = this.norm($('meta[property="og:site_name"]').attr('content'));
    if (siteName && out.length > siteName.length + 2) {
      out = out.replace(new RegExp('\\s*[-_|–—]\\s*' + this.escapeRegExp(siteName) + '\\s*$', 'i'), '');
    }
    return this.norm(out);
  }

  private discoverCatalogLinks($: any, base: string): string[] {
    const scored: Array<{ url: string; score: number }> = [];
    const seen = new Set<string>();
    $('a[href]').each((_i: number, el: any) => {
      const a = $(el);
      const href = this.resolveAgainst(a.attr('href'), base);
      if (!href || seen.has(href)) return;
      let u: URL;
      try { u = new URL(href); } catch (_) { return; }
      const bu = new URL(base);
      if (!this.sameSiteHost(u.hostname, bu.hostname)) return;
      const text = this.norm(a.text());
      const signal = `${text} ${u.pathname} ${a.attr('class') || ''} ${a.attr('id') || ''}`;
      let score = 0;
      if (/(目录|章節|章节|全部章节|作品目录|chapter\s*list|chapters|catalog|catalogue|table\s*of\s*contents|toc)/i.test(signal)) score += 15;
      if (/(chapter\/list|chapter-list|chapters|catalog|catalogue|directory|toc)/i.test(u.pathname)) score += 8;
      if (/(login|register|comment|download|app)/i.test(signal)) score -= 10;
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

    return scored.sort((a, b) => b.score - a.score).map(x => x.url).slice(0, 5);
  }

  private findBestChapterSelector($: any, base: string): string | undefined {
    const candidates = [
      '[class*="chapter"] a[href]', '[id*="chapter"] a[href]',
      '[class*="catalog"] a[href]', '[id*="catalog"] a[href]',
      '[class*="directory"] a[href]', '[id*="directory"] a[href]',
      '[class*="volume"] a[href]', '.listmain a[href]', '#list a[href]',
      'ul a[href]', 'ol a[href]',
    ];
    let best: { selector?: string; score: number; count: number } = { score: 0, count: 0 };
    for (const selector of candidates) {
      let count = 0;
      let total = 0;
      try {
        $(selector).each((_i: number, el: any) => {
          const a = $(el);
          const href = this.chapterHref(a, base);
          if (!href) return;
          const text = this.norm(a.text());
          const score = this.chapterLinkScore(text, href, a);
          if (score >= 4) {
            count++;
            total += score;
          }
        });
      } catch (_) {}
      const score = total + count * 2;
      if (count >= 3 && score > best.score) best = { selector, score, count };
    }
    return best.selector;
  }

  private extractChapterLinks($: any, base: string, preferredSelector?: string): ChapterCandidate[] {
    const seen = new Set<string>();
    const out: ChapterCandidate[] = [];
    let order = 0;
    const selectors = ['a[href]'];

    for (const selector of selectors) {
      try {
        $(selector).each((_i: number, el: any) => {
          const a = $(el);
          const href = this.chapterHref(a, base);
          if (!href || seen.has(href)) return;
          let u: URL;
          try { u = new URL(href); } catch (_) { return; }
          const bu = new URL(base);
          if (!this.sameSiteHost(u.hostname, bu.hostname)) return;
          const text = this.norm(a.text());
          if (!text || text.length > 220) return;
          const score = this.chapterLinkScore(text, href, a);
          if (score < 4) return;
          seen.add(href);
          const info = this.extractChapterNumber(text, href);
          out.push({ name: text, path: href, order: order++, ...info });
        });
      } catch (_) {}
    }
    return out;
  }

  private chapterLinkScore(text: string, href: string, a: any): number {
    if (!text) return -99;
    let score = 0;
    const path = (() => { try { return new URL(href).pathname; } catch (_) { return href; } })();
    const chapterText = /(第\s*[0-9零〇一二两三四五六七八九十百千万]+\s*[章节回話话]|chapter\s*[0-9ivxlcdm]+|chap(?:ter)?\.?\s*\d+|cap[ií]tulo\s*\d+|epis[oó]dio\s*\d+|\b\d+\s*[章节回])/i;
    if (chapterText.test(text)) score += 9;
    if (/(chapter|chapitre|capitulo|capítulo|episode|reader|read|\/\d{2,}(?:\.html?)?$|\/\d+\/\d+)/i.test(path)) score += 4;
    const signal = this.norm([
      a.attr?.('class'), a.parent?.().attr?.('class'), a.parent?.().parent?.().attr?.('class'),
      a.closest?.('ul,ol,div,section').attr?.('class'), a.closest?.('ul,ol,div,section').attr?.('id'),
    ].filter(Boolean).join(' '));
    if (/(chapter|catalog|directory|toc|volume|list|目录|章节|章)/i.test(signal)) score += 4;
    if (/^(下一|上一|下一页|上一页|next|prev|previous|pr[oó]ximo|anterior|首页|home)$/i.test(text)) score -= 10;
    if (/(login|register|comment|download|vote|author|作者|书架)/i.test(text)) score -= 5;
    return score;
  }

  private async extractChaptersDeep($: any, novelUrl: string, profile: LearnedProfile): Promise<{ chapters: any[]; catalogUrl?: string; chapterSelector?: string }> {
    let chapterSelector = profile?.selectors?.chapterLink || this.findBestChapterSelector($, novelUrl);
    let candidates = this.extractChapterLinks($, novelUrl, chapterSelector);
    const savedRoute = this.novelRoute(profile, novelUrl);
    const catalogLinks = this.uniqueStrings([
      savedRoute?.catalogUrl || '',
      ...this.discoverCatalogLinks($, novelUrl),
    ]).filter(Boolean);
    let usedCatalog = '';

    if (catalogLinks.length && (savedRoute?.catalogUrl || candidates.length < 120 || this.hasLargeChapterGaps(candidates))) {
      const batch = catalogLinks.slice(0, 4);
      const results = await Promise.all(batch.map(async catalogUrl => {
        try { return { catalogUrl, deep: await this.fetchCatalogPages(catalogUrl, chapterSelector) }; } catch (_) { return null; }
      }));
      for (const row of results) {
        if (!row) continue;
        const deep = row.deep;
        const merged = this.mergeChapterCandidates(candidates, deep.items || []);
        if (deep.items.length >= candidates.length || this.chapterCoverageScore(merged) > this.chapterCoverageScore(candidates)) {
          candidates = merged; usedCatalog = row.catalogUrl; if (deep.chapterSelector) chapterSelector = deep.chapterSelector;
        }
        if (!this.hasLargeChapterGaps(candidates) && candidates.length >= 120) break;
      }
    }
    if (this.hasLargeChapterGaps(candidates)) {
      const recovery = this.catalogRecoveryUrls(usedCatalog || catalogLinks[0] || novelUrl).slice(0, 4);
      const results = await Promise.all(recovery.map(async recoveryUrl => {
        try { return await this.fetchCatalogPages(recoveryUrl, undefined); } catch (_) { return null; }
      }));
      for (const deep of results) {
        if (!deep) continue;
        candidates = this.mergeChapterCandidates(candidates, deep.items || []);
        if (!this.hasLargeChapterGaps(candidates)) break;
      }
    }

    const sorted = this.sortChapters(candidates).slice(0, 20000);
    const chapters = sorted.map((x, i) => ({ name: x.name, path: x.path, chapterNumber: Number.isFinite(x.number) && x.numberSource === 'text' ? x.number : i + 1 }));
    return { chapters, ...(usedCatalog ? { catalogUrl: usedCatalog } : {}), ...(chapterSelector ? { chapterSelector } : {}) };
  }

  private mergeChapterCandidates(...groups: ChapterCandidate[][]): ChapterCandidate[] {
    const map = new Map<string, ChapterCandidate>(); let order = 0;
    for (const group of groups) for (const item of (group || [])) {
      if (!item?.path) continue;
      const prev = map.get(item.path); const candidate = {...item, order:Number.isFinite(item.order)?item.order:order++};
      if (!prev || (candidate.name || '').length > (prev.name || '').length) map.set(item.path,candidate);
    }
    return Array.from(map.values());
  }
  private chapterCoverageScore(items: ChapterCandidate[]): number {
    const values=items.filter(x=>x.numberSource==='text'&&Number.isFinite(x.number)).map(x=>x.number as number);
    if(values.length<3)return items.length; const u=[...new Set(values)].sort((a,b)=>a-b); const span=Math.max(1,u[u.length-1]-u[0]+1);
    return items.length+(u.length/span)*5000;
  }
  private hasLargeChapterGaps(items: ChapterCandidate[]): boolean {
    const values=items.filter(x=>x.numberSource==='text'&&Number.isFinite(x.number)).map(x=>x.number as number);
    if(values.length<8)return false; const u=[...new Set(values)].sort((a,b)=>a-b); let biggest=0,holes=0;
    for(let i=1;i<u.length;i++){const gap=u[i]-u[i-1]-1;if(gap>0)holes+=gap;if(gap>biggest)biggest=gap;}
    const span=Math.max(1,u[u.length-1]-u[0]+1),coverage=u.length/span;
    return biggest>=8||(span>=50&&coverage<.82)||holes>Math.max(20,u.length*.25);
  }
  private catalogRecoveryUrls(url: string): string[] {
    const out:string[]=[]; const add=(v?:string)=>{if(v&&!out.includes(v))out.push(v)}; add(url);
    try{const u=new URL(url),p=u.pathname;if(/^\/amp\//i.test(p)){const x=new URL(u.href);x.pathname=p.replace(/^\/amp/i,'');add(x.href)}else{const x=new URL(u.href);x.pathname='/amp'+(p.startsWith('/')?p:'/'+p);add(x.href)}if(/\/n\/[^/]+\/?$/i.test(p)){const x=new URL(u.href);x.pathname=p.replace(/\/?$/,'/list.html');add(x.href);const y=new URL(u.href);y.pathname='/amp'+p.replace(/\/?$/,'/list.html');add(y.href)}if(/\/n\/[^/]+\/list\.html$/i.test(p)){const x=new URL(u.href);x.pathname=p.replace('/n/','/amp/n/');add(x.href)}}catch(_){}
    return out;
  }
  private compactCatalogHtml(html: string): string {
    const raw = String(html || '');
    if (raw.length <= 900000) return raw;
    const stripped = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
    const lower = stripped.toLowerCase(); let best = ''; let bestScore = 0;
    const score = (fragment: string) => (fragment.match(/<a\b/gi) || []).length + (fragment.match(/(?:chapter|chapitre|cap[ií]tulo|第\s*[0-9零〇一二两三四五六七八九十百千万]+\s*[章节回話话]|章节|章節)/gi) || []).length * 3;
    let pos = 0;
    while ((pos = lower.indexOf('<nav', pos)) >= 0) { const end = lower.indexOf('</nav>', pos); if (end < 0) break; const fragment = stripped.slice(pos, Math.min(stripped.length, end + 6)); const sc = score(fragment); if (sc > bestScore) { best = fragment; bestScore = sc; } pos = end + 6; }
    for (const marker of ['chapter-list','chapterlist','chapter_list','catalog','catalogue','directory','listmain','toc','章节','章節','目录','目錄']) { let i = lower.indexOf(marker), count = 0; while (i >= 0 && count++ < 6) { const fragment = stripped.slice(Math.max(0, i - 24000), Math.min(stripped.length, i + 1800000)); const sc = score(fragment); if (sc > bestScore) { best = fragment; bestScore = sc; } i = lower.indexOf(marker, i + marker.length); } }
    if (best && bestScore >= 12) return best;
    return stripped.length <= Math.min(4000000, raw.length * 0.65) ? stripped : raw;
  }

  private findNextCatalogPageRaw(html: string, base: string, visited: Set<string>): string | undefined {
    const re = /<a\b([^>]{0,2500})>([\s\S]*?)<\/a>/gi; let m: RegExpExecArray | null; let count = 0;
    while ((m = re.exec(String(html || ''))) && count++ < 12000) {
      const attrs = m[1] || ''; const text = this.norm(String(m[2] || '').replace(/<[^>]+>/g, ' ')); const rel = (attrs.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
      if (!/\bnext\b/i.test(rel) && !/^(下一页|下一頁|下页|下頁|next\s*page|next|›|»|→)$/i.test(text)) continue;
      const href = (attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1]; const resolved = this.resolveAgainst(href, base); if (resolved && !visited.has(resolved)) return resolved;
    }
    return undefined;
  }

  private async fetchCatalogPages(startUrl: string, preferredSelector?: string): Promise<{ items: ChapterCandidate[]; chapterSelector?: string }> {
    const key = `${String(startUrl || '')}|${String(preferredSelector || '')}`;
    const running = this.catalogFetchInFlight.get(key); if (running) return await running;
    const task = this.fetchCatalogPagesFresh(startUrl, preferredSelector).finally(() => this.catalogFetchInFlight.delete(key));
    this.catalogFetchInFlight.set(key, task); return await task;
  }

  private async fetchCatalogPagesFresh(startUrl: string, preferredSelector?: string): Promise<{ items: ChapterCandidate[]; chapterSelector?: string }> {
    const visited = new Set<string>(); const all: ChapterCandidate[] = []; let url: string | undefined = startUrl; let selector = preferredSelector; let page = 0;
    while (url && page < 40 && all.length < 20000) {
      if (visited.has(url)) break; visited.add(url); const html = await this.getText(url); const $ = loadCheerio(this.compactCatalogHtml(html));
      const pageSelector = this.findBestChapterSelector($, url) || selector; if (!selector && pageSelector) selector = pageSelector;
      const items = this.mergeChapterCandidates(this.extractChapterLinks($, url, pageSelector), this.extractChapterLinks($, url, undefined)); const existing = new Set(all.map(x => x.path)); for (const item of items) if (!existing.has(item.path)) all.push(item);
      page++; if (items.length < 5) break; url = this.findNextCatalogPage($, url, visited) || this.findNextCatalogPageRaw(html, url, visited);
    }
    return { items: all, ...(selector ? { chapterSelector: selector } : {}) };
  }

  private findNextCatalogPage($: any, base: string, visited: Set<string>): string | undefined {
    const direct = $('a[rel="next"]').first().attr('href');
    const resolvedDirect = this.resolveAgainst(direct, base);
    if (resolvedDirect && !visited.has(resolvedDirect)) return resolvedDirect;

    let found: string | undefined;
    $('a[href]').each((_i: number, el: any) => {
      if (found) return;
      const a = $(el);
      const text = this.norm(a.text());
      const cls = this.norm(`${a.attr('class') || ''} ${a.attr('aria-label') || ''}`);
      if (!/(下一页|下页|next\s*page|next|›|»|下一頁)/i.test(`${text} ${cls}`)) return;
      const href = this.resolveAgainst(a.attr('href'), base);
      if (href && !visited.has(href)) found = href;
    });
    return found;
  }

  private sortChapters(input: ChapterCandidate[]): ChapterCandidate[] {
    const map = new Map<string, ChapterCandidate>();
    for (const item of input) {
      const previous = map.get(item.path);
      if (!previous || item.name.length > previous.name.length) map.set(item.path, item);
    }
    const items = Array.from(map.values()).sort((a, b) => a.order - b.order);
    if (items.length < 2) return items;

    // Textual chapter numbers are strong evidence and are safe to sort numerically.
    const explicit = items.filter(x => x.numberSource === 'text' && Number.isFinite(x.number));
    const explicitCoverage = explicit.length / items.length;
    const volumeCoverage = items.filter(x => Number.isFinite(x.volume)).length / items.length;

    if (explicitCoverage >= 0.35) {
      if (volumeCoverage >= 0.25) {
        return items.sort((a, b) => {
          const av = Number.isFinite(a.volume) ? a.volume! : 0;
          const bv = Number.isFinite(b.volume) ? b.volume! : 0;
          if (av !== bv) return av - bv;
          const an = a.numberSource === 'text' && Number.isFinite(a.number) ? a.number! : Number.MAX_SAFE_INTEGER;
          const bn = b.numberSource === 'text' && Number.isFinite(b.number) ? b.number! : Number.MAX_SAFE_INTEGER;
          if (an !== bn) return an - bn;
          return a.order - b.order;
        });
      }
      return items.sort((a, b) => {
        const an = a.numberSource === 'text' && Number.isFinite(a.number) ? a.number! : Number.MAX_SAFE_INTEGER;
        const bn = b.numberSource === 'text' && Number.isFinite(b.number) ? b.number! : Number.MAX_SAFE_INTEGER;
        if (an !== bn) return an - bn;
        return a.order - b.order;
      });
    }

    // URL numbers are weak evidence (they may be database IDs). Only use them to
    // determine whether the DOM list itself is descending, never as an arbitrary sort key.
    const urlNumbered = items.filter(x => x.numberSource === 'url' && Number.isFinite(x.number));
    if (urlNumbered.length >= Math.max(5, Math.floor(items.length * 0.6))) {
      let asc = 0;
      let desc = 0;
      let prev: number | undefined;
      for (const item of items) {
        if (item.numberSource !== 'url' || !Number.isFinite(item.number)) continue;
        const n = item.number as number;
        if (prev !== undefined) {
          if (n > prev) asc++;
          else if (n < prev) desc++;
        }
        prev = n;
      }
      if (desc >= Math.max(3, asc * 2)) return [...items].reverse();
    }

    // With no reliable numbering, preserve the site's catalog order.
    return items;
  }

  private extractChapterNumber(text: string, href: string): { number?: number; volume?: number; numberSource?: 'text' | 'url' } {
    const volumeMatch = text.match(/第\s*([0-9零〇一二两三四五六七八九十百千万]+)\s*卷/i)
      || text.match(/(?:volume|vol\.?|tomo|tom|часть)\s*([0-9]+)/i);
    const chapterMatch = text.match(/第\s*([0-9零〇一二两三四五六七八九十百千万]+)\s*[章节回話话]/i)
      || text.match(/(?:chapter|chap(?:ter)?\.?|cap[ií]tulo|epis[oó]dio|chapitre|kapitel|rozdzia[lł]|глава|розділ|bölüm|chương|บทที่|ตอนที่)\s*[:#.-]?\s*([0-9]+)/i)
      || text.match(/^\s*([0-9]+)\s*[.、:_-]/);
    let number = chapterMatch ? this.parseNumberish(chapterMatch[1]) : undefined;
    let numberSource: 'text' | 'url' | undefined = Number.isFinite(number) ? 'text' : undefined;
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
      } catch (_) {}
    }
    return {
      ...(Number.isFinite(number) ? { number, numberSource } : {}),
      ...(Number.isFinite(volume) ? { volume } : {}),
    };
  }

  private parseNumberish(raw: string): number | undefined {
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    return this.chineseNumber(raw);
  }

  private chineseNumber(raw: string): number | undefined {
    const s = raw.replace(/〇/g, '零');
    const digit: AnyObj = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const unit: AnyObj = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
    if (!s) return undefined;
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
      } else if (ch in unit) {
        recognized = true;
        const u = unit[ch];
        if (u === 10000) {
          section = (section + num) * u;
          total += section;
          section = 0;
          num = 0;
        } else {
          if (num === 0) num = 1;
          section += num * u;
          num = 0;
        }
      }
    }
    if (!recognized) return undefined;
    return total + section + num;
  }

  private discoverSearchTemplates($: any, base: string): string[] {
    const templates: string[] = [];
    $('form').each((_i: number, el: any) => {
      const form = $(el);
      let key = '';
      form.find('input[name]').each((_j: number, input: any) => {
        if (key) return;
        const name = String($(input).attr('name') || '');
        const type = String($(input).attr('type') || 'text');
        if (/^(q|s|search|keyword|keywords|key|kw|wd|query|searchkey|search_key|searchword)$/i.test(name) && !/hidden|submit|button/i.test(type)) key = name;
      });
      if (!key) return;
      const method = String(form.attr('method') || 'get').toLowerCase();
      if (method !== 'get') return;
      const action = this.resolveAgainst(form.attr('action') || base, base);
      if (!action) return;
      try {
        const u = new URL(action);
        u.searchParams.set(key, '__TH_QUERY__');
        templates.push(u.href.replace('__TH_QUERY__', '{query}'));
      } catch (_) {}
    });
    return this.uniqueStrings(templates).slice(0, 6);
  }

  private async discoverSiteNovels(profile: LearnedProfile, pageNo: number): Promise<any[]> {
    const collected: any[] = [];
    const seenPages = new Set<string>();
    const candidates: Array<{url:string; score:number}> = [];
    const addPage = (url?: string, score = 0) => {
      if (!url || seenPages.has(url)) return;
      try {
        const u = new URL(url);
        if (!this.sameSiteHost(u.hostname, profile.host)) return;
        seenPages.add(url);
        candidates.push({url, score});
      } catch (_) {}
    };
    (profile.listingUrls || []).forEach((u, i) => addPage(this.pageVariant(u, pageNo), 100 - i));
    for (const origin of this.siteOrigins(profile)) {
      const common = ['/', '/all/', '/all', '/rank/', '/rank', '/ranking/', '/ranking', '/books/', '/books', '/novels/', '/novels', '/library/', '/library', '/book/', '/book', '/category/', '/category', '/list/', '/list'];
      common.forEach((path, i) => addPage(this.pageVariant(origin + path, pageNo), 60 - i));
    }
    if (profile.seedUrl) addPage(profile.seedUrl, -100);
    candidates.sort((a,b)=>b.score-a.score);
    const learnedListingUrls: string[] = [];
    for (const page of candidates.slice(0, pageNo === 1 ? 12 : 8)) {
      try {
        const html = await this.getText(page.url);
        const $ = loadCheerio(html);
        learnedListingUrls.push(...this.discoverListingLinks($, page.url));
        const items = this.extractNovelCandidates($, page.url, '');
        collected.push(...items);
        if (this.dedupeNovelItems(collected).length >= 50) break;
      } catch (_) {}
    }
    if (learnedListingUrls.length) {
      await this.refineProfile({host: profile.host, listingUrls: this.uniqueStrings([...(profile.listingUrls || []), ...learnedListingUrls]).slice(0,16)} as any);
    }
    let results = this.dedupeNovelItems(collected).filter(x => this.sameSiteUrl(x.path, profile));
    if (!results.length && profile.seedUrl) {
      try {
        const html = await this.getText(profile.seedUrl);
        const $ = loadCheerio(html);
        const md = this.extractMetadata($, profile.seedUrl, profile);
        if (md.title) results = [{name: md.title, path: profile.seedUrl, ...(md.cover ? {cover: md.cover} : {})}];
      } catch (_) {}
    }
    return results.slice(0,40);
  }

  private discoverListingLinks($: any, base: string): string[] {
    const scored: Array<{url:string;score:number}> = [];
    const seen = new Set<string>();
    $('a[href]').each((_i: number, el: any) => {
      const a = $(el);
      const href = this.resolveAgainst(a.attr('href'), base);
      if (!href || seen.has(href)) return;
      let u: URL; let bu: URL;
      try { u = new URL(href); bu = new URL(base); } catch (_) { return; }
      if (!this.sameSiteHost(u.hostname, bu.hostname)) return;
      const text = this.norm(a.text());
      const signal = `${text} ${u.pathname} ${a.attr('class') || ''} ${a.attr('id') || ''}`;
      let score = 0;
      if (/(书库|書庫|全部作品|全部小说|小說|小说|排行榜|排行|榜单|榜單|分类|分類|browse|discover|all\s*books|all\s*novels|novels|books|library|ranking|rank)/i.test(signal)) score += 12;
      if (/(\/all(?:\/|$)|\/rank(?:ing)?(?:\/|$)|\/books?(?:\/|$)|\/novels?(?:\/|$)|\/library(?:\/|$)|\/category(?:\/|$)|\/list(?:\/|$))/i.test(u.pathname)) score += 8;
      if (/(login|register|author|writer|forum|comment|download|app|help)/i.test(signal)) score -= 12;
      if (score >= 8) { seen.add(href); scored.push({url: href, score}); }
    });
    return scored.sort((a,b)=>b.score-a.score).map(x=>x.url).slice(0,12);
  }

  private siteOrigins(profile: LearnedProfile): string[] {
    const out: string[] = [];
    const add = (v?: string) => { if (v) { const x=v.replace(/\/$/, ''); if (!out.includes(x)) out.push(x); } };
    add(profile.origin);
    try {
      const host = profile.host || new URL(profile.origin).hostname;
      const root = this.registrableDomain(host);
      if (root && root !== host) { add(`https://${root}`); add(`https://www.${root}`); }
    } catch (_) {}
    return out;
  }

  private registrableDomain(host: string): string {
    const parts = String(host || '').toLowerCase().split('.').filter(Boolean);
    if (parts.length <= 2) return parts.join('.');
    const suffix2 = parts.slice(-2).join('.');
    const twoLevel = new Set(['co.uk','org.uk','com.br','com.cn','com.tw','com.hk','com.au','com.sg','co.jp','co.kr','com.tr','com.ua','co.id','com.vn','co.th','com.mx','com.ar','com.co','com.pe','com.my','co.nz']);
    return twoLevel.has(suffix2) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
  }

  private sameSiteHost(a: string, b: string): boolean {
    const ah = String(a || '').toLowerCase().replace(/^www\./, '');
    const bh = String(b || '').toLowerCase().replace(/^www\./, '');
    return ah === bh || this.registrableDomain(ah) === this.registrableDomain(bh);
  }

  private sameSiteUrl(url: string, profile: LearnedProfile): boolean {
    try { return this.sameSiteHost(new URL(url).hostname, profile.host); } catch (_) { return false; }
  }

  private pageVariant(rawUrl: string, pageNo: number): string {
    if (pageNo <= 1) return rawUrl;
    try {
      const u = new URL(rawUrl);
      const keys = ['page','p','pageNo','pageNum'];
      const existing = keys.find(k => u.searchParams.has(k));
      if (existing) u.searchParams.set(existing, String(pageNo)); else u.searchParams.set('page', String(pageNo));
      return u.href;
    } catch (_) { return rawUrl; }
  }

  private async searchProfile(profile: LearnedProfile, query: string, pageNo: number): Promise<any[]> {
    const templates = this.uniqueStrings([
      ...(profile.searchTemplates || []),
      `${profile.origin}/search?keyword={query}`,
      `${profile.origin}/search?q={query}`,
      `${profile.origin}/search/?q={query}`,
      `${profile.origin}/?s={query}`,
      `${profile.origin}/search?searchkey={query}`,
      `${profile.origin}/search?wd={query}`,
      `${profile.origin}/search.html?keyword={query}`,
      `${profile.origin}/soushu/{query}.html`,
      `${profile.origin}/soushu/{query}`,
      `${profile.origin}/search/{query}`,
      ...this.siteOrigins(profile).flatMap(origin => [
        `${origin}/soushu/{query}.html`, `${origin}/search?keyword={query}`, `${origin}/search?q={query}`
      ]),
    ]);

    for (const template of templates.slice(0, 10)) {
      const url = this.expandSearchTemplate(template, query, pageNo);
      try {
        const html = await this.getText(url);
        const $ = loadCheerio(html);
        const learnedTemplates = this.discoverSearchTemplates($, url);
        if (learnedTemplates.length) {
          await this.refineProfile({ host: profile.host, searchTemplates: this.uniqueStrings([...(profile.searchTemplates || []), ...learnedTemplates]) });
        }
        const results = this.extractNovelCandidates($, url, query)
          .filter(x => {
            try { return new URL(x.path).hostname === profile.host; } catch (_) { return false; }
          });
        if (results.length) return results.slice(0, 40);
      } catch (_) {}
    }
    return [];
  }

  private expandSearchTemplate(template: string, query: string, pageNo: number): string {
    let url = template.replace(/\{query\}/g, encodeURIComponent(query));
    if (pageNo > 1) {
      try {
        const u = new URL(url);
        const pageKeys = ['page', 'p', 'pageNo', 'pageNum'];
        const existing = pageKeys.find(k => u.searchParams.has(k));
        if (existing) u.searchParams.set(existing, String(pageNo));
        else u.searchParams.set('page', String(pageNo));
        url = u.href;
      } catch (_) {}
    }
    return url;
  }

  private extractNovelCandidates($: any, base: string, query: string): any[] {
    const byHref = new Map<string, {item:any;score:number}>();
    const q = String(query || '').toLowerCase();
    const genericLabel = /^(首页|首頁|书库|書庫|小说|小說|作品|分类|分類|排行|排行榜|榜单|榜單|更多|更多作品|全部|全部作品|目录|目錄|章节|章節|登录|注册|home|books?|novels?|library|rank(?:ing)?|more|details?|book\s*details?)$/i;
    $('a[href]').each((_i: number, el: any) => {
      const a = $(el);
      const href = this.resolveAgainst(a.attr('href'), base);
      if (!href) return;
      const text = this.norm(a.attr('title') || a.text());
      if (text.length < 2 || text.length > 140) return;
      const path = (() => { try { const u = new URL(href); return u.pathname + u.search; } catch (_) { return ''; } })();
      if (/(chapter|read|reader|episode|\/\d+\/\d+)/i.test(path) && this.chapterLinkScore(text, href, a) >= 4) return;
      let score = 0;
      if (/(book|novel|detail|info|story|作品|xiaoshuo|bookId)/i.test(path)) score += 6;
      const container = a.closest('li,article,div,section');
      const parentSignal = this.norm([a.attr('class'), a.parent().attr('class'), container.attr('class'), container.attr('id')].filter(Boolean).join(' '));
      if (/(book|novel|result|item|search|recommend|rank|work|story)/i.test(parentSignal)) score += 5;
      if (a.closest('h1,h2,h3,h4,h5').length) score += 4;
      if (a.closest('header,nav,footer').length) score -= 12;
      if (genericLabel.test(text)) score -= 12;
      if (q && text.toLowerCase().includes(q)) score += 7;
      const img = container.find('img').first();
      const cover = this.resolveAgainst(img.attr('data-src') || img.attr('data-original') || img.attr('src'), base);
      if (cover) score += 3;
      const containerText = this.norm(container.text());
      if (containerText.length >= 50 && containerText.length <= 1800) score += 2;
      if (score < 5) return;
      const current = byHref.get(href);
      const item = {name:text,path:href,...(cover?{cover}:{})};
      if (!current || score > current.score || (score === current.score && text.length > current.item.name.length)) byHref.set(href,{item,score});
    });
    return Array.from(byHref.values()).sort((a,b)=>b.score-a.score).map(x=>x.item).slice(0,80);
  }

  private dedupeNovelItems(items: any[]): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of items) {
      const key = String(item?.path || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  private inferNovelUrl($: any, base: string): string | undefined {
    const baseUrl = new URL(base);
    let best: { url?: string; score: number } = { score: 0 };
    $('a[href]').each((_i: number, el: any) => {
      const a = $(el);
      const href = this.resolveAgainst(a.attr('href'), base);
      if (!href) return;
      let u: URL;
      try { u = new URL(href); } catch (_) { return; }
      if (!this.sameSiteHost(u.hostname, baseUrl.hostname)) return;
      const text = this.norm(a.text());
      const signal = `${text} ${u.pathname} ${u.search}`;
      let score = 0;
      if (/(作品详情|书籍详情|小说详情|返回书页|book\s*detail|novel\s*detail|book\s*home)/i.test(text)) score += 15;
      if (/(\/book(?:\/|\?|$)|\/detail(?:\/|\?|$)|\/novel(?:\/|\?|$)|bookId=)/i.test(signal)) score += 8;
      if (/(chapter|read|reader)/i.test(u.pathname)) score -= 7;
      if (score > best.score) best = { url: href, score };
    });
    return best.score >= 7 ? best.url : undefined;
  }

  private mergeProtection(oldValue: any, meta: any): any {
    const old = oldValue && typeof oldValue === 'object' ? oldValue : {};
    const m = meta && typeof meta === 'object' ? meta : {};
    if (!old.cloudflare && !m.cloudflare) return Object.keys(old).length ? old : undefined;
    return {
      ...old,
      cloudflare: Boolean(old.cloudflare || m.cloudflare),
      challenge: m.challenge !== undefined ? Boolean(m.challenge) : Boolean(old.challenge),
      lastStatus: Number(m.status || old.lastStatus || 0) || undefined,
      detectedAt: Number(old.detectedAt || Date.now()),
      lastSeenAt: Date.now(),
    };
  }

  private detectProtection(response: any, html: string, requestUrl: string): any {
    const body = String(html || '');
    const lower = body.slice(0, 180000).toLowerCase();
    const getHeader = (name: string) => {
      try { return String(response?.headers?.get?.(name) || ''); } catch (_) { return ''; }
    };
    const server = getHeader('server').toLowerCase();
    const cfRay = getHeader('cf-ray');
    const cfCache = getHeader('cf-cache-status');
    const headerCloudflare = server.includes('cloudflare') || Boolean(cfRay) || Boolean(cfCache);
    const weakCloudflare = /\/cdn-cgi\/(?:challenge-platform|scripts|images)|cloudflare-static/i.test(lower);
    const challenge = /just a moment\.\.\.|attention required!?\s*\|\s*cloudflare|cf-browser-verification|cf_chl_|challenge-platform|verify you are human|checking if the site connection is secure|enable javascript and cookies to continue|ray id\s*:/i.test(lower);
    return {
      url: requestUrl,
      finalUrl: String(response?.url || requestUrl || ''),
      status: Number(response?.status || 0),
      cloudflare: Boolean(headerCloudflare || weakCloudflare || challenge),
      challenge: Boolean(challenge),
    };
  }

  private chapterHref(a: any, base: string): string | undefined {
    const rawCandidates = [
      a.attr?.('href'), a.attr?.('data-url'), a.attr?.('data-href'), a.attr?.('data-link'),
      a.attr?.('data-chapter-url'), a.attr?.('data-reader-url'), a.attr?.('data-read-url'), a.attr?.('data-target-url'),
    ];
    for (const raw of rawCandidates) {
      const value = String(raw || '').trim();
      if (!value || value === '#' || /^javascript:/i.test(value)) continue;
      const resolved = this.resolveAgainst(value, base);
      if (resolved) return resolved;
    }
    const onclick = String(a.attr?.('onclick') || '');
    const match = onclick.match(/(?:location(?:\.href)?\s*=|window\.open\s*\()\s*['\"]([^'\"]+)['\"]/i)
      || onclick.match(/['\"](https?:\/\/[^'\"]+|\/[^'\"]*(?:chapter|read|reader|episode)[^'\"]*)['\"]/i);
    return match ? this.resolveAgainst(match[1], base) : undefined;
  }

  private extractChapterPayload($: any, html: string, url: string, profile: LearnedProfile): any {
    const rootInfo = this.findMainRoot($, profile?.selectors?.chapterContent);
    const direct = this.extractTextBlocks($, rootInfo.node);
    if (this.isReadableChapterBlocks(direct)) return { blocks: direct, selector: rootInfo.selector, source: 'dom' };

    const embedded = this.extractEmbeddedChapterBlocks($, html);
    if (this.isReadableChapterBlocks(embedded)) return { blocks: embedded, source: 'embedded' };

    const body = this.extractTextBlocks($, $('body').first());
    if (this.isReadableChapterBlocks(body) && this.looksLikeChapterPage($, url)) return { blocks: body, source: 'body' };
    return null;
  }

  private isReadableChapterBlocks(blocks: string[]): boolean {
    const cleaned = (blocks || []).map(v => this.norm(v)).filter(Boolean);
    const total = cleaned.reduce((n, v) => n + v.length, 0);
    if (!cleaned.length || total < 80) return false;
    const sample = cleaned.slice(0, 12).join(' ').toLowerCase();
    if (/just a moment|verify you are human|enable javascript and cookies|attention required.*cloudflare|checking your browser/i.test(sample)) return false;
    if (cleaned.length === 1 && total < 160) return false;
    return true;
  }

  private extractEmbeddedChapterBlocks($: any, html: string): string[] {
    const candidates: Array<{blocks: string[]; score: number}> = [];
    const pushCandidate = (value: any, key = '', bonus = 0) => {
      if (typeof value !== 'string') return;
      const blocks = this.blocksFromPayload(value);
      if (!blocks.length) return;
      const total = blocks.reduce((n, v) => n + v.length, 0);
      if (total < 80) return;
      const keySignal = /(chapter.?content|content|body|text|paragraph|article|reader|html|txt|正文|内容|內容)/i.test(key) ? 1400 : 0;
      const navPenalty = /(summary|description|synopsis|intro|comment|menu|catalog|chapter.?list)/i.test(key) ? 900 : 0;
      candidates.push({ blocks, score: total + Math.min(blocks.length, 120) * 35 + keySignal + bonus - navPenalty });
    };
    const walk = (value: any, key = '', depth = 0): void => {
      if (depth > 9 || value == null) return;
      if (typeof value === 'string') {
        if (value.length >= 80 && (/(chapter.?content|content|body|text|paragraph|article|reader|html|txt|正文|内容|內容)/i.test(key) || value.length >= 450)) pushCandidate(value, key);
        return;
      }
      if (Array.isArray(value)) {
        if (/(paragraph|content|body|text|lines|blocks)/i.test(key) && value.length && value.every(x => typeof x === 'string')) pushCandidate(value.join('\n'), key, 600);
        for (let i = 0; i < Math.min(value.length, 500); i++) walk(value[i], key, depth + 1);
        return;
      }
      if (typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) walk(v, k, depth + 1);
      }
    };
    $('script').each((_i: number, el: any) => {
      const node = $(el);
      const raw = String(node.contents().text() || '').trim();
      if (!raw) return;
      const type = String(node.attr('type') || '').toLowerCase();
      const id = String(node.attr('id') || '').toLowerCase();
      if (/json/.test(type) || /__next_data__|__nuxt_data__|initial-state|initial_state|app-data|page-data/.test(id)) {
        try { walk(JSON.parse(raw), id || type, 0); } catch (_) {}
      }
      const re = /[\"'](chapterContent|chapter_content|contentHtml|content_html|articleBody|body|content|paragraphs|text|txtContent|readerContent)[\"']\s*:\s*(\"(?:\\.|[^\"\\])*\")/gi;
      let m: RegExpExecArray | null; let count = 0;
      while ((m = re.exec(raw)) && count++ < 40) {
        try { pushCandidate(JSON.parse(m[2]), m[1], 800); } catch (_) {}
      }
    });
    if (!candidates.length) {
      const re = /[\"'](chapterContent|chapter_content|contentHtml|content_html|articleBody|txtContent|readerContent)[\"']\s*:\s*(\"(?:\\.|[^\"\\])*\")/gi;
      let m: RegExpExecArray | null; let count = 0;
      while ((m = re.exec(String(html || ''))) && count++ < 30) {
        try { pushCandidate(JSON.parse(m[2]), m[1], 900); } catch (_) {}
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.blocks || [];
  }

  private blocksFromPayload(value: string): string[] {
    let raw = String(value || '').trim();
    if (!raw) return [];
    raw = raw.replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>').replace(/\\n/g, '\n').replace(/\\r/g, '\n');
    if (/<(?:p|div|br|article|section)\b/i.test(raw)) {
      const $$ = loadCheerio(`<div id="__th_payload">${raw}</div>`);
      const blocks = this.extractTextBlocks($$, $$('#__th_payload'));
      if (blocks.length) return blocks;
    }
    raw = loadCheerio(`<div>${raw}</div>`).text();
    let blocks = raw.split(/\n+/).map(v => this.norm(v)).filter(Boolean);
    if (blocks.length < 2 && raw.length > 220) {
      const sentenceLike = raw.match(/[^。！？!?]{10,}[。！？!?]?/g) || [];
      if (sentenceLike.length >= 2) blocks = sentenceLike.map(v => this.norm(v)).filter(Boolean);
    }
    return blocks.slice(0, 2500);
  }

  private discoverChapterContentUrls($: any, base: string): string[] {
    const out: string[] = [];
    const add = (raw: string | undefined) => {
      const url = this.resolveAgainst(raw, base);
      if (!url || url === base || out.includes(url)) return;
      try { if (!this.sameSiteHost(new URL(url).hostname, new URL(base).hostname)) return; } catch (_) { return; }
      out.push(url);
    };
    add($('link[rel="canonical"]').first().attr('href'));
    $('iframe[src],frame[src]').each((_i: number, el: any) => add($(el).attr('src')));
    $('a[href],a[data-url],a[data-href],[data-chapter-url],[data-reader-url]').each((_i: number, el: any) => {
      const a = $(el);
      const text = this.norm(`${a.text()} ${a.attr('class') || ''} ${a.attr('id') || ''}`);
      if (!/(继续阅读|開始閱讀|开始阅读|阅读|read|reader|chapter|正文|content|下一步|continue)/i.test(text)) return;
      add(this.chapterHref(a, base));
    });
    return out.slice(0, 6);
  }

  private looksLikeChapterPage($: any, url: string): boolean {
    const path = new URL(url).pathname;
    if (/(chapter|read|reader|episode)/i.test(path)) return true;
    const root = this.findMainRoot($);
    const blocks = this.extractTextBlocks($, root.node);
    return blocks.length >= 8 && this.extractChapterLinks($, url).length < 5;
  }

  private findMainRoot($: any, preferred?: string): { node: any; selector?: string } {
    if (preferred) {
      try {
        const node = $(preferred).first();
        if (this.norm(node.text()).length > 120) return { node, selector: preferred };
      } catch (_) {}
    }

    const selectors = [
      '#chaptercontent', '#chapter-content', '#chapterContent', '#content', '#articlecontent', '#articleContent', '#readcontent', '#read-content', '#reader-content', '#J_BookRead',
      '.chapter-content', '.chapter_content', '.chapterContent', '.read-content', '.reader-content',
      '.article-content', '.content', '.contentbox', '.readArea', '.readarea', '.reader_box .content', '.reading-content', '.novel-content', '.text-content', '.page-content', '.muye-reader-content', '.reader-main', '.chapter-body',
      '[class*="chapter-content"]', '[class*="read-content"]', '[class*="reader-content"]',
      '[itemprop="articleBody"]', 'article', 'main',
    ];

    let best = { node: $('body').first(), selector: undefined as string | undefined, score: 0 };
    for (const selector of selectors) {
      try {
        $(selector).each((_i: number, el: any) => {
          const node = $(el);
          const textLen = this.norm(node.text()).length;
          const pCount = node.find('p').length;
          const linkLen = this.norm(node.find('a').text()).length;
          const score = textLen + pCount * 130 - linkLen * 1.4;
          if (textLen > 150 && score > best.score) best = { node, selector, score };
        });
      } catch (_) {}
    }

    $('div,section').each((_i: number, el: any) => {
      const node = $(el);
      const text = this.norm(node.text());
      if (text.length < 300) return;
      const pCount = node.find('p').length;
      const brCount = (node.html() || '').match(/<br\b/gi)?.length || 0;
      const linkLen = this.norm(node.find('a').text()).length;
      const signal = this.norm(`${node.attr('class') || ''} ${node.attr('id') || ''}`);
      let score = text.length + pCount * 120 + brCount * 35 - linkLen * 1.8;
      if (/(content|chapter|article|reader|read|正文|contentbox)/i.test(signal)) score += 600;
      if (/(nav|menu|comment|recommend|list|catalog|footer|header|sidebar)/i.test(signal)) score -= 700;
      if (score > best.score) best = { node, selector: this.selectorForElement(node), score };
    });

    return { node: best.node, ...(best.selector ? { selector: best.selector } : {}) };
  }

  private selectorForElement(node: any): string | undefined {
    const id = String(node.attr('id') || '').trim();
    if (id && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)) return '#' + id;
    const classes = String(node.attr('class') || '').trim().split(/\s+/).filter((x: string) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(x));
    if (classes.length) return '.' + classes.slice(0, 2).join('.');
    return undefined;
  }

  private extractTextBlocks($: any, root: any): string[] {
    const clone = root.clone();
    clone.find('script,style,noscript,iframe,nav,form,button,svg,canvas,video,audio').remove();
    clone.find('[class*="ad"],[id*="ad"],.ads,.advertisement,.banner,.navigation,.nav,.footer,.header').remove();

    let blocks: string[] = [];
    clone.find('p,h2,h3,blockquote,li').each((_i: number, el: any) => {
      const text = this.norm($(el).text());
      if (text.length >= 1) blocks.push(text);
    });

    if (blocks.length < 3) {
      const html = clone.html() || '';
      const normalizedBreaks = html
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p\s*>/gi, '\n')
        .replace(/<\/div\s*>/gi, '\n');
      const text = loadCheerio(`<div>${normalizedBreaks}</div>`).text();
      blocks = text.split(/\n+/).map((v: string) => this.norm(v)).filter((v: string) => v.length > 0);
    }

    const out: string[] = [];
    for (const text of blocks) {
      if (out.length && out[out.length - 1] === text) continue;
      if (/^(上一章|下一章|上一页|下一页|目录|返回目录|加入书架|投票|评论)$/i.test(text)) continue;
      out.push(text);
    }
    return out.slice(0, 2500);
  }

  private async translateMany(texts: string[]): Promise<string[]> {
    const out = new Array<string>(texts.length);
    let cursor = 0;
    const config = await this.loadTranslationConfig();
    const hasAI = this.availableProviderIds(config).length > 0;
    const workers = Math.min(hasAI ? 1 : 2, texts.length || 1);
    await Promise.all(Array.from({ length: workers }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= texts.length) break;
        try { out[index] = await this.translateText(texts[index], config); }
        catch (_) {
          try { out[index] = await this.googleTranslate(texts[index]); }
          catch (_) { out[index] = texts[index]; }
        }
        await this.sleep(hasAI ? 120 : 70);
      }
    }));
    return out;
  }

  private async translateText(text: string, suppliedConfig?: any): Promise<string> {
    const source = String(text || '');
    if (!this.norm(source)) return source;
    const config = suppliedConfig || await this.loadTranslationConfig();
    if (!this.availableProviderIds(config).length) return this.googleTranslate(source);
    const chunks = this.splitLongText(source, 3000);
    const translated: string[] = [];
    for (const chunk of chunks) {
      translated.push(await this.translateChunkWithFallback(chunk, config));
      if (chunks.length > 1) await this.sleep(80);
    }
    return translated.join('');
  }

  private async loadTranslationConfig(force = false): Promise<any> {
    const now = Date.now();
    if (!force && this.aiConfigCache && now - this.aiConfigFetchedAt < 60000) return this.aiConfigCache;
    try {
      const data = await this.factoryRequest('/api/factory/config', { method: 'GET' });
      this.aiConfigCache = data && typeof data === 'object' ? data : { providers: {} };
    } catch (_) {
      this.aiConfigCache = { providers: {} };
    }
    this.aiConfigFetchedAt = now;
    return this.aiConfigCache;
  }

  private availableProviderIds(config: any): string[] {
    const providers = config?.providers || {};
    const defaults: Record<string, number> = { G: 1100, P: 1700, Z: 2300, H: 2600 };
    return ['G','P','Z','H'].filter(id => this.norm(providers?.[id]?.key || '')).sort((a,b) => {
      const ah = this.providerHealth.get(a) || {}, bh = this.providerHealth.get(b) || {};
      const now = Date.now();
      const ac = Number(ah.cooldownUntil || 0) > now ? 1 : 0, bc = Number(bh.cooldownUntil || 0) > now ? 1 : 0;
      if (ac !== bc) return ac - bc;
      const af = Number(ah.failures || 0), bf = Number(bh.failures || 0);
      if (af !== bf) return af - bf;
      return Number(ah.avgLatency || defaults[a]) - Number(bh.avgLatency || defaults[b]);
    });
  }

  private async translateChunkWithFallback(chunk: string, config: any): Promise<string> {
    let lastError: any;
    for (const id of this.availableProviderIds(config)) {
      const health = this.providerHealth.get(id) || {};
      if (Number(health.cooldownUntil || 0) > Date.now()) continue;
      const started = Date.now();
      try {
        const value = await this.aiProviderTranslate(id, chunk, config.providers[id]);
        const elapsed = Date.now() - started;
        const prev = Number(health.avgLatency || elapsed);
        this.providerHealth.set(id, { failures: Math.max(0, Number(health.failures || 0)-1), cooldownUntil: 0, avgLatency: Math.round(prev*.7+elapsed*.3) });
        return value;
      } catch (error: any) {
        lastError = error;
        const status = Number(error?.status || 0), failures = Number(health.failures || 0)+1;
        const cooldown = status === 429 ? 45000 : (status === 401 || status === 403) ? 180000 : Math.min(60000, 5000*failures);
        this.providerHealth.set(id, { failures, cooldownUntil: Date.now()+cooldown, avgLatency: Number(health.avgLatency || 3000) });
      }
    }
    try { return await this.googleTranslate(chunk); }
    catch (googleError) { throw lastError || googleError; }
  }

  private providerDefinition(id: string): any {
    return ({
      P:{label:'Pollinations',url:'https://gen.pollinations.ai/v1/chat/completions',model:'nova-fast'},
      Z:{label:'Z.AI',url:'https://api.z.ai/api/paas/v4/chat/completions',model:'glm-4.7-flash',glm:true},
      H:{label:'BigModel/HEIA',url:'https://open.bigmodel.cn/api/paas/v4/chat/completions',model:'glm-4.7-flash',glm:true},
      G:{label:'Groq',url:'https://api.groq.com/openai/v1/chat/completions',model:'openai/gpt-oss-20b'},
    } as Record<string, any>)[id];
  }

  private async aiProviderTranslate(id: string, text: string, providerConfig: any): Promise<string> {
    const def = this.providerDefinition(id);
    const key = this.norm(providerConfig?.key || '');
    if (!def || !key) throw new Error('Translator Hell: provedor sem chave');
    const system = `Você é um tradutor literário. Traduza fielmente o texto do usuário para ${this.targetLabel}. Preserve nomes próprios, números, pontuação, diálogos e sentido. Não resuma, não explique e devolva somente a tradução.`;
    const body: any = { model: providerConfig?.model || def.model, messages:[{role:'system',content:system},{role:'user',content:text}], temperature:.15, stream:false, max_tokens:4096 };
    if (def.glm) body.thinking = {type:'disabled'};
    const response = await fetchApi(providerConfig?.url || def.url, {method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
    if (!response.ok) { const e:any = new Error(`Translator Hell: ${def.label} HTTP ${response.status}`); e.status=response.status; throw e; }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    let value = typeof content === 'string' ? content : Array.isArray(content) ? content.map((part:any)=>typeof part==='string'?part:(part?.text||part?.content||'')).join('') : '';
    value = this.cleanAiOutput(value);
    if (!this.auditTranslation(text, value)) throw new Error(`Translator Hell: ${def.label} devolveu tradução suspeita`);
    return value;
  }

  private auditTranslation(source: string, target: string): boolean {
    const s=this.norm(source), t=this.norm(target);
    if(!t) return false;
    if(s.length>100 && t.length<s.length*.12) return false;
    if(s.length>60 && t.length>s.length*8) return false;
    return true;
  }

  private cleanAiOutput(value: any): string {
    let out=String(value||'').trim();
    if(out.startsWith('```')&&out.endsWith('```')) out=out.replace(/^```(?:text|markdown)?\s*/i,'').replace(/\s*```$/,'');
    return out.trim();
  }

  private async googleTranslate(text: string): Promise<string> {
    const source=String(text||'');
    if(!this.norm(source)) return source;
    const chunks=this.splitLongText(source); const translated:string[]=[];
    for(const chunk of chunks){
      const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl='+encodeURIComponent(this.targetLanguage)+'&dt=t&q='+encodeURIComponent(chunk);
      const response=await fetchApi(url,{method:'GET'});
      if(!response.ok) throw new Error(`Translator Hell: Google HTTP ${response.status}`);
      const data=await response.json();
      const value=Array.isArray(data?.[0])?data[0].map((part:any)=>part?.[0]||'').join(''):'';
      if(!this.norm(value)) throw new Error('Translator Hell: resposta vazia do Google');
      translated.push(value); if(chunks.length>1) await this.sleep(60);
    }
    return translated.join('');
  }

  private splitLongText(text: string, max = 3400): string[] {
    if (text.length <= max) return [text];
    const out: string[] = [];
    let rest = text;
    while (rest.length > max) {
      const positions = [
        rest.lastIndexOf('\n', max), rest.lastIndexOf('。', max), rest.lastIndexOf('！', max),
        rest.lastIndexOf('？', max), rest.lastIndexOf('. ', max), rest.lastIndexOf(' ', max),
      ];
      let cut = Math.max(...positions);
      if (cut < Math.floor(max * 0.45)) cut = max;
      else cut += 1;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) out.push(rest);
    return out;
  }

  private async getText(url: string): Promise<string> {
    const response = await fetchApi(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,pt-BR;q=0.7',
      },
    });
    const html = await response.text();
    const meta = this.detectProtection(response, html, url);
    this.fetchMeta.set(url, meta);
    if (meta.finalUrl && meta.finalUrl !== url) this.fetchMeta.set(meta.finalUrl, meta);
    if (!response.ok || meta.challenge) {
      const message = meta.cloudflare
        ? `Translator Hell: Cloudflare detectado (HTTP ${response.status}). Abra o WebView desta fonte e conclua a verificação.`
        : `Translator Hell: HTTP ${response.status}`;
      const error: any = new Error(message);
      error.status = Number(response.status || 0);
      error.cloudflare = Boolean(meta.cloudflare);
      error.protection = meta;
      throw error;
    }
    return html;
  }

  private asHttpUrl(value: string): string | null {
    try {
      const u = new URL(String(value || '').trim());
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
    } catch (_) {
      return null;
    }
  }

  private requireHttpUrl(value: string): string {
    const url = this.asHttpUrl(value);
    if (!url) throw new Error('Translator Hell: URL http(s) inválida');
    return url;
  }

  private resolveAgainst(raw: string | undefined, base: string): string | undefined {
    if (!raw) return undefined;
    const cleaned = String(raw).trim();
    if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('javascript:')) return undefined;
    try {
      const url = new URL(cleaned, base);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
      url.hash = '';
      return url.href;
    } catch (_) {
      return undefined;
    }
  }

  private norm(value: unknown): string {
    return String(value ?? '').replace(/\u00a0/g, ' ').replace(/[\t\r ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  }

  private uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
      const v = String(value || '').trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }

  private extractSiteIcon($: any, base: string): string | undefined {
    const candidates = [
      'link[rel="apple-touch-icon"]@href',
      'link[rel="apple-touch-icon-precomposed"]@href',
      'link[rel="shortcut icon"]@href',
      'link[rel="icon"]@href',
    ];
    const picked = this.pickUrlAttr($, base, candidates).value;
    if (picked) return picked;
    try { return new URL('/favicon.ico', base).href; } catch (_) { return undefined; }
  }

  private prettyHost(host: string): string {
    const raw = String(host || '').toLowerCase().replace(/:\d+$/, '');
    let parts = raw.split('.').filter(Boolean);
    while (parts.length > 2 && /^(www\d*|m|mobile|wap|touch|t|read|reader|app)$/i.test(parts[0])) parts.shift();
    const twoLevelSuffixes = new Set([
      'co.uk','org.uk','com.br','com.cn','com.tw','com.hk','com.au','com.sg','co.jp','co.kr',
      'com.tr','com.ua','co.id','com.vn','co.th','com.mx','com.ar','com.co','com.pe','com.my','co.nz',
    ]);
    let key = parts[0] || raw;
    if (parts.length >= 2) {
      const suffix2 = parts.slice(-2).join('.');
      key = twoLevelSuffixes.has(suffix2) && parts.length >= 3 ? parts[parts.length - 3] : parts[parts.length - 2];
    }
    key = key.replace(/^xn--/i, '').replace(/[-_]+/g, ' ').trim() || raw;
    return key.replace(/\b\w/g, ch => ch.toUpperCase());
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private median(values: number[]): number {
    if (!values.length) return 0;
    const a = [...values].sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new TranslatorHellFactoryRuntime();
