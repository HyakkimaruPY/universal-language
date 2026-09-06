# Factory - Ance v0.8.4 — erros recuperáveis, representações e tradução

Base v0.8.3. Revisão motivada pelos logs e screenshots do usuário.

- HTTP 401/403/429 e desafios não viram lista vazia com sucesso; busca também propaga falhas.
- Primeira página vazia não é cacheada; recuperação após WebView pode consultar a rede novamente.
- fetchApi priorizado para manter o User-Agent configurado no aplicativo.
- AMP deixa de ser eliminado antes do fetch por deduplicação de capítulos.
- Dica de espelho Quanben validada por coincidência de nomes; hrefs reais preservados.
- Metadados OG de novels e cards list2 incorporados genericamente.
- Protocolo fictionposts: cards, pg, metadados, POST de capítulos e leitor chp_raw.
- Tradução por título quando o lote falha; cache versionado; diagnóstico de fallback.
- Janela visual máxima de browse passa a 6,5 s; custo explicitado na auditoria.
- Profiler diferencia catálogo parcial de sucesso sem lacunas.
- 22 grupos de regressão com DOM real, além da suíte antiga e dos testes Python.

Ver AUDITORIA_LNREADER_v0.8.4.md para causas confirmadas, hipóteses, estudos de outros idiomas e limites. Não foi confirmada execução ponta a ponta em Android. Nenhum plugin oficial foi distribuído.
