# Factory - Ance v0.8.1 — Continuidade / Yuewen / Timeout

## Corrigido

- Catálogos teaser `1..N + últimos capítulos` não são mais aceitos como completos.
- Salto extremo como `34 -> 4893` tenta catálogo integral; fallback seguro nunca publica o salto como sequência normal.
- `/n/<slug>/list.html` valida continuidade e prioriza alternativa AMP/full quando a lista normal é teaser.
- Filtros URL de categoria são aplicados antes da paginação; página 2 não volta mais para a URL da página 1 (caso Quanben `/c/xuanhuan_2.html`).
- O parser de catálogo não mistura mais um seletor de capítulos válido com uma segunda varredura global de todos os links.
- Paginação passa a ler também `option[value]`, `data-url`, `data-href`, `data-page-url`, `list_N.html`, `/page/N/` e parâmetros de página.
- Família Yuewen recebe adapter genérico para Qidian, XS8, XXSY, Hongxiu, ReadNovel e QDMM.
- Em obras Yuewen, `/chapterlist/<id>` é a rota prioritária; URLs de leitura e `/catalog.html` inventado deixam de bloquear `parseNovel`.
- Requisições de catálogo têm deadline global, timeout por página e AbortController quando disponível.
- O algoritmo de transporte deixa de alternar Native/JS artificialmente nas primeiras chamadas.
- Resolução de favicon no `/register` agora é concorrente e limitada por um orçamento de parede de ~1,55 s.
- Profiler do terminal exibe mais etapas e estatísticas de continuidade (`min`, `max`, `gaps`).

## Preservado

- 15 Masters; zero filhos/perfis/chaves no release.
- Distribution Guard.
- isolamento por obra, Cloudflare/WebView, adapters WooCommerce/WPBakery/NOVA, cache estrutural/visual e navegação sem prefetch oculto.
