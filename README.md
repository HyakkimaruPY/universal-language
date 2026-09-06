# Universal Language — Factory - Ance

Gerador de extensões para LNReader, versão 0.8.6. Executa no Termux e cria um
plugin-filho a partir da URL da fonte, no idioma escolhido entre 15 Masters.

```bash
bash scripts/serve_termux.sh
```

Repositório local do LNReader: `http://127.0.0.1:8765/.dist/plugins.min.json`.
Mantenha o servidor ativo durante a criação e retradução. Filhos e chaves ficam
no dispositivo; este repositório contém código e testes, não fontes particulares.

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
