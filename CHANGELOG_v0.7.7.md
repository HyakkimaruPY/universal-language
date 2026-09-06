# Factory - Ance v0.7.7 — estável

## Arquiteturas oficiais + NOVA/WooCommerce

Esta versão continua diretamente a linha estável v0.7.3 → v0.7.6. Não incorpora código das antigas builds Beta.

### Correções visíveis

- Catálogos cross-language (por exemplo ES → ZH) **sempre** iniciam tradução visual. A tradução não depende mais do tempo que o HTML da fonte levou para chegar.
- Capas de catálogo e detalhe agora reconhecem `data-lazy-src`, `data-litespeed-src`, `data-large_image`, `data-srcset`, `srcset`, `picture/source` e outros formatos comuns de lazy-load/CDN, rejeitando placeholders.
- WooCommerce ganhou fast-path completo de novel: `product_title`, short description, product gallery e capítulos dentro da aba Description.
- Obras WooCommerce com centenas de links não executam mais a aprendizagem genérica de filtros/catalog/search sobre a página de detalhe.
- Volumes e capítulos partidos (`Volumen 2`, `Parte 1 – Capítulo 3`, prólogos etc.) preservam a ordem correta. Números de capítulo repetidos não são mais reagrupados incorretamente.
- O detalhe usa fetch abortável com orçamento e tradução de título/sinopse/primeiro lote com limites curtos; falha de tradução devolve o original em vez de manter skeleton indefinidamente.
- HTML de detalhe WooCommerce remove scripts/estilos/reviews desnecessários antes do Cheerio. Em fontes genéricas, scripts permanecem disponíveis porque podem conter JSON de capítulos/metadados.

### Camada de arquitetura

A Factory passa a manter um detector de famílias antes do fallback genérico. Foram incorporados sinais das famílias mantidas no `plugins/multisrc/` oficial do LNReader:

- Fictioneer
- HotNovelPub
- IFreedom
- LightNovelWP
- Madara
- MTLNovel
- NovelCool
- NovelFire
- Ranobes
- ReadNovelFull
- ReadWN
- RuLate
- WebNovelWorld

Além dessas, continuam WordPress, WooCommerce e generic. Famílias com assinatura DOM forte recebem fast-path imediatamente; as demais podem ser aprendidas e refinadas sem remover o fallback semântico.

### Integridade do catálogo

- deduplicação continua baseada em URL canônica da obra/capítulo;
- final de paginação repetida continua sendo detectado;
- catálogo paginado completo continua sendo preferido a teaser `primeiros + recentes`;
- single-flight continua impedindo duas extrações simultâneas da mesma obra;
- ordem DOM é preservada quando números repetidos indicam volumes/partes sem contexto suficiente;
- quando o volume é conhecido, ordena volume numericamente e preserva a sequência interna original.

### NOVA / novelasligeras.net

A arquitetura observada é WooCommerce:

- browse: archive de produtos;
- novel: produto individual;
- capa: galeria WooCommerce/lazy-load;
- sinopse: `woocommerce-product-details__short-description`;
- capítulos: links dentro da aba Description, agrupados por `Volumen N`;
- paginação de obras: WordPress `/page/N/`.

O tratamento é por arquitetura e não por hostname: qualquer site com a mesma estrutura aproveita o adapter.


### Correção final de tradução/cache

- Busca WooCommerce/The7 ganhou fast-path opcional para `wp-admin/admin-ajax.php` + `action=product_search`, como na arquitetura oficial NOVA. Ele só é ativado quando a própria página anuncia sinais fortes `product_search`/`ixwps` + The7 (`dt-css-grid`/`wf-cell`); WooCommerce genérico não paga essa tentativa.
- Busca HTML também reutiliza o adapter da arquitetura para preservar capas/lazy-load, em vez de cair sempre na varredura genérica de anchors.
- Conteúdo de capítulo WPBakery prioriza `.wpb_text_column.wpb_content_element > .wpb_wrapper`, evitando selecionar o DOM inteiro da página.


- `sourcePageCache` agora guarda **itens estruturais no idioma de origem**, nunca o
  texto já traduzido. Isso evita traduzir uma tradução pela segunda vez.
- Falha/timeout temporário de ES → ZH não transforma o original em tradução válida:
  ao reabrir a fonte a tradução é tentada novamente **sem refazer o fetch/parser**.
- O cache de `parseNovel` mantém título/sinopse/títulos do primeiro lote em uma
  propriedade interna não enumerável. Assim o detalhe pode repetir apenas a camada
  visual depois de uma falha, sem baixar novamente uma página WooCommerce enorme.
- O original retornado por uma falha do Google não é persistido no display cache.
- Batches visuais usam separador robusto, concorrência limitada e continuam
  fail-soft: catálogo/detalhe existem independentemente do tradutor.

### Insights incorporados do repositório oficial

Além dos `multisrc`, foram usados como sinais de projeto os reparos recentes do
próprio repositório: cache de páginas para evitar fetch repetido, recuperação de
todas as páginas de capítulos, parser incremental/compacto em fontes grandes,
limites de concorrência e falha rápida para fontes bloqueadas por Cloudflare.
Esses comportamentos foram transformados em regras genéricas da Factory, não em
exceções por domínio.
