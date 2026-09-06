# Atualização v0.8.4

Erros HTTP não são páginas vazias. Identidade canônica de capítulo é separada de URL de representação a buscar. OG e parsers fictionposts/list2 dependem de estrutura; dicas de origem conhecidas apenas ajudam bootstrap/espelho. API de outro site exige schema comprovado. Veja AUDITORIA_LNREADER_v0.8.4.md.

---

# Arquitetura atual — v0.8.3

Prevalece [AUDITORIA_LNREADER_v0.8.3.md](AUDITORIA_LNREADER_v0.8.3.md). A Factory separa três etapas: classificação estrutural, protocolo de obtenção e parser. Madara/ReadNovelFull passam por AJAX comprovado por DOM. WebNovelWorld pode usar paginação remota de 100; demais catálogos mantêm fatias locais de 24. Nunca misturar o tamanho dessas páginas.

Cloudflare detectado permite criar filho pendente; o usuário verifica no WebView próprio. Não existe um solucionador automático no helper fetchApi. Falha de página anunciada não pode virar total final. Cache em memória também expira.

A descrição histórica abaixo preserva a evolução, mas alegações de prefetch, cobertura total e bloqueio da criação foram substituídas pelas versões posteriores.

---

# Arquitetura Translator Hell Factory v0.7.8

## Fluxo

```text
Master de idioma
  -> URL nova
  -> probe HTML/charset/Cloudflare/favicon/PWA
  -> perfil semântico (CN/EN)
  -> plugin-filho local 0.1+
  -> instalação pelo LNReader
  -> index.js + custom.js + custom.css no armazenamento do app
```

Nenhum filho, perfil ou chave BYOK precisa ser enviado ao GitHub. O manifesto público contém somente os 15 Masters.

## Novel

`parseNovel()` extrai metadados e catálogo bruto, persiste o catálogo por curto período e devolve apenas a página 1. `totalPages` informa ao LNReader quantos lotes existem. `parsePage()` fatia o catálogo virtual em blocos de 24, traduz somente aquele bloco e aquece o próximo.

Isso usa a paginação nativa do LNReader em vez de simular streaming dentro de uma Promise única.

## Chapter

`parseChapter()` continua sendo a fonte de verdade para leitura e download:
- caminho rápido por seletor aprendido;
- DOM + JSON/script state + páginas intermediárias;
- limpeza semântica CN/EN;
- tradução em lotes concorrentes;
- cache + prefetch;
- fallback Google.

O companion do Reader atua somente como sanitização final de navegação residual.

## Runtime adaptativo

O plugin mede `fetchApi` (LNReader) versus `fetch` JS por operação. Há exploração inicial e preferência posterior pela estratégia com melhor tempo/taxa de sucesso. Sites com Cloudflare/cookies penalizam estratégias que falham, então o runtime converge para o caminho compatível.

## Encoding

A camada usa a declaração HTTP quando existe. Para charsets legados reconhecidos, tenta o `fetchText(..., encoding)` nativo do LNReader; `TextDecoder` e reparo Unicode permanecem como fallback.

## Perfis semânticos

O extrator prioriza delimitadores chineses/ingleses, por exemplo:
- sinopse: `书籍简介`, `内容简介`, `作品简介`, `Synopsis`, `Summary`, `Description`;
- catálogo: `章节目录`, `目录`, `全部章节`, `Chapters`, `Table of Contents`;
- capítulo: começa em heading/`第N章` e termina antes de `上一章/下一章/目录` ou equivalentes ingleses.

Esse padrão cobre portais como Quanben sem transformar um site específico em hardcode exclusivo.


## v0.7.1 — Source browse prefetch (legado; substituído na v0.7.6)

O grid de novels (`popularNovels`/`searchNovels`) mantém paginação nativa do LNReader, mas pré-carrega duas páginas futuras já com títulos traduzidos. Resultados são deduplicados entre páginas; páginas que ignoram o parâmetro de paginação são marcadas como fim do catálogo. Isso reduz o placeholder escuro do próprio LNReader sem alterar a UI do aplicativo.

