# Cenários de contato

Como o produtor chega ao consultor (voz no app ou disparo no WhatsApp), quais ferramentas o agente aciona e como a resposta é montada.
Ferramentas descritas em [ferramentas.md](ferramentas.md). Os números do cenário 1 são da execução real de 15/11/2026 para Cianorte ([dados/amostras/](dados/amostras/)).

## Regras da resposta

O agente **sugere, nunca decide**. Toda resposta segue esta forma, em linguagem simples e curta, para ser falada:

1. **Sugestão:** "eu consideraria…", "faz sentido, com um cuidado…".
2. **Motivo e evidência:** de onde veio (ZARC, previsão, histórico de 20 anos, preço do DERAL).
3. **Benefício esperado.**
4. **Risco e o que pode dar errado.**
5. **Lacunas:** o que não sabemos (análise de solo, preço da cooperativa, histórico de doenças da área).
6. **Quando procurar o agrônomo ou a cooperativa.**

O agente não inventa números: só usa o que está em `resumo` e `dados`, e repassa as `limitacoes` que importam para a decisão. Quando o produtor pergunta por uma cultura, a resposta compara **ao menos três caminhos**, sendo um deles o que ele pretendia, como pede o desafio.

## Dados do produtor que destravam respostas melhores

| Dado | Como coletar | Para que serve |
|---|---|---|
| Ponto do talhão (lat/lon) | marcar no mapa do app | solo, relevo, geada de baixada (o CEP dá a cidade) |
| Histórico de plantios | por voz ("ano passado plantei soja e depois milho") | rotação, monocultura, doenças em comum |
| Análise de solo | foto do laudo | fertilidade e classe AD do ZARC |
| Preço pré-fixado / contrato | por voz | substitui o preço médio do DERAL |
| Irrigação, máquinas, mão de obra | cadastro | filtra o que é viável na propriedade |

---

## 1. "Estou pensando em plantar soja mês que vem; a cultura atual é batata. Faz sentido?"

**Ferramentas:** `comparar_estrategias` (cultura = soja, dataPlantio = 15/12, historico = [batata]). Ela roda em paralelo `clima_janela`, `janela_plantio`, `precos_mercado`, `culturas_regiao`, `solo_estimado`, `condicao_recente`, `relevo` e `avaliar_rotacao` para a soja e para duas alternativas escolhidas pelo ZARC (milho 1ª safra e feijão).

**Evidências (reais):**

| | Soja (pretendida) | Milho 1ª safra | Feijão |
|---|---|---|---|
| ZARC em 11–20/dez | indicado, risco 20% | indicado, risco 20% | indicado, risco 20% |
| Chuva no ciclo × necessidade | 1073 mm × 450–800 (sobra) | 1139 mm × 500–800 (sobra) | 812 mm × 300–500 (**excesso**, tolera mal) |
| Calor acima do limite | ~16 dias ≥ 35 °C | ~17 dias ≥ 35 °C | **~43 dias ≥ 32 °C** |
| Geada | risco baixo | risco baixo | risco baixo |
| Preço (DERAL, 3 meses) | **alta de 16,7%**; R$ 136,60/sc | alta de 6,9% | de cor −8,4%; preto +6,6% |
| Peso no município | 34% da área | 14% da área | < 1% |
| Rotação após batata | alterna família, fixa N; nematoide em comum | alterna família, palhada; nematoide em comum | alterna família, fixa N; nematoide em comum |
| Sinais | 7 a favor · 3 atenção | 8 a favor · 2 atenção | 5 a favor · 5 atenção |

Contexto: os últimos 30 dias tiveram +73% de chuva sobre o normal (solo úmido). A previsão sazonal indica tendência de verão chuvoso, mas é saída bruta do modelo e superestima a chuva na região.

**Resposta sugerida (falada):**

> "Plantar soja em meados de dezembro faz sentido para a sua área. O zoneamento do Ministério indica essa data com o menor risco, e o preço da soja no Paraná subiu uns 17% nos últimos três meses, perto de 137 reais a saca. Vir depois da batata também ajuda: muda a família da planta e a soja repõe nitrogênio.
> Dois cuidados. Batata e soja têm nematoide em comum, então, se a batata teve problema de raiz, vale uma análise de nematoides antes. E a previsão indica um verão chuvoso e quente, com uns 15 dias acima de 35 graus no ciclo: fique de olho em doença de folha e escolha uma cultivar adequada.
> Outra opção com resultado parecido é o milho: ele deixa mais palhada e protege mais o solo, mas o preço subiu menos. O feijão eu não indicaria nessa época, porque calor e excesso de chuva prejudicam bastante, e o feijão de cor está caindo de preço. Para o feijão, a janela melhor aqui é janeiro e fevereiro, como segunda safra.
> Não tenho a sua análise de solo nem o preço que a cooperativa está oferecendo. Se puder me mandar, eu refino. E confirme a cultivar com o agrônomo da cooperativa."

