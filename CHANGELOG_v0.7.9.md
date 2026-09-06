# Factory - Ance v0.7.9 — Distribution Guard

Base direta: v0.7.8 estável.

## Regra de distribuição automatizada

O repositório oficial de plugins do LNReader é material de referência de engenharia.
Nenhum plugin oficial estudado pode ser incorporado como extensão pronta à Factory.

A v0.7.9 adiciona `scripts/distribution_guard.py`, que falha a release quando encontra:

- qualquer JS de plugin além dos 15 `translatorHellMaster_*`;
- qualquer filho em `.js/src/plugins/generated/`;
- assets de filhos em `public/static/src/generated/`;
- qualquer `th_*` nos manifests distribuídos;
- `factory-data/children.json` não vazio;
- perfis aprendidos em `factory-data/profiles.json`;
- chaves/modelos/ordem privados em `factory-data/credentials.json`.

Menções a plugins oficiais em documentação de pesquisa são permitidas; o bloqueio é sobre
código/artefatos distribuídos, não sobre referências textuais.

## Termux

Antes de empacotar:

```bash
bash scripts/verify_release.sh
```

O comando executa self-test Python, runtime Node, `node --check` dos 15 Masters e o
distribution guard. Qualquer vazamento encerra o processo com código diferente de zero.

## GitHub Actions

`.github/workflows/distribution-guard.yml` executa a mesma validação em push, pull request
e manualmente (`workflow_dispatch`). Assim um plugin oficial/filho acidental não chega a
uma release pública.

`export_public_repo.py` também executa o guard sobre o webroot recém-exportado antes de
considerá-lo válido.
