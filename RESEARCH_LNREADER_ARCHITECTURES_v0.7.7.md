# Auditoria de arquiteturas — LNReader Plugins → Factory - Ance v0.7.7

## Escopo

A auditoria mapeia a árvore pública de plugins, os generators `multisrc`, fontes singulares representativas (incluindo NOVA) e correções/PRs que expõem problemas recorrentes de produção. O objetivo não é copiar seletores domínio a domínio: é transformar mecanismos repetidos em adapters e invariantes testáveis na Factory.

Referência principal: https://github.com/lnreader/lnreader-plugins/tree/master/plugins

O repositório oficial separa plugins por idioma e mantém um sistema `plugins/multisrc/` para fontes que compartilham CMS/theme. A própria documentação recomenda procurar primeiro um generator existente em vez de repetir um parser genérico por site:

https://github.com/lnreader/lnreader-plugins/blob/master/docs/quickstart.md

Famílias atualmente expostas no diretório `plugins/multisrc/` analisado:

1. fictioneer
2. hotnovelpub
3. ifreedom
4. lightnovelwp
5. madara
6. mtlnovel
7. novelcool
8. novelfire
9. ranobes
10. readnovelfull
11. readwn
12. rulate
13. webnovelworld

## Padrões extraídos do corpus oficial

### 1. Adapter conhecido antes do fallback genérico

Plugins oficiais de famílias conhecidas usam rotas e seletores da família. A Factory v0.7.7 replica o princípio como:

`detectar arquitetura -> fast-path -> validar resultado -> fallback semântico somente se necessário`.

Isso reduz CPU, memória e número de requests em Hermes/React Native.

### 2. Uma página útil não deve ser parseada várias vezes

A Factory mantém:

- single-flight de metadata/catalog;
- cache de página/catálogo;
- URL-base de listing aprendida;
- isolamento por novel;
- parser compacto antes do Cheerio quando a arquitetura permite.

### 3. Paginação precisa ser completa e ter condição de parada

Problemas recorrentes no próprio tracker oficial incluem fontes que retornam apenas a primeira página de capítulos, repetem a última página ou duplicam a lista ao atualizar. A Factory usa:

- visited-set de páginas;
- dedupe por URL canônica;
- detecção de alta sobreposição entre páginas;
- parada quando a página final é repetida;
- recuperação de páginas adicionais quando a lista possui lacunas grandes;
- paginação virtual local no `parsePage()` depois que o catálogo bruto foi consolidado.

### 4. Ordem do site vale mais que um número ambíguo

IDs de URL não são necessariamente números de capítulo. Números textuais são fortes, mas podem reiniciar a cada volume e repetir por `Parte N`.

v0.7.7:

- não usa ID numérico arbitrário da URL para reordenar catálogo;
- se houver volume explícito, ordena volume e mantém ordem interna;
- se números textuais repetirem sem volume confiável, mantém a ordem DOM;
- prólogos/epílogos/partes continuam no ponto onde o site os publicou.

### 5. Conteúdo parcial não pode fingir ser catálogo completo

Mantida a validação introduzida na v0.7.5: uma lista `1..24 + 164..185` é teaser, não um catálogo integral. Uma fonte mais contínua e que cubra o mesmo intervalo vence.

### 6. Imagem é parte da arquitetura

Plugins reais encontram vários sistemas de lazy-loading. O gerador agora normaliza:

- `data-large_image`
- `data-lazy-src`
- `data-litespeed-src`
- `data-src`
- `data-original`
- `data-orig-file`
- `data-thumb`
- `src`
- `srcset` / `data-srcset`
- `picture > source`

Placeholders/1x1/data URIs não vencem uma imagem real.

### 7. Rede precisa ser cancelável

O helper do LNReader termina em `fetch`, então `AbortSignal` pode ser repassado. A Factory usa AbortController nas operações críticas e mantém uma trava lógica depois do deadline para uma resposta atrasada não entrar no Cheerio.

### 8. Tradução não é estrutura

A Factory nunca depende da tradução para descobrir path, capítulo, capa ou paginação. Entretanto, quando a extensão tem idioma de saída diferente, a tradução visual **sempre é iniciada**. A v0.7.6 tinha uma condição baseada na velocidade da página de origem; isso foi removido.

## Arquitetura NOVA / WooCommerce

Fonte usada como reprodução:

- catálogo: https://novelasligeras.net/index.php/lista-de-novela-ligera-novela-web/
- exemplo de produto: https://novelasligeras.net/index.php/producto/death-march-kara-hajimaru-isekai-kyusoukyoku-novela-ligera/

A página de catálogo é um archive WooCommerce. A página da novel é um produto com:

- `h1.product_title` / equivalente;
- galeria de imagens;
- short description;
- `woocommerce-Tabs-panel--description` contendo todos os volumes/capítulos;
- centenas de links que tornam uma descoberta global de anchors desnecessariamente cara.

### Fast-path implementado

