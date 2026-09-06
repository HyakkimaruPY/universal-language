# Factory - Ance v0.7.8 — Estável

Base direta: v0.7.7 estável.

## Correções

- Navegação: removido prefetch oculto de capítulo na tela de detalhes e no leitor. Todo trabalho pesado de capítulo passa a ser demand-driven pelo LNReader, evitando manter Hermes ocupado depois que a tela já foi renderizada.
- Qidian/Yuewen: capas repetidas são detectadas. Para rotas canônicas `/book/<bookId>.html`, a capa pública é derivada pelo `bookId`; em outras arquiteturas, uma capa repetida suspeita é descartada em vez de ser mostrada para obras diferentes.
- Cards genéricos: a imagem agora é procurada dentro do menor container visual plausível do próprio card, reduzindo associação cruzada de capa entre itens.
- Capítulos: `preferredSelector`/seletor aprendido voltou a ser realmente autoritativo. O runtime da v0.7.7 acabava varrendo `a[href]` da página inteira mesmo quando já conhecia o bloco de capítulos.
- Filtro de lixo: símbolos/menu/trademark como `®...`, `©`, `™` e anchors sem texto plausível não podem mais virar capítulos apenas porque a URL parece numérica.
- Quanben e portais estáticos equivalentes: fast-path estrutural `/n/<slug>/ -> /n/<slug>/list.html` antes da descoberta genérica. Não é condicionado ao hostname.
- BrokenPipe: cancelamentos normais do cliente não geram mais traceback duplo. `BrokenPipeError`/`ConnectionResetError` são tratados como abandono de request pelo LNReader.

## Profiler no Termux

A Factory imprime tempos de servidor e recebe traces opcionais dos plugins-filhos via localhost:

- `sourcePage`: carregamento estrutural, deduplicação/cache e tradução visual.
- `browsePage`: fetch, detecção de adapter, compactação, Cheerio e extração.
- `parseNovel`: fetch de metadados, compactação, DOM, adapter/perfil, metadados, capítulos, tradução e cache/refine.
- `chapterCatalog`: batches de fetch/parse, merge e descoberta de paginação.
- `parsePage`: paginação/tradução de títulos.
- `parseChapter`: fetch, DOM, extração e tradução do conteúdo.
- Endpoints locais `/translate`, `/register` e `/refine`: tempo total e tempo interno principal.

URLs exibidas pelo profiler têm valores de query redigidos (`chave=…`). O endpoint de debug é apenas localhost e nunca entra no caminho crítico: o POST é fire-and-forget com aborto curto.
