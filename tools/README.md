# field-shift-tools

Ferramentas determinísticas de extração e mapeamento de dados (NASA POWER, NASA SMAP/GPM IMERG/MODIS, Open-Meteo, ZARC, IBGE, DERAL, SoilGrids, INMET, Copernicus DEM) para o consultor agrícola. Expostas como CLI, como servidor MCP e como funções importáveis.

```bash
bun install
bun run cli                      # lista as ferramentas
bun run cli comparar_estrategias --cep 87209000 --cultura soja --dataPlantio 2026-12-15 --historico batata
bun test                         # testes unitários (sem rede)
bun run verificar                # roda tudo para Cianorte e grava docs/dados/
bun run mcp                      # servidor MCP (stdio)
```

Documentação:
- [../docs/ferramentas.md](../docs/ferramentas.md): arquitetura, catálogo, monitoramento
- [../docs/fontes-de-dados.md](../docs/fontes-de-dados.md): fontes, chaves, formatos
- [../docs/cenarios.md](../docs/cenarios.md): cenários de contato e formato das respostas

Variáveis (`.env`): `EARTHDATA_TOKEN` (satélites SMAP e IMERG), `INMET_TOKEN` (dados das estações INMET) e `FIELD_CACHE_DIR` (pasta do cache; padrão `tools/.cache`).
