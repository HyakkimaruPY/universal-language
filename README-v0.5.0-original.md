# Translator Hell v0.5.0 — retomada consolidada

Esta versão retoma o trabalho interrompido a partir da base `v0.4.8` e aplica os itens escolhidos **1, 2, 4 e 5** da evolução planejada.

## Escopo confirmado

1. **Auditor automático + autocorreção**
   - valida cada tradução contra o original;
   - detecta saída vazia, truncamento grosseiro, expansão anormal, números/quantidades desaparecidos e duplicação suspeita em lote;
   - preserva os fragmentos aprovados e repete apenas os fragmentos reprovados;
   - mantém os fallbacks dos providers existentes.

2. **Memória de nomes e terminologia por obra**
   - memória separada por obra/livro;
   - correções feitas pelo usuário têm prioridade;
   - correspondências exatas podem ser reaproveitadas sem nova requisição;
   - uma amostra da terminologia já validada é inserida no prompt dos providers de IA para manter consistência.

4. **Extrator adaptativo**
   - mantém as regras específicas já existentes (inclusive Hetushu/ordem visual);
   - aprende o seletor do contêiner principal de leitura por rota/site quando uma extração é considerada boa;
   - reutiliza o perfil aprendido nas próximas páginas;
   - limita o número de perfis persistidos para não crescer indefinidamente.

5. **Pré-tradução inteligente do próximo capítulo**
   - o gatilho é o **progresso da tradução**, não a rolagem do leitor;
   - ao ultrapassar **60% da tradução do capítulo atual**, o próximo capítulo entra na fila;
   - o capítulo atual termina primeiro; em seguida começa automaticamente a tradução do próximo;
   - não é necessário chegar a 60% de leitura nem tocar em “próximo capítulo” para começar;
   - se o próximo capítulo já estiver pronto, o Leitor troca para ele internamente, sem recarregar a página;
   - se o pré-carregamento falhar, a navegação normal continua como fallback.

## Regra de armazenamento atual + próximo

A observação mais recente substitui a interpretação inicial de “guardar só um capítulo”. A janela correta agora é:

- enquanto lê **N**: cache de **N + N+1**;
- ao abrir **N+1**: apaga **N**, mantém **N+1** e começa a preparar **N+2**;
- portanto há no máximo **dois capítulos da mesma obra** na janela ativa;
- correções do capítulo armazenado fazem parte da versão reaproveitada;
- o cache global também possui limite de segurança.

## Distribuições

### Monolítica
`translator_via_v0.5.0.user.js`

É a referência funcional principal. Conserva Home, Leitor, Tradutor, Fix Tradução e providers no mesmo userscript e recebe as novas funções acima.

### Modular
Pasta `modular/`:

- `translator_hell_tradutor_v0.5.0.user.js`
  - serviço de tradução compartilhado por eventos DOM;
  - Google, BigModel, Pollinations, Groq e Mix;
  - auditor/autocorreção e memória terminológica;
  - funciona sozinho com um controle mínimo “Traduzir página”.

- `translator_hell_leitor_v0.5.0.user.js`
  - extração/adaptação, leitor e cache deslizante atual+próximo;
  - usa o módulo Tradutor automaticamente quando presente;
  - sem o Tradutor, usa Google como fallback;
  - pré-traduz o próximo capítulo após o limiar de 60% da tradução;
  - registra a obra na Home através da ponte em `example.com`.

- `translator_hell_home_v0.5.0.user.js`
  - Home/biblioteca modular;
  - recebe atualizações do Leitor pela ponte `?translatorhell-bridge=1`;
  - a interface principal é aberta com `?translatorhell-home=1`.

## Protocolo modular

O Tradutor e o Leitor usam eventos DOM locais:

- requisição: `translator-hell:v1:translate-request`
- resposta: `translator-hell:v1:translate-response`

O Leitor também verifica `window.__translatorHellV1.translate`, o caminho mais curto quando ambos os módulos estão instalados.

A Home usa `postMessage` pela origem `https://example.com` com o tipo:

- `translator-hell:v1:library-upsert`

## Compatibilidade e segurança de regressão

- A v0.5 usa uma nova chave de cache de capítulos (`v2`) na monolítica, evitando misturar a política antiga de até 24 capítulos com a nova janela de 2 por obra.
- O frame usado para montar o layout do próximo capítulo recebe `#translatorhell-prefetch-frame`; a cópia do userscript dentro dele não injeta outra UI.
- Para Hetushu, o pré-carregamento prefere um iframe real para que CSS/ordem visual sejam aplicados antes da extração. Um HTML solto não é aceito como fallback quando isso poderia reembaralhar o texto.
- Navegação interna só ocorre quando existe cache pré-traduzido válido. Caso contrário, continua usando a navegação/reload tradicional.

## Testes executados nesta retomada

- `node --check translator_via_v0.5.0.user.js`
- `node --check` nos três módulos separados
- conferência estática da presença dos pontos de integração: memória, auditor, perfis adaptativos, limite de 2 capítulos, fila >=60%, prefetch e troca interna.

Esses testes garantem integridade sintática e integração estática. O comportamento final em Via/Tampermonkey deve ainda ser validado em páginas reais, especialmente sites com CSP/anti-iframe e navegação incomum; nesses casos os fallbacks existentes devem impedir quebra da leitura normal.
