# Autonomia: requisito e limite verificado

Requisito do projeto: Termux somente para testes. O telefone executa o gerador,
armazenamento e traduções. GitHub distribui código/padrões/atualizações.
Filhos não devem depender de servidor local ou de publicação dos perfis do usuário.

No LNReader analisado (158786ccd509b362ea6cb0230697b098db2f629d),
`src/plugins/pluginManager.ts` fornece aos plugins `@libs/storage`, fetch,
Cheerio e algumas bibliotecas auxiliares. `installPlugin` e NativeFile pertencem
ao aplicativo; não são exportados em `packages` nem na interface `Plugin`.
`src/plugins/helpers/storage.ts` restringe as chaves ao identificador do plugin.
Assim, guardar código de um filho no storage não o registra como plugin no app.

Sem alterar o app, a alternativa suportada é guardar perfis por domínio dentro
do Master e oferecer essas fontes pela interface do próprio Master. Elas não
aparecem como extensões separadas na lista de plugins instalados.

Para filhos independentes, é necessário suporte explícito no app à importação
local de plugins gerados, com confirmação de instalação e armazenamento pelo app.
A solicitação original permite analisar, não modificar/compilar o LNReader;
portanto essa integração não foi criada nem presumida autorizada.

Não utilizar acesso a módulos não expostos, gravação em chaves de outros plugins
ou credenciais GitHub embutidas como substituto dessa API.

A v0.8.7 corrige a URL Raw e os links de download públicos. O teste de exportação
comprova a instalação dos arquivos, não a geração autônoma de filhos. A antiga
dependência de criação do servidor está explicitamente pendente de substituição.
