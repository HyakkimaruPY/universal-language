# Factory - Ance v0.8.4 — revisão a partir de falhas reais

Base: v0.8.3 entregue nesta conversa. Data: 2026-09-05.
O aplicativo LNReader não foi modificado nem compilado. Nenhum plugin oficial foi empacotado.

## O que o relato comprova

- ScribbleHub: quatro respostas HTTP 403 viraram `sourcePage status=ok items=0`. O erro do transporte era engolido antes do cache da listagem. Assim a tela “nenhum resultado” não distinguia falta de obras de acesso bloqueado.
- Quanben: catálogo normal continha 47 entradas, capítulos numerados de 1 a 2420, com 2373 lacunas. O algoritmo procurava nomes de rotas alternativos sem recuperar os capítulos intermediários.
- Tradução: o log mede 1833–2338 ms na etapa visual, mas não informa HTTP, separação do lote ou quantos títulos foram traduzidos. Não é possível concluir só desse log qual falha de tradução ocorreu.
- As extensões foram criadas pelo Master `_es`, portanto o idioma de saída continua espanhol. A interface chinesa do LNReader é uma configuração do aplicativo; a Factory traduz o conteúdo, não os botões do aplicativo.

## Correções de causa raiz

### Erro de rede não é catálogo vazio

`fetchBrowsePage` agora propaga desafios, 401, 403 e 429. A busca também preserva esses erros. Outros erros de transporte são conservados no orçamento e reapresentados quando todas as rotas falham. Não é marcado fim de catálogo por causa de Cloudflare.

O cache estrutural não guarda uma primeira página vazia. Repetir a primeira página permite recuperação sem reinstalar o filho, depois que o código atualizado já está instalado. O teste novo executa 403, verifica ausência de cache, simula autorização e repete a chamada no MESMO objeto de plugin, recuperando cinco obras.

O transporte prioriza `fetchApi`, que no código do LNReader acrescenta o User-Agent do aplicativo, também usado no WebView. Uma preferência antiga por fetch JS não pode retirar esse header da tentativa inicial. Isso não importa cookies manualmente e não comprova que uma verificação humana tenha sido resolvida no dispositivo.

### Identidade de capítulo não é identidade de representação HTTP

A comparação canônica removia `/amp` e eliminava a rota alternativa antes de qualquer requisição. A equivalência ainda serve para deduplicar capítulos; a seleção de páginas a consultar usa URLs distintas. A regressão usa uma lista 1..24 + 2398..2420 e verifica que a Factory consulta a representação AMP e recupera 2420 entradas, preservando seus hrefs.

Também foi acrescentada a relação de espelho Quanben → quanben5 documentada no plugin oficial como dica de rota, sem transportar o plugin inteiro. Antes de aceitar uma representação de outro domínio, a Factory exige nomes coincidentes de pelo menos três capítulos. Não gera `/<posição>.html`: mantém os links encontrados. O espelho não foi validado ao vivo nesta execução; se não responder ou os nomes divergirem, não é declarado completo.

### Metadados explícitos antes de heurísticas

Vocabulário `og:novel:book_name`, `og:novel:author`, `og:novel:status`, `og:novel:category` e `og:description` passou a alimentar o resultado. A mudança vale para qualquer domínio que publique esses metadados. Status é convertido ao enum esperado pelo LNReader.

Cards `div.list2 > ... h3 > a` passam por um extrator estrutural curto, com a capa buscada dentro do mesmo card. Isso reduz a varredura semântica geral em portais estáticos.

### Protocolo fictionposts, observado no ScribbleHub

- Cards `.search_main_box`, título `.search_title > a` e capa `.search_img > img`.
- Paginação por `pg`, sem substituir por `page`.
- Metadados `.fic_title`, `.fic_image`, `.wi_fic_desc`, `.auth_name_fic` e `.fic_genre`.
- Catálogo via POST `wi_getreleases_pagination`, `pagenum=-1` e ID da obra extraído de `/series/<id>/`.
- TOC `.toc_w` e conteúdo `.chp_raw`; ordem mais recente primeiro convertida em ordem de leitura.
- Para o bootstrap bloqueado especificamente do ScribbleHub, há apenas uma dica de rota `series-finder`; não uma extensão pronta embutida. Outros hosts ativam os mesmos parsers por sinais DOM.

O plugin oficial não contém solução própria para Cloudflare. Um HTTP 403, isoladamente, não prova que login seja obrigatório. Esta entrega corrige roteamento, erro/cache e o protocolo após acesso autorizado; não promete transpor qualquer desafio.

### Tradução visual recuperável

Quando o lote falha por HTTP/timeout ou retorna uma divisão inválida, há fallback por título com concorrência e prazo limitados. O cache de apresentação ganhou versão nova para não reaproveitar resultados antigos inconsistentes. O diagnóstico `translation-display` informa idioma de destino e quantidade traduzida no fallback, sem registrar o texto do livro.

