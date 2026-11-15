# Ferramentas de mapeamento

Código em [../tools](../tools). São funções determinísticas, sem nenhum modelo de IA dentro. Cada ferramenta busca dados de uma ou mais fontes, calcula indicadores e devolve evidências estruturadas. A mesma função atende três usos:

1. **sob demanda:** pela linha de comando ou importada por outro código;
2. **pelo agente:** pelo servidor MCP, quando o produtor pergunta algo no app;
3. **em segundo plano:** por um job periódico que monitora os plantios e gera os resumos do WhatsApp.

## Arquitetura

```
fontes/         um cliente por API: busca + interpretação (parse) separados
   │            (brasilapi, ibge, nasa-power, open-meteo, zarc, deral, soilgrids, inmet, elevacao, modis, earthdata)
   ▼
core/http.ts    cache em disco com validade por tipo de dado, timeout e novas tentativas
   │            → várias ferramentas da mesma fonte compartilham uma única chamada
   ▼
mapeamentos/    indicadores: geada, calor, chuva, vento, umidade, ZARC, mercado, rotação...
   │            cálculos puros (testados sem rede) + função que busca e calcula
   ▼
ferramentas.ts  catálogo único (nome, grupo, descrição, esquema de entrada zod, executar)
   ├── cli.ts   bun run cli <ferramenta> --arg valor
   └── mcp.ts   servidor MCP (stdio) com as mesmas ferramentas
```

**Agrupamento por fonte.** As ferramentas de clima (`clima_janela`, `risco_geada`, `estresse_calor`, `chuva_janela`) leem as mesmas três chamadas: o histórico de 20 anos do NASA POWER, a previsão de 16 dias e a previsão sazonal. Com o cache, rodar as quatro custa o mesmo que rodar uma. Ferramentas de fontes diferentes (ZARC, DERAL, IBGE, SoilGrids) são independentes, e as compostas as executam em paralelo.

**Formato de saída comum** (`Resultado` em `src/core/tipos.ts`):

```jsonc
{
  "ferramenta": "risco_geada",
  "local":   { "lat": -23.66, "lon": -52.6, "ibge": "4105508", "municipio": "Cianorte", "precisao": "cep" },
  "periodo": { "inicio": "2027-05-01", "fim": "2027-07-31" },
  "resumo":  ["frases curtas e factuais que o agente pode citar"],
  "dados":   { /* números estruturados */ },
  "fontes":  [{ "nome": "NASA POWER", "tipo": "reanalise", "resolucao": "~50 km", "url": "..." }],
  "limitacoes": ["lacunas e cuidados que o agente deve repassar"],
  "geradoEm": "2026-11-15T05:20:07Z"
}
```

`resumo` nunca recomenda nada: só constata. Quem sugere é o agente, e as `limitacoes` existem para ele não afirmar mais do que os dados sustentam.

**Série de clima de qualquer janela** (`mapeamentos/base-clima.ts`). Para cada dia, usa a melhor informação disponível:

| Quando | Fonte | Como ler |
|---|---|---|
| passado (até ~4 dias atrás) | NASA POWER | observado/reanálise |
| hoje até +15 dias | Open-Meteo Forecast | previsão dia a dia |
| +16 dias até ~7 meses | Open-Meteo Seasonal (ensemble) | tendência: totais, médias e probabilidades, nunca datas |
| além disso | climatologia NASA POWER (20 anos) | o normal da época |

Toda janela vem comparada com a normal dos mesmos dias do calendário nos últimos 20 anos.

## Catálogo

Entrada de local, comum a quase todas: `cep`, ou `lat` + `lon` (talhão, preferível), ou `ibge`, ou `municipio` + `uf`. Datas no formato AAAA-MM-DD.

