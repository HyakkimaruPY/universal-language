# v0.8.7 — manifesto público instalável

Causa do erro `Unexpected character: <`: a URL /blob/ entrega HTML do GitHub.
Além disso, os manifests publicados apontavam url/iconUrl para localhost.

A exportação agora usa raw.githubusercontent.com para JS e ícones, mas conserva
factoryBase em http://127.0.0.1:8765 para preservar o fluxo legado de teste, ainda não autônomo. Corrigido
export_public_repo.py, que antes também trocava a API por uma origem estática.

publish_masters.py gera e verifica os 15 Masters públicos. O workflow rejeita
manifesto desatualizado, downloads locais, assets ausentes e chaves embutidas.
O servidor Termux continua gerando seu próprio manifesto local durante a execução.

Remova a URL /blob/ do app e use a URL Raw documentada no README. Atualize o Master
para 0.8.7. A geração de filhos independentes sem servidor permanece bloqueada pela interface atual do app; veja AUTONOMIA_LNREADER.md.

Esta mudança corrige distribuição/instalação; não modifica parsers de novels nem
certifica que os catálogos pendentes de NovelLive estejam resolvidos.
