# Factory - Ance v0.7.2

- Corrige a faixa/espaço preto persistente em portais agregados como `quanben.io`.
- Detecta homepage com muitas categorias e sem paginação global e encerra o browse na página 1.
- Remove paginação artificial nesses portais, mantendo paginação real em sites que a possuem.
- Limita a sinopse a 2.000 caracteres para reduzir custo de layout/FPS.
- Master passa a usar `factory_ance_v072.png` 96×96 em uma URL nova, evitando o cache da logo antiga.
- Motor rápido de metadados/capítulos da v0.7.1 preservado.
