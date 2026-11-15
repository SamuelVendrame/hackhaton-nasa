# Fontes de dados

Levantamento feito em 15/11/2026 com o CEP 87209000 (Cianorte/PR: lat -23,6633, lon -52,605, IBGE 4105508).
Cada fonte foi chamada de verdade; os exemplos de resposta completos estão em [dados/amostras/](dados/amostras/) e o relatório da última execução em [dados/verificacao.md](dados/verificacao.md).

## Resumo

| Fonte | Chave? | Status | O que entrega | Ferramentas que usam |
|---|---|---|---|---|
| BrasilAPI CEP v2 | não | ✅ integrada | CEP → município, IBGE, lat/lon | `localizar` |
| IBGE Localidades / Malhas | não | ✅ integrada | município, região, polígono (centroide) | `localizar` |
| NASA POWER (diário e climatologia) | não | ✅ integrada | temperatura, chuva, vento, umidade relativa, umidade do solo, radiação; 20 anos | clima, `umidade_solo`, `condicao_recente` |
| Open-Meteo Forecast | não¹ | ✅ integrada | previsão de 16 dias: temp., chuva, prob. de chuva, vento, rajada, ET0, umidade do solo | clima, `vento_previsto`, `umidade_solo` |
| Open-Meteo Seasonal (ECMWF SEAS5) | não¹ | ✅ integrada | previsão de ~7 meses, com vários cenários (ensemble) | clima |
| Open-Meteo Elevation (Copernicus DEM 90 m) | não¹ | ✅ integrada | altitude | `relevo` |
| ZARC — Tábua de Risco (MAPA) | não | ✅ integrada | janela e risco de plantio por cultura, solo, ciclo e município | `janela_plantio`, `comparar_estrategias` |
| IBGE SIDRA — PAM (tabela 5457) | não | ✅ integrada | área, produção, rendimento e valor por cultura no município | `culturas_regiao` |
| SEAB/DERAL — preços recebidos (PR) | não | ✅ integrada | preço semanal por regional e série mensal de 13 meses | `precos_mercado` |
| ISRIC SoilGrids 2.0 | não | ✅ integrada (instável) | textura, pH, carbono, N, CTC, densidade (0–30 cm) | `solo_estimado` |
| INMET — lista de estações | não | ✅ integrada | estações e situação | `estacoes_proximas` |
| INMET — dados das estações | **token** | ⏳ pendente | medições horárias das estações | (cliente pronto, sem token) |
| NASA SMAP L3 Enhanced (via Harmony) | **token Earthdata** | ✅ integrada | umidade da camada superficial do solo, 9 km, a cada 2–3 dias | `umidade_solo_satelite` |
| NASA GPM IMERG Late diário (via GES DISC OPeNDAP) | **token Earthdata** + app GES DISC autorizado | ✅ integrada | chuva diária por satélite, ~10 km | `chuva_satelite` |
| NASA MODIS MOD13Q1 (via ORNL DAAC) | não | ✅ integrada (lenta e instável) | NDVI/EVI 250 m a cada 16 dias | `vegetacao_ndvi` |
| NASA AppEEARS, ECOSTRESS, GRACE | conta (login próprio) | ⏸ não integrada | o AppEEARS não aceita o token Bearer; exige usuário e senha | — |
| Embrapa AgroAPI (Agritec, ClimAPI, SATVeg, SmartSolos) | **conta** | ⏸ não prioritária | produtividade, NDVI (SATVeg), classificação de solo | — |
| Copernicus CDS (ERA5) | conta | ⏸ desnecessária | o ERA5 já sai sem chave pelo arquivo histórico da Open-Meteo | — |
| OpenTopography (SRTM) | conta | ⏸ desnecessária | substituída pelo Copernicus DEM sem chave | — |

¹ Open-Meteo é gratuita para uso **não comercial**. Em produção comercial é preciso o plano pago (ou hospedar a própria instância, que é open source).

## Detalhe por fonte

