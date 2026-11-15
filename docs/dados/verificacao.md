# Verificação das ferramentas

Gerado em 2026-11-15T07:49:43.275Z para o CEP 87209000. Respostas completas em [amostras/](amostras/).

## localizar — ok (0.0 s)

Entrada: `{"cep":"87209000"}`

- Cianorte/PR — lat -23.6633, lon -52.6050 (precisão: cep); IBGE 4105508.

## clima_janela — ok (0.3 s)

Entrada: `{"cep":"87209000","inicio":"2026-12-15","fim":"2027-04-14"}`

- Base dos dados da janela: 121 dia(s) de previsao sazonal.
- Temperatura média esperada: mínimas de 21.5 °C e máximas de 29.4 °C (normal: 20.9 / 31.5 °C).
- Chuva: 938 mm contra normal de 596 mm — tendência acima do normal (modelo sazonal).
- Geada: em 0/19 anos houve risco nesta janela.
- Calor ≥ 34 °C: média histórica de 24.2 dia(s) por ano na janela.

## risco_geada — ok (0.2 s)

Entrada: `{"cep":"87209000","inicio":"2027-05-01","fim":"2027-07-31"}`

- Base dos dados da janela: 43 dia(s) de previsao sazonal, 49 dia(s) de climatologia.
- Previsão sazonal: 0% dos cenários têm ao menos um dia com risco de geada.
- Histórico: em 10 de 20 anos houve ao menos um dia com risco de geada nesta mesma janela (geada forte, ≤ 0 °C: 3 anos).

## estresse_calor — ok (0.2 s)

Entrada: `{"cep":"87209000","inicio":"2026-11-15","fim":"2027-01-14","limiar":35}`

- Base dos dados da janela: 16 dia(s) de previsao, 45 dia(s) de previsao sazonal.
- 0 dia(s) previstos/observados com máxima ≥ 35 °C (maior sequência: 0); maior máxima: 30.4 °C.
- Previsão sazonal: em média 0.2 dia(s) com máxima ≥ 35 °C na parte além de 16 dias.
- Histórico: média de 12.4 dia(s) por ano com máxima ≥ 35 °C nesta janela (anos mais quentes: 22).

## chuva_janela — ok (0.2 s)

Entrada: `{"cep":"87209000","inicio":"2026-11-15","fim":"2026-12-15"}`

- Base dos dados da janela: 16 dia(s) de previsao, 15 dia(s) de previsao sazonal.
- Chuva esperada na janela: 254 mm, contra normal de 154 mm (+65%) — acima do normal.
- Faixa provável pelos cenários sazonais: 183 a 368 mm.
- Probabilidade pelos cenários sazonais: 0% abaixo do normal, 6% normal, 94% acima.
- Nos dias com previsão: maior sequência sem chuva de 1 dia(s); 0 dia(s) com chuva ≥ 50 mm.
- Histórico da janela: maior sequência seca média de 7.1 dias.

## vento_previsto — ok (0.0 s)

Entrada: `{"cep":"87209000"}`

- Sem rajadas ≥ 60 km/h previstas; maior rajada: 41.8 km/h.

## umidade_solo — ok (2.5 s)

Entrada: `{"cep":"87209000"}`

- Umidade na zona das raízes (últimos 30 dias com dado, até 2026-11-12): 0.72 (escala 0–1), contra normal de 0.62 para a época (+18%).
- Previsão de umidade a 27–81 cm: de 0.37 para 0.404 m³/m³ em 15 dias (umedecendo).

## condicao_recente — ok (1.8 s)

Entrada: `{"cep":"87209000"}`

- Últimos 30 dias (até 2026-11-11): 260 mm de chuva contra normal de 150 mm (+73%); temperatura -3.4 °C em relação à média.
- Últimos 87 dias: 601 mm contra 332 mm (+81%); temperatura -1.7 °C.

## janela_plantio — ok (0.1 s)

Entrada: `{"cep":"87209000","cultura":"soja","data":"2026-12-15"}`

- Soja: plantio em 11 a 20/dez está INDICADO pelo ZARC 2026/2027 em 64 de 66 combinações de solo/ciclo, com risco mínimo de 20%. Janelas do ano: 1 a 10/set a 21 ao fim de dez (risco mínimo 20%).

## culturas_regiao — ok (0.2 s)

Entrada: `{"cep":"87209000"}`

- Em 2025, Cianorte colheu 37252 ha em lavouras. Principais: Cana-de-açúcar (38.2%), Soja (em grão) (34%), Milho (em grão) (13.7%), Mandioca (12.1%), Café (em grão) Total (1.3%).
- Variação de área desde 2021: Cana-de-açúcar -20%, Soja (em grão) +5%, Milho (em grão) -8%, Mandioca +13%, Café (em grão) Total +23%.

## solo_estimado — ok (0.2 s)

Entrada: `{"cep":"87209000","lat":-23.7,"lon":-52.56}`

- Solo estimado (0–30 cm): textura média — argila 29.4%, areia 48.3%; pH 5.5; carbono orgânico 24.1 g/kg; CTC 18.6 cmolc/kg.

## relevo — ok (0.2 s)

Entrada: `{"cep":"87209000","lat":-23.7,"lon":-52.56}`

- Altitude 472 m, declividade de 3.7% (suave ondulado), posição: encosta/meia-encosta (+7 m em relação ao entorno de 1 km).

