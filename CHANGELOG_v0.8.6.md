# Factory - Ance v0.8.6 — retradução e paginação

## Diagnóstico

No log fornecido, a tradução inicial funciona no XS8, mas POST /api/factory/translate
falha com RuntimeError. A versão anterior não registrava o erro de cada provedor;
portanto não é possível provar retrospectivamente se foi HTTP 429, bloqueio,
resposta inválida ou outro erro. Foi encontrada uma diferença concreta: o servidor
não dividia trechos grandes antes de montar a URL Google; o runtime inicial dividia.
Também foram encontrados repair:true ignorado e erros ocultados pelo leitor.

## Alterações

- Google no servidor divide texto pelo tamanho codificado da URL (3600 caracteres),
  preserva todos os caracteres e a ordem, valida respostas e limita o tempo total.
- A revisão por IA recebe original e tradução atual. Google continua como fallback;
  repetir a tradução pelo mesmo motor pode retornar o mesmo texto, não uma melhora.
- O leitor tenta Google diretamente se o servidor falhar. Essa tentativa continua
  sujeita à rede/CORS/WebView; não é garantia contra bloqueios do provedor.
- O leitor mostra progresso, erro, resposta inalterada ou sucesso. Não substitui o
  texto anterior quando ambos os caminhos falham. Também rejeita resposta que
  simplesmente devolve o original no lugar da tradução existente.
- Ausência de data-th-original é sinalizada, evitando retraduzir a tradução como
  se fosse o original. Para capítulos antigos sem esse atributo, recarregue o
  capítulo pela extensão atualizada.
- O log do servidor identifica provedor e categoria (ex.: google:HTTP_429), sem
  imprimir URL, credenciais ou o trecho enviado. Isso permite diagnosticar a
  próxima falha real sem depender apenas da classe RuntimeError.
- Paginação: links de capítulo seguinte/recomendações não entram como páginas
  obrigatórias do catálogo. Mantidos os erros quando uma página real falta.
- Catálogos com rotas /book/<id> ou /chapterlist/<id> rejeitam /chapter/<outro-id>/...
  para impedir mistura de capítulos de recomendações.

## O que não está certificado

Não houve teste Android nem acesso ao HTML autenticado atual de NovelLive/XS8.
A paginação completa do NovelLive permanece pendente de validação real. Não foi
adicionada API especulativa nem inventada quantidade de capítulos.

Não há limite explícito de 98 capítulos no extrator revisado. A fixture com 300
capítulos passa. Duas respostas reais com 98 não provam totalidade: podem exigir
outra representação/paginação da fonte, e precisam ser confrontadas com o HTML.

A alteração de trecho é visual na sessão de leitura; não promete persistir a revisão
no arquivo baixado ou no cache interno do LNReader após fechar/reabrir.

## Testes

Suítes Python e Node legadas, 28 grupos Cheerio com rede simulada, testes do
servidor de retradução e execução do JS de leitor realmente gerado. Incluem:
chunking de chinês, recomposição exata, revisão com tradução atual, erros HTTP
seguros, fallback direto, resposta igual, ausência de original, falha preservando
texto, paginação de outra obra rejeitada, catálogo com 300 capítulos.
Sintaxe dos 15 Masters e Distribution Guard aprovados. Sem compilação do app.

## Instalação e teste no telefone

1. Faça backup e preserve sua factory-data. Atualize os arquivos pelo ZIP.
2. Reinicie bash scripts/serve_termux.sh; confirme v0.8.6.
3. Atualize o Master, cole novamente a URL da fonte e instale a atualização do filho.
   O leitor é um arquivo separado instalado junto com o filho: trocar só o servidor
   não atualiza o comportamento visual do leitor já instalado.
4. Feche/reabra o capítulo e dê dois toques rápidos no parágrafo. Observe o aviso.
5. Se falhar, envie o novo POST /api/factory/translate ERROR e o aviso exibido.
   Não envie chaves. Para investigar catálogos, o HTML de detalhes/catálogo após
   WebView é mais informativo que apenas a contagem do log.

Patches anteriores preservados. PATCH_v0.8.5_to_v0.8.6.patch reproduz esta versão
sobre v0.8.5; PATCH_MANIFEST_v0.8.6.json registra hashes dos arquivos alterados.
