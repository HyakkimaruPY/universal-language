# Factory - Ance v0.7.5 — estável

Base imediata: **v0.7.4 estável**, que por sua vez foi construída sobre a v0.7.3 estável. Nenhuma antiga build Beta foi usada.

## Continuidade e deduplicação de capítulos

- `extractChapterNumber` reconhece também prefixos `025 título`, `015) título`, `164) título`.
- listas “primeiros capítulos + capítulos recentes” passam pela validação de continuidade antes de serem aceitas como catálogo completo;
- um catálogo integral contínuo pode substituir o teaser em vez de ser simplesmente mesclado a ele;
- paginação numérica/next é percorrida em lotes de até quatro páginas, com limite global de segurança;
- URLs AMP, `www` e tracking são canonicalizadas para impedir capítulos duplicados.

## Catálogo de obras

- deduplicação de cards usa a identidade canônica da obra, não apenas a string da URL;
- a URL não-AMP é preferida quando há duas representações do mesmo livro;
- descoberta multilíngue reconhece “Lista de Novelas”, “catálogo”, “obras”, “biblioteca”, “romans” e padrões equivalentes;
- estruturas WordPress/WooCommerce entram no detector genérico de cards;
- HTML pesado é compactado antes de ser entregue ao Cheerio;
- candidatos são consultados em ondas de no máximo 3 páginas; depois de encontrar pelo menos 12 obras reais, a busca não espera rotas genéricas/404 desnecessárias.

## Extensões entre idiomas (ex.: ES → ZH)

- o idioma de saída não é mais enviado como `Accept-Language` à página de origem;
- tradução de títulos do browse possui timeout e fallback para o título original;
- tradução de metadados e títulos de capítulos também é fail-soft;
- lotes de tradução visual têm concorrência limitada a 2;
- o prefetch do browse foi reduzido a uma página à frente para conter memória/rede.

## Preservado

- isolamento de estado por obra (`novelRoutes[novelKey]`);
- single-flight por obra e rota;
- `parseNovel` + `parsePage` progressivo;
- caches persistentes;
- Cloudflare/Turnstile/WebView + `webStorageUtilized = true`;
- BYOK e fallback Google;
- `factory-data/` do usuário não é reescrito pela atualização.