```text
product page
  -> adapter WooCommerce Product
  -> metadata explícita
  -> description tab
  -> varredura linear volume/chapter
  -> dedupe canônico
  -> ordenação contextual
  -> cache bruto
  -> parseNovel: somente página 1
  -> parsePage: fatias locais seguintes
```

Nenhuma rota de catálogo de capítulos é inventada para esse padrão; o próprio produto já contém o catálogo.

## Famílias e estratégia no gerador

| Família oficial | Sinal/estratégia na Factory |
|---|---|
| Fictioneer | assinatura do theme/chapter groups; adapter aprendido |
| HotNovelPub | assinatura/família conhecida + perfil aprendido; fallback seguro |
| IFreedom | assinatura/família conhecida + perfil aprendido; fallback seguro |
| LightNovelWP | `eplister`, `bixbox`, `ts-post-image`; paginação query-page |
| Madara | `wp-manga`, `page-item-detail`, `c-tabs-item__content`; WordPress pagination |
| MTLNovel | assinatura/família conhecida + perfil aprendido |
| NovelCool | assinatura/família conhecida + perfil aprendido |
| NovelFire | assinatura/família conhecida + perfil aprendido; regras genéricas de paginação completa continuam ativas |
| Ranobes | assinatura/família conhecida + perfil aprendido; compactação antes do parser quando segura |
| ReadNovelFull | assinatura/família conhecida + perfil aprendido |
| ReadWN | assinatura/família conhecida + perfil aprendido |
| RuLate | assinatura/família conhecida + perfil aprendido |
| WebNovelWorld | assinatura/família conhecida + perfil aprendido |
| WooCommerce | product archive + product-detail adapter completo |
| WordPress | `/page/N/`, descoberta de listing e fallback semântico |
| Generic | aprendizado semântico, HTML/JSON/paginação/recovery |

A classificação é deliberadamente conservadora: um sinal fraco nunca desativa o fallback genérico.

## Regressões que devem continuar nos próximos releases

1. A e B no mesmo domínio nunca compartilham `catalogUrl`.
2. `024 -> 164` força busca de catálogo integral.
3. AMP/www/tracking não duplicam obra/capítulo.
4. página final repetida encerra paginação.
5. timeout nunca entra em Cheerio depois do deadline.
6. filho instalado não depende de `127.0.0.1` para abrir.
7. tradução ES -> ZH lenta ainda é iniciada.
8. WooCommerce lazy image retorna URL real, não placeholder.
9. números de capítulo repetidos por volume/parte não são reordenados globalmente.
10. adapter conhecido não executa varredura genérica pesada do detalhe.


## Matriz de mecanismos generalizados na v0.7.7

| Mecanismo observado nos plugins/reparos oficiais | Regra na Factory |
|---|---|
| template por CMS/theme | detector de arquitetura antes do parser semântico |
| `pageCache`/evitar fetch repetido | single-flight + cache bruto por source/page/novel |
| listas de capítulos paginadas | visited-set, próxima página numérica/textual e validação de continuidade |
| parsing incremental/`htmlparser2` em páginas grandes | recorte estrutural seguro antes do Cheerio; fallback completo quando necessário |
| WordPress `/page/N/` | pagination adapter `wordpress-path` |
| endpoints AJAX/JSON | fallback de descoberta de endpoints, sem forçar HTML quando a fonte expõe API |
| lazy image/CDN/Cloudflare | cadeia `data-large_image`, `data-lazy-src`, `data-src`, `data-cfsrc`, srcset etc. |
| capítulos reiniciando por volume | identidade por URL + volume/contexto; nunca dedupe apenas por número |
| páginas “primeiros + recentes” | detector de lacuna; lista parcial não é publicada como catálogo completo |
| Cloudflare/challenge | WebView/storage do LNReader + fail-fast; nenhuma varredura pesada sobre challenge |
| fonte lenta/saída multilíngue | estrutura retorna primeiro; tradução é camada visual abortável/repetível |

### NOVA como regressão arquitetural, não exceção

O caso NOVA passou a ser uma regressão para a família **WooCommerce + The7 +
WPBakery/Visual Composer**. O runtime não testa o hostname para escolher o parser;
ele exige sinais DOM da arquitetura. Com isso, outro site com a mesma combinação
herda catálogo `.dt-css-grid`, capa lazy/CDN, metadados WooCommerce e volumes
WPBakery sem precisar de código novo por domínio.

### Busca AJAX em WooCommerce/The7

O plugin oficial NOVA evidencia outra variação importante: a primeira página da busca pode não ser HTML. A arquitetura envia POST a `wp-admin/admin-ajax.php` com `action=product_search` e recebe um array JSON contendo URL, título e thumbnail; páginas posteriores voltam à paginação WordPress. A Factory implementa esse caminho como adapter **aprendido por sinais da página**, nunca por hostname. Se os sinais não existirem ou o AJAX falhar, a busca HTML normal continua disponível.
