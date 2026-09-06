# Factory - Ance v0.8.0 — Catalog Bootstrap / Detail Render / Site Icon

## Correções

1. **Catálogo do filho** — criação em duas fases: `learnSiteProfile()` aprende homepage/listagem e `learnDetailProfile()` aprende a novel-amostra. Os dois perfis são mesclados sem a amostra sobrescrever a raiz da extensão.
2. **Detalhes da novel** — cards do catálogo persistem hints estruturais (título/capa) por identidade canônica. Se a página de detalhes vier incompleta, esses hints preenchem o primeiro render; se o DOM compacto falhar e a página não for excessiva, há uma tentativa controlada com o HTML original.
3. **Logo do site** — todos os ícones declarados no HTML são mantidos em `siteIconCandidates`; o servidor tenta esses candidatos de forma síncrona e limitada antes de publicar o filho. O badge DNS e a resolução profunda ficam como último fallback.
4. **Perfil estável** — `seedUrl` e `sourceRoot` permanecem ligados ao site criado, não à última obra aberta. `listingUrls`, adapters, filtros e seletores de detalhe continuam independentes.
5. **Compatibilidade** — preservadas as correções de paginação/continuidade, deduplicação, adapters, tradução visual retryable, anti-travamento, profiler e Distribution Guard.