O Master mantém até 20 cartões de criação na sessão corrente, um por DNS, permitindo ensinar vários sites sem sair/reabrir a fonte.


### Portal agregado / paginação segura (v0.7.2)
Homepages com várias categorias e sem próximo-page real são classificadas como catálogo estático. A Factory não sintetiza `?page=2` nesses casos. Isso evita reflow/placeholder persistente no Browse do LNReader.

### Integridade de catálogo (v0.7.3)

A página de detalhes de uma obra não é mais aceita como catálogo definitivo apenas porque contém muitos links de capítulo. Sites que exibem uma mistura de capítulos iniciais e capítulos recentes podem produzir lacunas enormes (por exemplo 24 → 3509). O runtime agora:

- trata uma rota de catálogo descoberta como fonte autoritativa;
- mede continuidade dos números explícitos de capítulo;
- executa uma leitura ampla de todos os links do catálogo, sem ficar preso ao seletor aprendido na página de detalhes;
- tenta variantes estruturais de índice (`list.html`, `/amp/...`) quando ainda há lacunas;
- amplia o limite interno para 20.000 capítulos;
- só persiste o catálogo depois da recuperação/mesclagem e ordenação.

### Correção rápida no Reader (v0.7.3)

Cada parágrafo retornado por `parseChapter()` mantém o texto original em `data-th-original`, enquanto o texto visível continua traduzido. O `customJS` gerado por plugin-filho reconhece duplo clique/duplo toque e pede uma retradução ao runtime local da Factory para o idioma daquele filho. Se o endpoint local estiver indisponível, o evento cai no fluxo nativo `text-action/replace` do LNReader, permitindo correção manual sem perder a posição de leitura.

### BYOK e revisão cooperativa (v0.7.3)

Os parâmetros P/Z/H/B/G são case-insensitive e podem coexistir na mesma URL. Aliases por nome também são aceitos. No fluxo normal apenas o provedor mais saudável é usado; um segundo provedor atua como revisor somente quando a saída primária apresenta indícios de tradução incompleta/resíduo do idioma original, preservando a velocidade nos capítulos que já traduzem corretamente.


## v0.7.6 — browse por adapter e ciclo de vida

O browse deixa de tratar qualquer domínio como uma caixa-preta que exige várias sondagens. O fluxo é:

```text
perfil local
  -> listingUrl conhecido? -> 1 request direta
  -> senão: 1 homepage -> melhor link real de catálogo
  -> detecta família (WooCommerce/WordPress/Madara/LightNovelWP)
  -> paginação específica da família
  -> fallback genérico curto e sequencial somente se necessário
```

Cada chamada tem um orçamento. Fetches de browse/search recebem `AbortSignal` quando disponível e respostas atrasadas são barradas antes do parser. O browse não agenda prefetch por `setTimeout`, pois a API de plugins não fornece um callback confiável de "tela fechada" para cancelar esse trabalho.

Plugins-filhos são autônomos no caminho crítico: `getCurrentProfile()` e `loadTranslationConfig()` usam os snapshots locais/embutidos. O servidor `127.0.0.1:8765` continua necessário para criar/refinar via Master, mas não para simplesmente abrir uma extensão já instalada.


## v0.7.8 — adapter de detalhe + famílias oficiais

A arquitetura passa a separar `browseAdapter` de `novelAdapter`. Uma fonte pode, por exemplo, navegar por um archive WooCommerce e abrir uma novel como `woocommerce-product`. Quando o adapter de detalhe é conhecido, `parseNovel()` evita `learnProfile()` global e executa apenas a aprendizagem local necessária à obra.

```text
browseAdapter
  -> rota/paginação/cards/capas
novelAdapter
  -> título/capa/sinopse/catálogo da obra
chapter parser
  -> conteúdo de leitura
```

Isso segue o princípio do `plugins/multisrc/` do repositório oficial: compartilhar comportamento por família/CMS em vez de criar exceções por domínio. O fallback genérico continua obrigatório quando a confiança do adapter é baixa.