> Observação: aqui as evidências **não** confirmam o feijão do exemplo original. O agente deve seguir os dados, e não um roteiro pronto.

---

## 2. "Vai gear no meu trigo? Quero plantar em abril."

**Ferramentas:** `janela_plantio` (trigo, 20/abr), `risco_geada` (do plantio à colheita, ~140 dias), `relevo` (se houver ponto do talhão).

**Evidências:** ZARC indica o trigo de 1/abr a 10/jun (risco 20%). Para maio a julho, o histórico mostra risco de geada em 10 dos últimos 20 anos (geada forte em 3). Os cenários sazonais disponíveis, até meados de junho, não mostram geada.

**Resposta:** "Abril está dentro da janela oficial do trigo. Geada em Cianorte entre maio e julho acontece mais ou menos um ano sim, um ano não, e forte só de vez em quando. A fase mais sensível é a floração: se plantar no começo de abril, a floração cai em julho, que é o pico do frio. Plantar mais para o fim de abril empurra a floração para agosto, quando o risco cai. Se o seu talhão fica em baixada, o risco é maior que a média. Vou acompanhar a previsão e te aviso se aparecer frio forte."

---

## 3. "Choveu demais. Dá para entrar com o milho safrinha em fevereiro?"

**Ferramentas:** `condicao_recente`, `umidade_solo`, `janela_plantio` (milho-safrinha, data), `chuva_janela` (próximos 30 dias), `risco_geada` (até a colheita, por causa do frio de maio e junho na fase final).

**Evidências usadas:** chuva dos últimos 30 e 90 dias contra o normal; umidade na zona das raízes contra o normal; ZARC do milho 2ª safra (21/dez a 20/mar, risco 20%); frequência de geada em maio e junho.

**Resposta:** sugere a data dentro da janela, explicando que plantar mais tarde em março eleva o risco de frio no enchimento de grãos, e lembra de esperar o solo dar ponto de máquina para não compactar.

---

## 4. "Quando é a melhor época para plantar feijão aqui?"

**Ferramentas:** `janela_plantio` (feijão). O ZARC traz duas linhas, Feijão (1/set a fim de dez) e Feijão 2ª safra (1/jan a fim de fev). Depois, `clima_janela` para uma data típica de cada janela e `precos_mercado` (feijão).

**Resposta:** apresenta as duas épocas oficiais, o que muda em cada uma (calor, chuva, preço) e qual se encaixa no que ele já planta: depois da soja, a 2ª safra repete a família leguminosa, e a ferramenta de rotação aponta mofo branco em comum.

---

## 5. "Vale a pena plantar mandioca? O que o pessoal daqui planta?"

**Ferramentas:** `culturas_regiao`, `precos_mercado` (mandioca), `janela_plantio` (mandioca), `solo_estimado`.

**Evidências:** mandioca é 12% da área de Cianorte e cresceu 13% desde 2021. ZARC indica plantio de 11/jul a fim de nov. Solo arenoso favorece a cultura. O preço vem do DERAL (mandioca consumo/indústria).

**Resposta:** mostra que é uma cultura forte na região, com indústria compradora, mas de ciclo longo (10 a 20 meses), o que prende a área. Sugere checar contrato com fecularia.

---

## 6. "Como está o preço da soja?"

**Ferramentas:** `precos_mercado` (soja, com o local para pegar as regionais).

**Resposta:** "Na última semana a soja ficou em média R$ 136,60 a saca no Paraná: R$ 135 em Umuarama e R$ 138 em Maringá. Subiu uns 17% nos últimos três meses e está 14% acima de um ano atrás. Esse é o preço médio do estado; o da sua cooperativa pode ser diferente."

---

## 7. Alerta proativo: "a previsão mudou para o seu plantio"

**Gatilho:** job diário de `monitorar_plantio` para cada plantio cadastrado, comparando com a foto anterior.

**Exemplo de alerta:** `[atencao] A expectativa de chuva no ciclo mudou de "dentro do normal" para "acima do normal" (600 → 820 mm)` e `[atencao] Chuva forte (≥ 50 mm) prevista em 2026-11-20`.

