# Pesquisa LNReader aplicada à Factory v0.7.6

Este documento registra os padrões analisados no repositório oficial e como foram transformados em regras genéricas da Factory. Não contém hardcode exclusivo de `novelasligeras.net`.

## 1. Multisource em vez de brute force

Fonte: `https://github.com/LNReader/lnreader-plugins/blob/master/docs/quickstart.md` e diretórios `plugins/multisrc/*`.

Insight: quando vários sites compartilham CMS/tema, o repositório oficial usa templates/famílias (Madara, LightNovelWP etc.), em vez de tentar dezenas de caminhos e seletores simultaneamente.

Aplicação: `detectBrowseAdapter()` classifica estruturas reconhecíveis e escolhe uma regra de paginação; o fallback genérico só é usado depois.

## 2. LightNovelWP

Fonte: `https://raw.githubusercontent.com/LNReader/lnreader-plugins/master/plugins/multisrc/lightnovelwp/template.ts`.

Padrões observados:
- uma rota de séries conhecida recebe uma única request por página;
- paginação típica `seriesPath + ?page=N`;
- o parser de novels trabalha sobre blocos `<article>`;
- `parseNovel` usa `htmlparser2` em streaming para a estrutura longa;
- captcha/redirecionamento falha cedo e orienta WebView.

Aplicação:
- adapter LightNovelWP usa `query-page`;
- HTML de browse tenta isolar cards antes de Cheerio;
- hot path usa uma estratégia de fetch, não uma cascata;
- proteção continua direcionando para WebView/cookies do LNReader.

## 3. PR #2446 — LNORI performance

Fonte: `https://github.com/LNReader/lnreader-plugins/pull/2446`.

O PR relata que páginas de volumes de ~0,5 MB eram baixadas todas ao mesmo tempo e completamente parseadas. A correção passou a recortar apenas o `<nav>`/TOC quando suficiente, com fallback integral, e limitou a quatro volumes simultâneos. O próprio PR mediu 58,3 MB → 0,4 MB entregues ao parser nos quatro títulos usados na validação.

Aplicação:
- `compactCatalogHtml` e `compactBrowseHtml`;
- recorte seguro de TOC/cards com fallback;
- concorrência limitada em catálogos;
- browse v0.7.6 abandona ondas paralelas de DOMs e usa orçamento sequencial.

## 4. Paginação completa e rate limit

Fonte: `https://github.com/LNReader/lnreader-plugins/pull/2478`.

Insight: quando o endpoint rápido deixa de existir, a lista completa pode exigir paginação e precisa ser buscada de forma controlada para não atingir rate-limit.

Aplicação: a recuperação de capítulos já introduzida na v0.7.5 permanece com paginação/limites, sem aceitar teaser como catálogo completo.

## 5. Página final repetida

Fonte: plugin MZ Novels no repositório oficial (o parser verifica a página ativa porque o site repete a última página quando N excede o máximo).

Aplicação: `sourcePage` mantém identidades já vistas e encerra a fonte quando uma página posterior tem grande sobreposição e quase nenhum item novo.

## 6. Helper de rede do aplicativo

Fonte: `https://github.com/LNReader/lnreader/blob/master/src/plugins/helpers/fetch.ts`.

`fetchApi` repassa o init para `fetch` e injeta o User-Agent configurado no aplicativo.

Aplicação:
- o runtime não gira User-Agent aleatoriamente;
- `withAbortTimeout` usa `AbortController`/`signal` quando disponível;
- caminho de browse/search recebe cancelamento real no runtime que o suporta.

## 7. Caso de validação: novelasligeras.net

Rotas observadas:
- catálogo: `https://novelasligeras.net/index.php/lista-de-novela-ligera-novela-web/`;
- segunda página: `https://novelasligeras.net/index.php/lista-de-novela-ligera-novela-web/page/2/`;
- a listagem é um archive WordPress/WooCommerce com dezenas de itens por página.

Aplicação genérica:
- `producto/product/woocommerce` é sinal forte de obra;
- archives WordPress/WooCommerce usam `/page/N/`;
- a rota-base aprendida nunca é substituída permanentemente por `/page/2/`;
- depois de aprendida, a extensão não precisa reexplorar o site para abrir o catálogo.

## 8. Regra de ciclo de vida

Uma Promise que perde um `Promise.race` não é cancelada automaticamente. No Hermes isso é especialmente ruim quando a resposta atrasada ainda entra em Cheerio.

Aplicação:
- timeout abortável para rede;
- deadline verificado novamente antes de compactação e antes do Cheerio;
- sem timer de prefetch do browse;
- filho usa perfil/configuração embutidos/localmente e não espera o servidor da Factory.