| Ferramenta | Grupo | Entrada extra | Responde a | Fontes |
|---|---|---|---|---|
| `localizar` | local | — | Onde fica? Qual o código IBGE? | BrasilAPI, IBGE |
| `clima_janela` | clima | `inicio`, `fim`, `limiarCalor` | Como vai estar o tempo nessa janela, comparado com o normal? | POWER, Open-Meteo |
| `risco_geada` | clima | `inicio`, `fim` | Vai gear? Com que frequência geou nessa época? | POWER, Open-Meteo |
| `estresse_calor` | clima | `inicio`, `fim`, `limiar` | Quantos dias acima do limite de calor? | POWER, Open-Meteo |
| `chuva_janela` | clima | `inicio`, `fim` | Vai chover muito ou pouco? Veranico? Chuva forte? | POWER, Open-Meteo |
| `vento_previsto` | clima | `limiarRajadaKmh` | Tem vendaval previsto? | Open-Meteo |
| `umidade_solo` | clima | — | O solo está seco ou úmido para a época? | POWER, Open-Meteo |
| `condicao_recente` | clima | — | Como foram os últimos 30 e 90 dias? | POWER |
| `janela_plantio` | zarc | `cultura`, `data`, `solo`, `manejo` | Posso plantar X nessa data? Qual a janela oficial? | ZARC |
| `culturas_regiao` | regiao | — | O que mais se planta aqui? Está crescendo ou caindo? | IBGE/PAM |
| `solo_estimado` | regiao | — | Que tipo de solo tem aqui (estimativa)? | SoilGrids |
| `relevo` | regiao | — | O talhão é baixada, encosta ou topo? Declividade? | Copernicus DEM |
| `estacoes_proximas` | regiao | `n` | Qual estação meteorológica mais próxima? | INMET |
| `precos_mercado` | mercado | `produto` | Como está o preço? Subindo ou caindo? | SEAB/DERAL |
| `avaliar_rotacao` | rotacao | `historico[]`, `proposta` | Faz sentido plantar X depois de Y? | fichas de culturas |
| `analisar_plantio` | composta | `cultura`, `dataPlantio`, `historico[]`, `solo` | Pacote completo de evidências para uma cultura | todas |
| `comparar_estrategias` | composta | idem + `alternativas[]` | Atual vs. 2 alternativas (o desafio pede ao menos 3) | todas |
| `monitorar_plantio` | monitoramento | `id`, `cultura`, `dataPlantio`, `fotoAnterior` | O cenário do meu plantio mudou? | clima |
| `resumo_periodico` | monitoramento | `tipo` (semanal/mensal) | Conteúdo dos disparos do WhatsApp | clima |
| `chuva_satelite` | satelite | `dias` | Quanto choveu de fato (satélite), veranico, maior chuva | GPM IMERG, POWER |
| `umidade_solo_satelite` | satelite | `dias`, `anosHistorico` | O solo está mais seco ou úmido que nos anos anteriores (satélite)? | SMAP |
| `vegetacao_ndvi` | satelite | `data` | A lavoura está verde? Ficou solo exposto no último ano? | MODIS |

Base de conhecimento das culturas em `src/conhecimento/culturas.ts`: família, fixação de nitrogênio, ciclo, faixa de temperatura, limite de calor, sensibilidade à geada, necessidade de água, doenças de solo e os nomes de cada cultura nas fontes. **São valores de referência aproximados e precisam de revisão por um agrônomo.**

## Como rodar

```bash
cd tools
bun install
bun run cli                                   # lista as ferramentas
bun run cli clima_janela --cep 87209000 --inicio 2026-12-01 --fim 2027-03-31
bun run cli comparar_estrategias --cep 87209000 --cultura soja --dataPlantio 2026-12-15 --historico batata
bun run cli avaliar_rotacao --historico soja,milho-safrinha --proposta feijao
bun run cli janela_plantio --json '{"cep":"87209000","cultura":"trigo","data":"2027-04-20"}'
bun test                                      # testes unitários (sem rede)
bun run verificar                             # roda tudo para Cianorte e atualiza docs/dados/
bun run test/mcp.smoke.ts                     # sobe o servidor MCP e chama ferramentas
```

Cliente MCP (qualquer orquestrador compatível):

```json
{ "mcpServers": { "field-shift-dados": { "command": "bun", "args": ["run", "C:/Projetos/hackhaton-nasa/tools/src/mcp.ts"] } } }
```

Uso direto em código, por exemplo num job:

```ts
import { executar } from "./tools/src/ferramentas";
const r = await executar("resumo_periodico", { cep: "87209000", tipo: "semanal" });
```

**Cache:** `tools/.cache/`. Previsão: 3 h; dados diários: 12 h; ZARC e preços semanais: 1 a 7 dias; dados estáticos: 30 dias. A primeira consulta ZARC de uma safra baixa ~250 MB.

## Monitoramento dos plantios

```
plantio cadastrado/planejado no app
        │  (job diário ou semanal)
        ▼
monitorar_plantio(plantio, fotoAnterior)  ──►  { foto, alertas[] }
        │                                         │
   guardar foto                           alerta? → notificação no app / WhatsApp
```

A "foto" registra os indicadores do ciclo: chuva total e classe, dias de geada previstos, probabilidade sazonal de geada, dias de calor, chuva forte, rajadas e sequência seca. `compararFotos` é uma função pura que só alerta o que é **novo**, para não repetir avisos já dados. Exemplo: a classe de chuva mudou de "dentro do normal" para "acima do normal", ou entrou geada na previsão.

## Limitações conhecidas

- **Viés da previsão sazonal.** É a saída bruta do ECMWF, sem correção, e em Cianorte vem mais chuvosa e mais fresca que o histórico. Corrigir exige a climatologia do próprio modelo (hindcast), que a API gratuita não oferece. Até lá, as ferramentas tratam o resultado como tendência e avisam.
- **Escala.** Os dados históricos têm grade de ~50 km. A coordenada do CEP é a da cidade. Solo e relevo só fazem sentido com o ponto do talhão.
- **Token Earthdata expira** a cada ~60 dias (atual: 13/01/2027). Token do INMET (estações) segue pendente. Ver [fontes-de-dados.md](fontes-de-dados.md).
- **Local só com lat/lon:** o município (código IBGE, necessário para ZARC, PAM e DERAL) é descoberto pelo polígono do IBGE.
- **Mercado.** O DERAL dá o preço médio do Paraná, não o pré-fixado da cooperativa. A série semanal é sobrescrita a cada publicação; guardar o histórico fica para o backend.