**Mensagem:** "Seu João, a previsão para a lavoura de soja mudou: agora indica chuva acima do normal e um dia de chuva forte no dia 20. Se for aplicar defensivo ou adubo, vale antecipar. Quer que eu explique melhor?"

---

## 8. Disparo semanal ou mensal no WhatsApp

**Gatilho:** agendamento (ex.: segunda às 6h e todo dia 1º). Ferramenta: `resumo_periodico` (semanal ou mensal).

**Exemplo real (semana de 15/11/2026):** "Próximos 7 dias: 27 mm de chuva (dentro do normal), mínimas de 21 °C e máximas de 29 °C, sem eventos extremos. Nos últimos 30 dias choveu 73% acima do normal e fez 3 °C a menos que a média."

**Mensagem:** curta, com um destaque e um convite: "Semana com chuva normal e sem extremos. O solo segue bem úmido depois de um mês muito chuvoso. Quer saber como isso afeta o seu próximo plantio? Abra o app."

---

## 9. "Minha área fica numa baixada. Geia mais?"

**Ferramentas:** `relevo` (com o ponto do talhão) e `risco_geada`.

**Resposta:** confirma, se o relevo indicar baixada, que o ar frio se acumula ali e que a geada pode ocorrer mesmo quando a previsão regional não indica. Sugere culturas menos sensíveis ou datas que tirem a floração do pico de frio.

---

## 10. "Choveu mesmo o que a previsão disse? Meu solo está seco?"

**Ferramentas:** `chuva_satelite` (GPM IMERG) e `umidade_solo_satelite` (SMAP), com o ponto do talhão.

**Evidências (reais, 15/11/2026, ponto rural de Cianorte):** 173 mm nos últimos 30 dias pelo satélite, 22% acima da normal de 142 mm; maior chuva de 65 mm em 2/11; 6 dias seguidos sem chuva no máximo. Umidade superficial de 0,143 m³/m³ em 13/11, abaixo da média de 0,259 do mês: a superfície está secando depois de um mês úmido.

**Resposta:** confirma o mês chuvoso com dado medido, diz que a camada de cima já começou a secar e sugere conferir o ponto de plantio no próprio talhão antes de entrar com máquina.

## Execução real da pipeline de voz (15/11/2026)

Três atendimentos rodaram de ponta a ponta (áudio → Whisper → analista → comunicador → voz → Whisper de volta), com subagentes nos papéis dos agentes. Os trabalhos completos estão em `agente/trabalhos/`.

| Caso | Analista | Ferramentas | Verificação |
|---|---|---|---|
| Seu João: soja depois da batata (perfil básico) | Sonnet | `comparar_estrategias` | 97% do áudio reconhecido, nenhum número sem lastro; 69 s de áudio levou ao novo limite de 60 s |
| Ana: trigo em abril e umidade (perfil técnico, ponto do talhão, via HTTP) | Haiku | `localizar`, `comparar_estrategias`, `risco_geada`, `umidade_solo`, `umidade_solo_satelite` | 1ª versão reprovada (falso positivo de tom, já corrigido); 2ª versão pedida automaticamente com as correções |
| Boletim semanal do Seu João | — (determinístico) | `resumo_periodico`, `condicao_recente` | 34 s de áudio |

Defeitos achados pelos testes e já corrigidos: só lat/lon não resolvia o município (ZARC ficava de fora); SMAP falhava quando só faltavam os últimos dias; descrições de ferramentas sobrepostas (`comparar_estrategias` × `analisar_plantio`, modelo × satélite); regras ambíguas nos dois prompts.

## Perguntas ainda sem ferramenta (próximos passos)

| Pergunta | O que falta |
|---|---|
| "Tem praga na região?" | Fonte de pragas e doenças (ADAPAR, alertas fitossanitários); escopo ainda em aberto. |
| "Minha lavoura está sofrendo?" | Parcial: `vegetacao_ndvi` (MODIS) e `umidade_solo_satelite` (SMAP) já respondem com o ponto do talhão; estresse hídrico da planta (ECOSTRESS) exige o AppEEARS, com login próprio. |
| "Quanto vou colher?" | Modelo de produtividade (Embrapa Agritec, pago após 1 mês) ou histórico do produtor. |
| "Qual cultivar?" | Lista de cultivares do ZARC (CSV SISZARC já localizado no mesmo portal, ainda não integrado). |
