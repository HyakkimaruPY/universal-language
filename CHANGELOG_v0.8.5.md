# Factory - Ance v0.8.5

## Correções verificadas

- Cards: nome do site consultado uma vez por DOM, em vez de uma vez por candidato de título. Busca do contêiner usa cache por nó e limite de 120 descendentes; não percorre body/main repetidamente. O log do NovelLive apontava 22–31 s na extração, mas os tempos finais no Android ainda precisam ser medidos.
- Capas: seletores aprendidos com `@src` passam pelo mesmo resolvedor de imagens lazy (`data-src`, `data-original`, srcset), antes de aceitar placeholders. Metadados OpenGraph aceitam `name` e `property`.
- Detalhes: falha do catálogo não descarta capa, autor e sinopse válidos. Retorna metadados com aviso traduzido, sem capítulos/total inventados e sem cache de falha. Atualizar a obra repete a tentativa. parsePage continua sinalizando catálogo indisponível como erro.
- Capítulos: URLs repetidas continuam eliminadas; números repetidos não são usados como identidade. Qualquer reinício de número sem contexto de volume preserva a ordem original, evitando agrupar vários “Capítulo 1” com títulos diferentes no começo. Cache estrutural versionado para não reutilizar ordenação antiga.
- Aprendizado: links de obras, login, estante pessoal e promoções deixam de ser candidatos a catálogo de navegação. Detalhes não reaprendem filtros/listagens do site inteiro. Removidas sondagens cegas de seis caminhos irmãos, como `/chapters.html` e `/directory.html`; links de catálogo encontrados no HTML e protocolos estruturais existentes permanecem.

## Validação e limites

26 grupos com Cheerio real e HTTP simulado, suíte Node legada, suíte Python,
sintaxe de 15 Masters e Distribution Guard aprovados. Teste cobre falha de
catálogo seguida de nova tentativa bem-sucedida, preservando metadados.

Os seis JS enviados têm runtime idêntico ao template 0.8.4: não houve truncamento.
VALIDACAO_FILHOS_v0.8.5.json registra hashes sem copiar configurações ou chaves.

O HTML autenticado atual de NovelLive e 17K não ficou acessível neste ambiente
(HTTP 403 e 405, respectivamente). Portanto, esta versão corrige falhas comuns
comprovadas, mas NÃO certifica extração completa dos capítulos nesses sites.
Não foi inventada API, URL de capítulo nem quantidade para fazê-los parecer
funcionais. Se continuarem sem catálogo, é necessário examinar o HTML real da
página de detalhes e do catálogo após o WebView, além do novo log.

A imagem do Quanben mostra títulos diferentes com números iguais. Isso sustenta
correção de ordem, não exclusão indiscriminada de capítulos. Duplicatas já salvas
no banco local do LNReader não são apagadas por este gerador.

Cloudflare/WebView permanece como na versão confirmada pelo usuário.
Falhas de ícone de fonte nos domínios anquanben.ii/anquanben.io são distintas
 das capas de livros; não houve troca silenciosa de domínio nem implementação
 de cache negativo de ícones nesta atualização.

## Atualização

1. Faça backup da pasta atual. Extraia este ZIP e preserve sua `factory-data` local.
2. Execute `bash scripts/serve_termux.sh` e atualize o Master no LNReader.
3. Cole novamente a URL de cada fonte no Master do idioma desejado; instale a
   atualização do filho que aparecer no repositório local. Filhos já instalados
   não mudam apenas com a atualização do servidor/Master.
4. Atualize as informações da obra no LNReader. Se necessário, abra o WebView
   como antes e tente novamente. Preserve biblioteca, downloads e progresso.

Nenhum APK compilado, plugin oficial copiado ou filho privado incluído no ZIP.
PATCH_v0.8.4_to_v0.8.5.patch e seu manifesto SHA-256 descrevem esta atualização;
os patches anteriores foram mantidos.

## Referências de contrato analisadas

- https://github.com/LNReader/lnreader/blob/158786ccd509b362ea6cb0230697b098db2f629d/src/services/plugin/fetch.ts
- https://github.com/LNReader/lnreader/blob/158786ccd509b362ea6cb0230697b098db2f629d/src/database/queries/ChapterQueries.ts
- https://github.com/lnreader/lnreader-plugins/tree/7a341ca957567d664e44a82a982d3464eac932d0
