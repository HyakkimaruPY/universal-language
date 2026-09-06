# Factory - Ance v0.8.3 — Protocolos e integridade de catálogo

Base: v0.8.2. Análise estática do LNReader e dos multisrc; sem compilar o aplicativo.

- Cloudflare: filho mínimo instalável com indicação de WebView, verificação pendente e nova tentativa. CDN/Turnstile em página normal não equivalem a intersticial.
- Registro: falha do servidor não produz cartão falso de criação.
- Madara: POST por obra, fallback antigo com ID atual e paginação AJAX; HTML/JSON de archive ReadNovelFull com evidência DOM.
- WebNovelWorld: paginação remota de 100 capítulos sob demanda quando o DOM confirma rota e contagem.
- Catálogos: páginas anunciadas interrompidas, repetição AJAX e saltos extremos não resolvidos geram erro; removido capítulo fictício apontando à obra.
- Cache: metadados e catálogos expiram em 2 minutos; Map de catálogos limitado a quatro obras, versão de chave e verificação da URL.
- Rede: charsets legados usam a resposta já recebida com FileReader, sondagens iniciais abortáveis e menos probes opcionais de ícone.
- Apresentação: parsePage permite retorno de títulos originais após janela de 1,2 s; totalPages também informado quando igual a 1.
- Novos testes com DOM real; regressões anteriores e 15 Masters preservados.
- Acrescentado diff aplicável, auditoria com fontes fixadas e correções das alegações dos CHANGELOGs anteriores.

Limites: não validado em Android; não é promessa de solução automática de Cloudflare nem de suporte a qualquer API/site. Veja a matriz e os limites em AUDITORIA_LNREADER_v0.8.3.md.
