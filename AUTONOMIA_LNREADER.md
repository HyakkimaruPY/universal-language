# Autonomia implementada na v0.8.8

Requisito: Termux somente para desenvolvimento; telefone executa perfis, busca,
catálogo e tradução; GitHub fornece arquivos públicos e atualizações.

O modo deviceMode dos Masters públicos usa @libs/storage para perfis por domínio,
seleção de fonte e chaves opcionais. Todas as requisições operacionais vão diretamente
aos sites/provedores. factoryBase é vazio e factoryRequest rejeita chamadas nesse
modo. O leitor público usa Google direto, sem tentativa em localhost.

A fonte escolhida pode ser alterada nas configurações do Master. Perfis continuam
salvos depois de reinicializar a extensão e não se misturam ao abrir obras de outra
fonte. Colar URL bloqueada salva o domínio antes de propagar o desafio e atualiza o
site usado pelo WebView para permitir nova tentativa.

No LNReader analisado (158786ccd509b362ea6cb0230697b098db2f629d),
src/plugins/pluginManager.ts não expõe installPlugin ou NativeFile às extensões.
Storage é restrito por plugin. A solução usa essas interfaces públicas e não acessa
módulos ocultos ou storage de terceiros. Fontes internas NÃO aparecem como filhos
separados na lista de plugins. Esse formato ainda exigiria integração no aplicativo.

As configurações de tradução inicial podem usar chaves de IA locais. O JS do leitor
não recebe essas chaves; sua retradução direta é Google. Não há servidor de revisão
nem persistência da revisão visual depois de fechar a sessão.

Testes usam DOM/rede simulados e verificam zero solicitações à API Factory no modo
público. A validação de fontes reais, cookies e CAPTCHA exige o telefone.