## estacoes_proximas — ok (0.5 s)

Entrada: `{"cep":"87209000"}`

- Estações INMET operantes mais próximas: CIDADE GAUCHA (A869, 48 km); GOIOERE (A825, 73 km); MARINGA (A835, 74 km).

## precos_mercado — ok (3.5 s)

Entrada: `{"cep":"87209000","produto":"soja"}`

- Soja (60 kg): média PR na semana 46-2026 de R$ 136.60 (Umuarama R$ 135.09, Maringá R$ 138.00); tendência de 3 meses: alta (16.7%); contra 1 ano atrás: 13.6%.

## avaliar_rotacao — ok (0.0 s)

Entrada: `{"historico":["batata"],"proposta":"soja"}`

- A favor: Soja (leguminosa) após Batata (solanácea) alterna famílias, o que ajuda a quebrar ciclos de pragas e doenças.
- Atenção: Problemas de solo em comum entre Batata e Soja: nematoide. Vale checar histórico desses problemas na área.
- A favor: Soja fixa nitrogênio do ar, repondo parte do que Batata extraiu.

## analisar_plantio — ok (0.8 s)

Entrada: `{"cep":"87209000","cultura":"soja","dataPlantio":"2026-12-15","historico":["batata"]}`

- Análise de Soja plantada em 2026-12-15 (ciclo até 2027-05-04) em Cianorte.
- A favor: Chuva esperada no ciclo (1073 mm) cobre a necessidade de Soja (450–800 mm), com sobra; atenção a doenças em períodos muito úmidos.
- Atenção: A chuva da janela tende a ficar acima do normal da região (pela previsão sazonal, sem correção de viés).
- Atenção: Calor: cerca de 16 dia(s) com máxima ≥ 35 °C no ciclo (limite de estresse de Soja).
- A favor: Risco de geada baixo na janela do ciclo.
- A favor: ZARC indica o plantio nesta data, com risco mínimo de 20%.
- A favor: Preço recebido no PR em alta nos últimos 3 meses (16.7%).
- A favor: Soja é uma das principais culturas do município (34% da área), com estrutura de compra e assistência na região.
- A favor: Soja (leguminosa) após Batata (solanácea) alterna famílias, o que ajuda a quebrar ciclos de pragas e doenças.
- Atenção: Problemas de solo em comum entre Batata e Soja: nematoide. Vale checar histórico desses problemas na área.
- A favor: Soja fixa nitrogênio do ar, repondo parte do que Batata extraiu.

## comparar_estrategias — ok (9.5 s)

Entrada: `{"cep":"87209000","cultura":"soja","dataPlantio":"2026-12-15","historico":["batata"]}`

- Comparação para plantio em 2026-12-15: Soja (7 a favor, 3 de atenção) · Milho (1ª safra) (8 a favor, 2 de atenção) · Feijão (5 a favor, 5 de atenção).
- Alternativas escolhidas entre as culturas indicadas pelo ZARC na data, priorizando família diferente da cultura anterior.

## monitorar_plantio — ok (0.2 s)

Entrada: `{"cep":"87209000","id":"teste-1","cultura":"soja","dataPlantio":"2026-12-15"}`

- Sem mudanças relevantes no cenário do plantio desde a última verificação.

## resumo_periodico_semanal — ok (3.0 s)

Entrada: `{"cep":"87209000","tipo":"semanal"}`

- Próximos 7 dias: 27 mm de chuva (dentro do normal), mínimas médias de 20.7 °C e máximas de 28.6 °C.
- Sem eventos extremos previstos.
- Últimos 30 dias (até 2026-11-11): 260 mm de chuva contra normal de 150 mm (+73%); temperatura -3.4 °C em relação à média.

## resumo_periodico_mensal — ok (1.7 s)

Entrada: `{"cep":"87209000","tipo":"mensal"}`

- Próximos 30 dias: 245 mm de chuva (acima do normal), mínimas médias de 20.6 °C e máximas de 28.2 °C.
- Sem eventos extremos previstos.
- Últimos 30 dias (até 2026-11-11): 260 mm de chuva contra normal de 150 mm (+73%); temperatura -3.4 °C em relação à média.

## chuva_satelite — ok (3.3 s)

Entrada: `{"lat":-23.7,"lon":-52.56}`

- Satélite GPM (IMERG), 29 de 30 dias até 2026-11-14: 173 mm, contra normal de 142 mm (+22%). 11 dias com chuva; maior sequência seca de 6 dias.
- Maior chuva diária: 65 mm em 2026-11-02 (1 dia(s) ≥ 50 mm).

## umidade_solo_satelite — ok (2.7 s)

Entrada: `{"lat":-23.7,"lon":-52.56}`

- Última passagem do satélite SMAP (2026-11-13): umidade de 0.143 m³/m³ na camada superficial (0–5 cm); média dos últimos 30 dias 0.259 m³/m³, tendência estável.
- Comparado à mesma janela em 2025 e 2024: +15%.

## vegetacao_ndvi — ok (190.3 s)

Entrada: `{"lat":-23.7,"lon":-52.56}`

- NDVI de 0.49 na composição de 2026-10-16 (cobertura parcial); tendência caindo (-0.33 em ~32 dias).
- Na mesma época dos últimos 4 anos o NDVI mediano foi 0.31: acima do usual (+0.18).