### BrasilAPI CEP v2
- `GET https://brasilapi.com.br/api/cep/v2/{cep}` → JSON com `city`, `state`, `ibge.city` e `location.coordinates.{latitude,longitude}` (como **texto**).
- O CEP genérico da cidade (87200000) falhou em todos os provedores; CEPs de rua funcionam. A coordenada pode vir vazia, e então caímos no centroide do município pelo IBGE.
- A coordenada do CEP aponta para a cidade. Para solo e relevo, o app precisa pedir o ponto do talhão no mapa.

### NASA POWER
- `GET /api/temporal/daily/point?parameters=...&community=AG&latitude=&longitude=&start=AAAAMMDD&end=AAAAMMDD&format=JSON` → GeoJSON com `properties.parameter.{PARAM}.{AAAAMMDD}: valor`; `-999` = sem dado.
- 21 anos de dados diários em uma chamada de ~1,5 s. Com isso calculamos a climatologia própria por dia do ano e as frequências ("em quantos dos últimos 20 anos houve geada nesta janela").
- Grade de ~50 km (MERRA-2) e atraso de 3 a 4 dias. A chuva é de reanálise: em Cianorte, dezembro a março dá 633 mm de normal contra 700 mm no ERA5.
- Parâmetros usados: `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `WS2M`, `RH2M`, `GWETROOT`, `GWETTOP`.

### Open-Meteo (previsão, sazonal, elevação, arquivo histórico)
- Previsão: `api.open-meteo.com/v1/forecast` → `daily.{variavel}[i]` alinhado com `daily.time[i]`.
- Sazonal: `seasonal-api.open-meteo.com/v1/seasonal` → cada variável vem também como `{variavel}_memberNN`. Resumimos em média, percentis 10/90 e probabilidade por membro.
- **Viés do modelo sazonal.** Em Cianorte a saída bruta ficou bem mais chuvosa e mais fresca que o histórico: até os 10% mais secos dos cenários superam a normal. Por isso, quando a janela é dominada pela sazonal, a ferramenta diz "tendência" e informa a probabilidade por tercil, avisando que falta correção de viés.
- Elevação: `api.open-meteo.com/v1/elevation?latitude=a,b,c&longitude=x,y,z` → `{elevation: [..]}`.

### ZARC — Tábua de Risco
- Catálogo CKAN: `dados.agricultura.gov.br/api/3/action/package_show?id=6d3d141c-885e-41a4-ab7f-dc8ff323b96f`. Há um CSV por safra (~250 MB, separador `;`, UTF-8 com BOM) e outro para perenes e olerícolas.
- Uma linha por cultura × município × solo × ciclo × manejo × nível de manejo, com `dec1..dec36` = risco de perda (20, 30 ou 40%) para plantio naquele decêndio; `0` = não indicado.
- Códigos de solo: 1 Arenoso, 2 Textura média, 3 Argiloso, 11–16 = AD1–AD6 (água disponível). Códigos de ciclo: 20–26 = Grupo I–VI. Manejo: 1 Sequeiro, 2 Irrigado. Dicionário oficial: PDF no mesmo pacote.
- Cianorte, safra 2026/2027: 277 linhas e 20 culturas anuais (soja, milho 1ª/2ª safra, feijão, trigo, aveia, sorgo, amendoim, girassol, algodão, arroz...). O arquivo de perenes acrescenta mandioca, cana, café, frutas e olerícolas como cebola e tomate industrial. **Batata não é zoneada** no município.
- Exemplos reais: soja de 1/set ao fim de dez; milho safrinha de 21/dez a 20/mar; feijão 2ª safra de 1/jan ao fim de fev; trigo de 1/abr a 10/jun; mandioca de 11/jul ao fim de nov. Todos com risco mínimo de 20%.
- A primeira consulta baixa o CSV (~40 s); o recorte do município fica em cache por uma semana.

### IBGE SIDRA — Produção Agrícola Municipal
- `apisidra.ibge.gov.br/values/t/5457/n6/{ibge}/v/112,214,215,216/p/last%20{n}/c782/allxt?formato=json` → lista em que a 1ª linha é o cabeçalho (`D1N`, `D2N`...) e `V` é o valor (`-` = zero, `...` / `X` = indisponível).
- Cianorte 2025: cana 38%, soja 34%, milho 14%, mandioca 12% da área colhida.

### SEAB/DERAL — preços
- `agricultura.pr.gov.br/system/files/publico/Precos/prp.xls` (semanal) e `pmrp.xls` (mensal). Arquivos Excel 97, sobrescritos a cada publicação: **para ter série semanal longa, precisamos guardar cada semana**.
- A planilha não tem núcleo de Cianorte; usamos Umuarama e Maringá como referência.
- É o preço médio recebido no mercado disponível, não o pré-fixado da cooperativa.

### ISRIC SoilGrids
- `rest.isric.org/soilgrids/v2.0/properties/query?lon=&lat=&property=...&depth=...&value=mean` → `properties.layers[].depths[].values`. Divida pelo `d_factor` para chegar à unidade final.
- API em beta: deu timeout (504) várias vezes e voltou depois. O ponto urbano de Cianorte retorna `null`; um ponto rural funciona.
- Valores de modelo global (250 m): para o noroeste do PR tende a errar a textura (o Arenito Caiuá é mais arenoso) e a superestimar o carbono.

### INMET
- `apitempo.inmet.gov.br/estacoes/T` (sem chave) lista as estações. A mais próxima de Cianorte é Cidade Gaúcha (A869, 48 km).
- `apitempo.inmet.gov.br/estacao/{ini}/{fim}/{cod}` responde **204 sem conteúdo**: os dados exigem token pessoal (`/token/estacao/.../{token}`), solicitado ao INMET. O cliente já aceita `INMET_TOKEN`.
- O curl do Git Bash sofre "connection reset" neste host; o `fetch` do Bun funciona.

### NASA Earthdata (token configurado em 15/11)
- Token pessoal do Earthdata Login em `tools/.env` (`EARTHDATA_TOKEN`). **Expira em ~60 dias** (o atual vence em 13/01/2027); gere outro em urs.earthdata.nasa.gov → Generate Token. As ferramentas avisam nas `limitacoes` quando faltam menos de 10 dias.
- **SMAP** (umidade do solo): pelo **Harmony** (`harmony.earthdata.nasa.gov`), que recorta ±0,07° em volta do ponto e devolve um GeoTIFF pequeno por dia (~2,5 KB). Job assíncrono de ~20–30 s. Lemos o pixel do ponto e a média do recorte; -9999 = sem passagem. Dias passados ficam em cache permanente (`.cache/smap`). Em Cianorte (ponto rural), 13/11/2026: 0,143 m³/m³; média de 30 dias 0,259, 15% acima da mesma janela em 2024–2025.
- **GPM IMERG** (chuva): o CMR (sem chave) dá o nome exato de cada arquivo diário; o OPeNDAP do GES DISC devolve só o pixel em ASCII (`.ascii?precipitation[0][ilon][ilat]`). Exigiu autorizar o aplicativo "NASA GESDISC DATA ARCHIVE" no perfil Earthdata (feito em 15/11). Cianorte, 30 dias até 14/11: 173 mm contra normal de 142 mm (+22%), maior chuva 65 mm em 02/11.
- O Giovanni (série temporal pronta via Harmony) não aceita o token Bearer: redireciona para login OAuth. O AppEEARS também exige login próprio. Não foram usados.
- **MODIS NDVI** via ORNL: sem chave, mas lento (30–90 s por pedido), limite de 10 datas por pedido e 502/400 frequentes. A ferramenta usa lotes de 5 datas, 2 pedidos por vez e segue com os lotes que deram certo, avisando nas limitações. Cianorte (ponto rural), composição de 16/10/2026: NDVI 0,49 (cobertura parcial), caindo 0,33 em 32 dias, coerente com colheita/preparo para a safra de verão.
