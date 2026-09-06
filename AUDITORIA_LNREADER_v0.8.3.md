# Auditoria LNReader / Factory — v0.8.3

Data: 2026-09-05. Base: ZIP v0.8.2 fornecido. Aplicativo consultado apenas como código-fonte; nenhum APK foi compilado. Os repositórios oficiais não foram modificados nem incorporados à distribuição.

## Conclusão

O problema principal não parece ser uma informação secreta omitida pelo desenvolvedor do LNReader. Os contratos estão nos tipos, helpers, consumidor de plugins e templates multisrc. A Factory tinha implementações parciais desses contratos, e parte do histórico descrevia a detecção de uma família como se isso representasse suporte completo ao seu protocolo.

Uma URL fornece o ponto de entrada. É o HTML da obra, a rota de catálogo anunciada, o ID local da obra, o método HTTP e o formato da resposta que determinam o adaptador. Compartilhar um hostname, uma palavra no HTML ou um tema não basta para garantir compatibilidade.

## Fontes fixadas

- App: commit `158786ccd509b362ea6cb0230697b098db2f629d`.
- Plugins: commit `7a341ca957567d664e44a82a982d3464eac932d0`.
- Pesquisa estática dos contratos e templates. Não foi executada a coleção de plugins contra todos os sites. “Plugin funciona” não foi assumido como evidência de disponibilidade atual do site.

## Contrato do aplicativo que interessa ao gerador

| Contrato | Consequência prática |
|---|---|
| `popularNovels(pageNo, options)` e `searchNovels(term, pageNo)` retornam arrays | Não misturar cartões de criação com obras permanentes; página repetida deve encerrar navegação |
| `parseNovel` retorna metadados e `chapters`; `totalPages` é número de páginas | Não usar maior número de capítulo como quantidade de capítulos; informar também uma única página para atualizar totais antigos |
| `parsePage(novelPath, page)` recebe página como string e retorna `{chapters}` | A Factory pode manter fatias locais de 24 ou paginação remota comprovada; não deve misturar os dois protocolos na mesma obra |
| Capítulo tem `path`, `name`, `chapterNumber`, `releaseTime` e `page` opcionais | Identidade é a URL; volumes/reinícios não podem ser deduplicados apenas por número |
| `parseChapter` retorna HTML | Continua sendo o caminho de leitura/download; customJS de leitor não preenche catálogo antes disso |
| `resolveUrl` e URLs absolutas | O WebView precisa abrir a fonte correta; o filho usa seu domínio, não o endereço local do Master |
| `fetchApi` acrescenta headers e chama `fetch` | Não é um solucionador de Cloudflare nem um segundo motor de rede independente |
| `fetchText` faz nova requisição e usa FileReader | Chamá-lo depois de `fetchApi` duplicava a requisição em charsets legados |
| `webStorageUtilized` salva localStorage/sessionStorage | Essa flag não comprova resolução de CAPTCHA nem é sinônimo de sincronização de cookies |
| Storage tem namespace por plugin e expiração opcional | Cache em memória precisa de expiração própria; o timestamp no storage não expira um Map |
| Loader permite um conjunto definido de módulos | Não adicionar dependências Node ao JS entregue ao Android; Cheerio adicional desta entrega é apenas para teste local |

