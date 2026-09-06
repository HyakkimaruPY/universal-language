# Universal Language — Factory - Ance 0.8.8

Extensão pai para LNReader com fontes por domínio armazenadas no telefone.
Os Masters públicos funcionam sem Termux; o GitHub distribui código e atualizações.
As fontes salvas são acessadas dentro do Master, sem instalar plugins separados.

## Instalar e usar

Cole este endereço Raw no gerenciador de repositórios do LNReader:

```text
https://raw.githubusercontent.com/HyakkimaruPY/universal-language/main/lnreader-prebuilt/.dist/plugins.min.json
```

Remova o endereço `github.com/.../blob/...`: ele entrega HTML e causa erro de JSON.

1. Instale/atualize o Master do idioma desejado para 0.8.8.
2. Abra a busca dessa fonte e cole a URL de um site. O Master salva o perfil e
   apresenta livros reais; não cria um livro fictício representando o domínio.
3. Para alternar, use a engrenagem do Master e escolha **Fonte / Source**.
4. Quando houver desafio do site, abra seu WebView, resolva-o e tente novamente.
5. No capítulo, dois toques rápidos em um parágrafo solicitam retradução direta.

Catálogo, detalhes e capítulos são buscados diretamente do site. Google é o
tradutor padrão. Chaves opcionais de IA para a tradução inicial podem ser inseridas
nas configurações do Master; ficam no armazenamento do plugin, não no GitHub.
A retradução por toque usa Google diretamente. A revisão é visual na sessão atual.
Serviços de tradução e sites continuam exigindo conexão à internet.

## Limites

[Autonomia e interface do LNReader](AUTONOMIA_LNREADER.md): o app não oferece uma
API para uma extensão instalar outra. Esta implementação mantém fontes dentro do
Master. Não altera nem compila o app e não simula instalação de filhos separados.
Os parsers são adaptativos; não há garantia de suporte a qualquer site. O catálogo
completo de NovelLive continua necessitando validação no aparelho.

## Desenvolvimento

```bash
npm ci --ignore-scripts
python scripts/publish_masters.py --write
bash scripts/verify_release.sh
```

O runtime executado é `factory-templates/runtime.template.js`; a referência antiga
TypeScript não deve sobrescrevê-lo. GitHub Actions verifica a exportação, os parsers,
persistência/isolamento de fontes e os leitores gerados com rede simulada.
Workflow verde não comprova CAPTCHA/cookies ou DOM atual de todos os sites.

`bash scripts/serve_termux.sh` mantém o fluxo legado de desenvolvimento e teste
local. Ele não é requisito para os Masters públicos. Antes de publicar após esse
fluxo, regenere a exportação pública com `publish_masters.py --write`.

Veja [mudanças da v0.8.8](CHANGELOG_v0.8.8.md), relatórios e patches na raiz.
