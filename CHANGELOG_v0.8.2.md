# Factory - Ance v0.8.2 — Shuqi, isolamento por obra e ícones

## Correções

- Novo adapter estrutural para a família Shuqi (`t.shuqi.com` / `shuqi.com`).
  - A página de detalhes que mostra apenas os 3 capítulos mais recentes não é mais aceita como catálogo completo.
  - O `bookId` é extraído de `/book/<id>`, `/catalog/<id>` e `/reader/<id>`.
  - O catálogo integral é recuperado por representações/API da própria família e achatado por volume.
  - URLs de leitura são geradas com o `bookId` e `forceChapterId` corretos.
  - A homepage curada do Shuqi é tratada como catálogo estático; a Factory não inventa `?page=2`, `?page=3` que só repetem cartões.
- Catálogo Shuqi: capas passam a ser associadas pelo URL canônico `/book/<id>` do próprio cartão, eliminando vazamento da primeira imagem de um bloco para obras vizinhas.
- XS8/Yuewen: detalhes canônicos `/book/<id>` são autoritativos. O runtime não pode mais trocar silenciosamente para uma obra recomendada durante `inferNovelUrl`.
- Rotas de catálogo são validadas contra a identidade da obra (`bookId`). Uma rota `/chapterlist/<B>` é rejeitada antes do fetch quando a novel aberta é `/book/<A>`.
- Ícones: o resolver síncrono de instalação prioriza favicon raiz, apex/www e Google S2 antes de variantes de baixo valor. Isso corrige o caso em que os fallbacks úteis ficavam fora do corte de candidatos.
- Requisições de ícone a serviços de terceiros não enviam `Referer` de outro domínio.

## Invariantes preservados

- 15 Masters, sem filhos/perfis/chaves pré-empacotados.
- Plugins oficiais continuam sendo apenas material de referência; nenhum é distribuído.
- Distribution Guard permanece obrigatório.
- Isolamento de cache/estado por obra, paginação incremental, anti-travamento e profiler permanecem ativos.
