# Factory - Ance v0.7.6 — estável

Base imediata: **v0.7.5 estável**. Nenhuma build Beta foi incorporada.

## Pesquisa aplicada do LNReader

- adota a ideia dos `multisrc` oficiais: reconhecer a família do site e usar um caminho específico/curto antes do fallback genérico;
- segue o padrão de LightNovelWP de fazer uma requisição direta para a rota de séries e usar paginação `?page=N`;
- aplica o princípio do PR oficial LNORI #2446: reduzir o HTML antes do parser e limitar concorrência/trabalho em dispositivos Hermes;
- mantém a detecção de página final repetida, padrão encontrado em plugins oficiais como MZ Novels;
- mantém recuperação paginada de capítulos, com limites para não sacrificar o runtime móvel.

## Browse/catalog de obras

- `detectBrowseAdapter`: WordPress, WooCommerce, Madara e LightNovelWP;
- `listingBaseUrl`: remove `/page/N/`, chaves de paginação e tracking antes de persistir uma rota;
- `pageVariant`: WooCommerce/WordPress usam `/page/N/`; LightNovelWP usa `?page=N`;
- `product`, `producto` e sinais WooCommerce entram no scoring de cards;
- página pesada é reduzida a cards/trechos úteis antes do Cheerio;
- com `listingUrls` aprendido, a abertura usa a rota diretamente;
- cold start: uma homepage → melhor link real de catálogo → fallback genérico curto/sequencial;
- sem `Promise.all` de várias páginas pesadas;
- sem prefetch por timer do browse.

## Anti-travamento e navegação

- operações de browse/search possuem orçamento global e limite de tentativas;
- `withAbortTimeout` aborta `fetchApi`/`fetch` via `AbortController` quando disponível;
- mesmo sem abort físico, uma resposta que chega após o deadline não pode entrar no Cheerio;
- o filho não consulta `/api/factory/profile` nem `/api/factory/config` em `127.0.0.1` para abrir uma fonte já instalada;
- `factoryRequest` também possui timeout abortável para operações do Master;
- fallback adaptativo de segundo transporte não é usado no hot path de browse/search; cada tentativa executa apenas uma estratégia de rede.

## ES → ZH / tradução visual

- catálogo estrutural é independente da tradução;
- traduções já cacheadas são aplicadas imediatamente;
- uma página rápida recebe no máximo uma janela curta para traduzir títulos;
- Google visual usa timeout abortável por lote;
- timeout/falha devolve os títulos originais, nunca uma Promise estrutural presa.

## Preservado da v0.7.5

- recuperação de catálogo teaser (`024 → 164` etc.);
- paginação/continuidade de capítulos;
- deduplicação canônica AMP/www/tracking;
- isolamento A/B por obra;
- `parseNovel`/`parsePage`;
- cache persistente;
- Cloudflare/Turnstile/WebView e `webStorageUtilized = true`;
- BYOK + fallback Google;
- `factory-data/` sem alteração.
