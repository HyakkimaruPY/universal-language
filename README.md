# Universal Language — Factory - Ance

Gerador de extensões para LNReader, versão 0.8.7. Executa no Termux e cria um
plugin-filho a partir da URL da fonte, no idioma escolhido entre 15 Masters.

```bash
bash scripts/serve_termux.sh
```

Repositório local do LNReader: `http://127.0.0.1:8765/.dist/plugins.min.json`.
Mantenha o servidor ativo durante a criação e retradução. Filhos e chaves ficam
no dispositivo; este repositório contém código e testes, não fontes particulares.

## Instalar a extensão pai pelo GitHub

Cole este endereço no gerenciador de repositórios do LNReader:

```text
https://raw.githubusercontent.com/HyakkimaruPY/universal-language/main/lnreader-prebuilt/.dist/plugins.min.json
```

O endereço `github.com/.../blob/...` mostra uma página HTML, não o JSON esperado
pelo aplicativo. Remova esse endereço antigo para ele não continuar causando erro.

Os 15 Masters e ícones são baixados diretamente do GitHub.

**Autonomia ainda pendente:** esta versão corrige a instalação, mas o código legado
de criação de filhos separados ainda chama o servidor de teste. Isso NÃO atende
à arquitetura final desejada: Termux somente para desenvolvimento, processamento
no telefone e GitHub apenas para distribuição/atualizações. Não trate a instalação
bem-sucedida como confirmação de que a geração autônoma está implementada.

Consulte [a limitação da interface do LNReader](AUTONOMIA_LNREADER.md).
Não acrescente chaves à URL pública do GitHub.

Após mudar o gerador ou sua versão, execute `python scripts/publish_masters.py --write`
antes de publicar. O workflow confere se a exportação está atualizada e se separa
os downloads públicos da API local.

## Desenvolvimento e validação

```bash
npm ci --ignore-scripts
bash scripts/verify_release.sh
```

GitHub Actions executa esses testes em cada push/PR. A suíte gera um filho isolado,
executa o JS do leitor, verifica 15 Masters e rejeita distribuição de dados privados.
Os testes de DOM/HTTP são simulados: workflow verde não comprova CAPTCHA, cookies
ou a arquitetura atual de todos os sites. Não compila o aplicativo LNReader.

O código executado pelo gerador é `factory-templates/runtime.template.js`.
A referência TypeScript antiga não deve sobrescrever esse runtime.

Consulte [mudanças e limites da v0.8.6](CHANGELOG_v0.8.6.md),
[relatório de testes](TEST_REPORT_v0.8.6.txt) e os patches versionados na raiz.
Para atualizar no celular, preserve sua `factory-data`, atualize o Master e gere
novamente os filhos; seus leitores também precisam da atualização.
