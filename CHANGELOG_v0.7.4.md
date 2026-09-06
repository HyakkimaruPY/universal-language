# Factory - Ance v0.7.4 — estável

Base: **v0.7.3 estável**. Nenhum código das antigas builds v0.7.4 Beta foi usado.

## Isolamento de obras

- identidade = `pluginId + URL canônica da obra`;
- `catalogUrl` e `novelUrl` são armazenados em `novelRoutes[novelKey]`;
- perfil do host mantém somente dados realmente reutilizáveis, como seletores, busca, filtros e proteção;
- perfis legados perdem automaticamente `catalogUrl`/`novelUrl` globais ao serem salvos novamente;
- respostas e caches de uma obra não são reutilizados por outra obra do mesmo domínio.

## Desempenho

- `parseNovel` e catálogo usam single-flight;
- HTML de catálogo grande tenta recorte do TOC antes de Cheerio;
- scripts/styles/comments são removidos do caminho de parsing quando seguro;
- até quatro rotas independentes são carregadas simultaneamente;
- falha isolada em uma rota não cancela as demais;
- `parsePage`, cache de 2h, prefetch e tradução progressiva da v0.7.3 foram preservados.

## Cloudflare

- `webStorageUtilized = true`;
- `credentials: include`;
- detecção de Cloudflare, Turnstile e Managed Challenge preservada;
- challenge continua direcionando o usuário ao WebView em vez de ser interpretado como HTML da obra.

## Regressões testadas

- abrir A → fechar → abrir B na mesma extensão;
- duas obras com identidades distintas no mesmo domínio;
- rota aprendida de A não é consultada por B;
- chamadas simultâneas da mesma obra são coalescidas;
- catálogo teaser continua recuperando intervalos ausentes;
- paginação de capítulos continua funcionando;
- Cloudflare/Turnstile continuam detectados;
- BYOK e fallback Google continuam funcionando.