Fontes: [tipos do plugin](https://github.com/lnreader/lnreader/blob/158786ccd509b362ea6cb0230697b098db2f629d/src/plugins/types/index.ts), [carregamento e módulos](https://github.com/lnreader/lnreader/blob/158786ccd509b362ea6cb0230697b098db2f629d/src/plugins/pluginManager.ts), [rede](https://github.com/lnreader/lnreader/blob/158786ccd509b362ea6cb0230697b098db2f629d/src/plugins/helpers/fetch.ts), [storage](https://github.com/lnreader/lnreader/blob/158786ccd509b362ea6cb0230697b098db2f629d/src/plugins/helpers/storage.ts), [WebView](https://github.com/lnreader/lnreader/blob/158786ccd509b362ea6cb0230697b098db2f629d/src/screens/WebviewScreen/WebviewScreen.tsx), [consumidor](https://github.com/lnreader/lnreader/blob/158786ccd509b362ea6cb0230697b098db2f629d/src/services/plugin/fetch.ts), [atualização de páginas](https://github.com/lnreader/lnreader/blob/158786ccd509b362ea6cb0230697b098db2f629d/src/services/updates/LibraryUpdateQueries.ts).

## Bugs encontrados e alteração aplicada

| Evidência na v0.8.2 | Efeito | v0.8.3 |
|---|---|---|
| `searchByUrl` lança erro antes de registrar um domínio protegido | Filho não aparece; usuário não tem o WebView próprio dele | Registra filho mínimo protegido; cartão indica WebView; repetir a URL pode refinar depois da verificação |
| `registerProfile` engole falha e retorna null | Cartão “criado” mesmo sem confirmação do servidor | Erro explícito de registro; nenhum cartão novo de sucesso |
| Detector considera qualquer Turnstile/challenge script no corpo como bloqueio | Formulários de comentários ou JS de proteção em página normal podem bloquear criação | Distingue CDN, widget e intersticial; mantém header `cf-mitigated: challenge`, título/intersticial e sinais em HTTP de bloqueio |
| Madara reconhecido, mas `extractArchitectureChapters` só tinha fast-path WooCommerce | Lista AJAX não era buscada pelo protocolo correto | POST por obra e fallback `manga_get_chapters` com ID do DOM atual |
| ReadNovelFull podia ser apenas uma classificação | Arquivo de capítulos não recuperado | GET de archive somente com `#rating[data-novel-id]`, suporta HTML e envelope JSON `html` |
| Todo catálogo virtual precisava ser obtido antes de renderizar detalhe | Obras grandes atrasam o primeiro render | Protocolo remoto WebNovelWorld quando DOM, contagem e link da própria obra confirmam o padrão; primeiro lote de 100 e demais sob demanda |
| `fetchCatalogPagesFresh` ignora erros e retorna o que acumulou | Timeout em página anunciada vira total aparentemente válido | Interrupção de paginação explícita gera erro recuperável, sem cache daquele resultado |
| Fallback corta sequência antes de um salto extremo | Quantidade parcial pode parecer definitiva | Lacuna extrema não resolvida gera erro de catálogo incompleto |
| Nenhum capítulo encontrado vira um capítulo apontando para a própria obra | Catálogo com um capítulo falso | Erro “catálogo não encontrado”; não fabrica capítulo |
| Map de catálogos sem TTL/limite; metadados sem TTL | Capítulos novos invisíveis e memória acumulada | Catálogo e metadados com TTL de 2 minutos; no máximo quatro catálogos no Map; chave nova e envelope validam URL |
| Charset legado executa fetchApi e depois fetchText | Duas transferências da mesma página | FileReader sobre clone da resposta existente, quando disponível; fallback de decodificação preservado |
| Sondagens de criação usam Promise.race sem abortar transporte | Requisição continua após timeout | Sondagens principais passam AbortSignal; remove duas sondagens opcionais de manifesto de ícone do caminho crítico |
| parsePage espera tradução por até 7,5 segundos | Rede de tradução aumenta a espera para capítulos | Janela de apresentação de 1,2 segundo, retorna originais em falha |

## Matriz de arquitetura: suporte não é apenas detecção

| Família/padrão | Evidência upstream | Situação nesta entrega |
|---|---|---|
| Madara | Dois protocolos POST, ID e paginação AJAX | Implementados por sinais DOM, mesma origem, ID da obra atual; sem lista de domínios importada |
| ReadNovelFull | Archive HTML/JSON e variantes parametrizadas | Implementado archive GET com novelId; variantes `indexListPage`/POST/JSON paginado não são tratadas como equivalentes |
| WebNovelWorld | totalPages e rota `/chapters/page-N`, lotes de 100 | Implementado quando a página anuncia rota da própria obra, título e contagem; divergência de tamanho é erro |
| WooCommerce/The7/WPBakery | Produto, galeria, descrição e busca AJAX | Mantida implementação anterior; não representa todo plugin WordPress |
| Fictioneer | Grupos de capítulos e classes de publicação/lock | Detecção/fallback existentes mantidos; não foi implementada toda a política oficial de capítulos privados |
| LightNovelWP | DOM próprio e parser especializado | Detecção/seletores anteriores mantidos; variantes não garantidas |
| ReadWN | HTML e busca POST | Detecção/fallback mantidos; busca especializada não portada nesta versão |
| Ranobes | Catálogo remoto, páginas de 25 e variações de rota | Inspecionado como referência; não ativado só por semelhança com WebNovelWorld |
| HotNovelPub | API própria de livros e capítulos | Exige origem/API e schema comprovados; detecção anterior não equivale a API completa |
| NovelCool | POST com parâmetros específicos do cliente | Não copiamos credenciais/configurações do plugin oficial; detecção não significa protocolo suportado |
| MTLNovel, NovelFire, IFreedom, RuLate | Estratégias próprias de listagem/detalhe/rede nos templates | Inspeção dos pontos de entrada; classificadores e fallback anteriores mantidos, sem promessa de cobertura integral |
| Shuqi/Yuewen/portais estáticos | Implementações do ZIP, identidades e catálogos próprios | Preservados e cobertos pelas regressões anteriores; APIs ao vivo não revalidadas no Android |

Fontes de implementação: [Madara](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/multisrc/madara/template.ts), [opções Madara](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/multisrc/madara/README.md), [ReadNovelFull](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/multisrc/readnovelfull/template.ts), [WebNovelWorld](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/multisrc/webnovelworld/template.ts), [Fictioneer](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/multisrc/fictioneer/template.ts), [LightNovelWP](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/multisrc/lightnovelwp/template.ts), [ReadWN](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/multisrc/readwn/template.ts), [Ranobes](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/multisrc/ranobes/template.ts), [HotNovelPub](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/multisrc/hotnovelpub/template.ts), [NovelCool](https://github.com/lnreader/lnreader-plugins/blob/7a341ca957567d664e44a82a982d3464eac932d0/plugins/multisrc/novelcool/template.ts).

## Conferência dos patches anteriores

O ZIP original contém CHANGELOGs e TEST_REPORTs; não havia diff `.patch` aplicável. Os históricos foram preservados. Esta atualização acrescenta ambos: CHANGELOG e diff de arquivos.

| Histórico | Revisão |
|---|---|
| 0.7.1–0.7.2 | Prefetch descrito foi substituído nas versões seguintes; não reativado. Paginação estática preservada |
| 0.7.3–0.7.5 | Recuperação, dedupe e isolamento existem, mas corte de sequência e cache podiam mascarar contagem parcial; corrigidos os caminhos descritos acima |
| 0.7.6 | Redução de probes e independência do filho existem. “Native vs JS” não deve ser lido como dois motores nativos diferentes |
| 0.7.7 | Lista de famílias não comprovava suporte aos respectivos endpoints. A matriz desta auditoria substitui essa interpretação |
| 0.7.8 | Sem prefetch de capítulos no detalhe/leitor permanece. Não significa ausência de toda tarefa auxiliar: profiler e persistência ainda existem |
| 0.7.9 | Distribution Guard existe, é executável e continua obrigatório; não há plugins oficiais/filhos no release |
| 0.8.0 | Aprendizagem de site e detalhe separada permanece; geração não deve anunciar sucesso sem registro confirmado |
| 0.8.1 | Deadline por operação existe, mas interrupção de catálogo podia devolver lista parcial. “Fallback seguro” por truncamento não garantia total correto |
| 0.8.2 | Regressões de Shuqi, obra A/B e ícones continuam; não foram convertidas em alegações de teste ao vivo |

`runtime.template.js` é a fonte executável autoritativa. `runtime.template.ts` continua referência legada, explicitamente documentada; não deve gerar versões novas. Os 15 Masters foram regenerados pelo servidor Python a partir do JS atualizado, sem transpilar ou compilar o aplicativo.

## Validação e limites

Ver `TEST_REPORT_v0.8.3.txt`. Testes novos usam Cheerio real e transporte/storage simulados; testes antigos exercitam outras regressões com DOM simplificado. Há diferença entre verificar protocolos e medir renderização no aparelho. Não foi medido FPS, consumo real de Hermes ou tempo real em rede móvel.

Cloudflare ainda pode exigir interação humana. Instalar o filho permite abrir o WebView correto, mas não resolve automaticamente qualquer desafio. O plugin não tem uma API pública para abrir/aguardar esse WebView por conta própria. Cookies, User-Agent e comportamento da versão instalada precisam ser verificados no Android.

Catálogos genéricos sem contagem anunciada ainda não têm prova matemática de completude. O novo erro cobre falhas de paginação conhecida e lacunas extremas, não todos os tipos possíveis de teaser. Limites de 20.000 capítulos/80 páginas AJAX permanecem deliberados; sites fora desses limites precisam de paginação remota apropriada. A v0.8.3 não promete suporte universal só a partir do link.

Traduções que excedem a janela visual retornam originais; algumas Promises de tradução já iniciadas podem continuar até o timeout interno do lote. Não foi afirmado cancelamento global de todo trabalho quando o usuário fecha uma tela, porque a API do plugin não fornece esse ciclo de vida.

## Atualização sem perder dados

1. Pare o servidor Factory no Termux.
2. Mantenha `factory-data/` atual (perfis, filhos e configurações locais); não o substitua pelos JSONs vazios do release.
3. Substitua os arquivos de código, templates e distribuição; reinicie o servidor.
4. Atualize os Masters no LNReader para 0.8.3. Filhos já instalados guardam o JS antigo: cole novamente a URL no Master e instale a atualização do filho.
5. Se aparecer indicação de WebView, instale o filho, abra o WebView dele, conclua a verificação e tente novamente. Para refinar o perfil inicial, repita a URL no Master.
6. Para comparar versões, use `CHANGELOG_v0.8.3.md`, este relatório e `PATCH_v0.8.2_to_v0.8.3.patch`. O diff não contém alterações nos dados locais.

## Evolução recomendada

Para novas famílias, registre a evidência estrutural junto com fixtures: URL da obra, seletor do ID, método, endpoint, formato, paginação, identidade e condição de término. Acrescente um teste negativo com outra obra e uma resposta incompleta antes de ativar o protocolo. Para APIs cuja configuração não está na página, peça configuração explícita; não invente parâmetros.