A janela visual do browse passa a 6,5 segundos no máximo para permitir lote + fallback; o teste antigo de 3,4 segundos foi atualizado deliberadamente para esse novo limite, não removido. É uma troca: mais oportunidade de obter títulos traduzidos na primeira abertura, com maior espera máxima em rede ruim. Falha total ainda devolve originais e permite nova tentativa; não há callback da API que permita prometer atualização automática dos cartões já devolvidos.

Não foi afirmado que o erro real de tradução do aparelho era necessariamente o separador. Foi corrigida a ausência de recuperação/diagnóstico desse tipo de falha, e um teste com lote inválido confirma tradução individual para espanhol.

## Padrões estudados em outros idiomas

| Referência | Padrão observado | Aplicação/limite |
|---|---|---|
| ScribbleHub, inglês | WordPress com post_type próprio, paginação pg e catálogo AJAX | Novo protocolo estrutural fictionposts |
| Quanben, chinês | Metadados OG específicos, teaser, representação alternativa e espelho | OG genérico, identidade de representação separada, preservação de href e validação de espelho |
| NovelMania, português | API `/api/novels/{slug}`, capítulos JSON paginados e leitura HTML | Reforça separação catálogo/reader e término explícito; não se assumiu que toda API retorna o mesmo schema |
| SkyNovels, espanhol | API em outro subdomínio, detalhes `novel[0]`, volumes e capítulos com ID | ID não é ordinal; API deve ter esquema/origem comprovados. Não foram inventadas URLs a partir de índices |
| Chireads, francês | HTML especializado e busca adicional de capas em detalhes | Cards podem não conter capas; não foi copiado um fan-out de requisições de capa que aumentaria custo no celular |
| Madara/LightNovelWP e demais famílias anteriores | Métodos e seletores dependem do protocolo | Preservados; a matriz da v0.8.3 continua distinguindo detecção de implementação integral |

Fontes:
- [ScribbleHub](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/english/scribblehub.ts)
- [Quanben](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/chinese/Quanben.ts)
- [NovelMania](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/portuguese/novelmania.ts)
- [SkyNovels](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/spanish/skynovels.ts)
- [Chireads](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/french/chireads.ts)

Os padrões genéricos aplicados nesta versão não equivalem a suporte automático completo a NovelMania, SkyNovels ou todos os sites estudados. Copiar nomes de campos de APIs distintas para um fallback universal esconderia novamente os mesmos erros.

## Evidência ao vivo e limites dos testes

- A página indexada do [catálogo de 帝道至尊](https://www.quanben.io/n/didaozhizun/list.html) confirma o formato primeiro lote + últimos capítulos, com “expandir lista completa”. A página [de detalhes](https://www.quanben.io/n/didaozhizun/) contém autor, estado e sinopse.
- Uma página indexada de [capítulo](https://www.quanben.io/n/didaozhizun/1910.html) tem capítulo 1900 numa URL 1910: posição/número textual não é um substituto seguro do href.
- As tentativas de obter HTML diretamente nesta execução encontraram HTTP 502/timeouts em Quanben e espelho, e 403/timeout em ScribbleHub. Não se tratou esses resultados como fixtures HTML válidas.
- A consulta individual pública ao Google para 帝道至尊, destino es, respondeu HTTP 200 com “Emperador Supremo”. Isso não comprova a conexão do telefone nem um lote completo.
- Testes de protocolo usam Cheerio real, documentos sintéticos baseados nas estruturas acima e transporte simulado. Não houve captura de cookies nem teste no Android. Não há afirmação de validação ponta a ponta dos dois sites.

## Correção do histórico

A v0.8.3 bloqueava catálogos incompletos, mas ainda engolia erro de browse e eliminava AMP pela identidade canônica. Os testes de então não cobriam esses fluxos integrados. O relatório anterior é preservado como histórico; não deve ser usado para afirmar que ScribbleHub/Quanben tinham sido validados ao vivo.

## Instalação desta atualização

1. Pare o servidor. Preserve `factory-data/` existente; os JSONs vazios do release não devem sobrescrever seus dados.
2. Atualize código/templates/distribuição e reinicie com `bash scripts/serve_termux.sh`.
3. Atualize o Master para 0.8.4 no LNReader. Para manter espanhol, use o Master espanhol como no log.
4. Cole novamente as URLs no Master e instale a atualização de cada filho. Substituir o ZIP no Termux não muda o JS que o LNReader já instalou.
5. No filho atualizado, abra o WebView se necessário, conclua a verificação e toque em tentar novamente. Um 403 persistente deve agora aparecer como erro, sem virar uma página vazia cacheada.

Acompanhe `browsePage`, `sourcePage` e `translation-display` nos logs. Catálogo com lacunas é marcado como `partial`, e falha de fetch como `error`, em vez de todos os resultados parecerem `ok`.
