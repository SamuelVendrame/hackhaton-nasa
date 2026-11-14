# Visão do produto

Documento de negócio da equipe para o desafio *Field Shift: Adapting Farms with NASA Data* (NASA Space Apps 2026).
Versão 0.1, de 14/11/2026: primeira organização do resumo da equipe.

As seções 1 a 7 registram o que a equipe já definiu. As seções 8 a 10 são análise e sugestões acrescentadas na organização do documento, e ainda precisam ser validadas pela equipe.

## 1. Resumo

Uma consultoria de IA para o pequeno e médio produtor rural. O produtor conversa por áudio no WhatsApp com um consultor que o ajuda a decidir **o que plantar no próximo ciclo**, considerando o clima esperado para a janela de cultivo, a rotação de culturas, o estado do solo e a realidade de mercado dele. Um aplicativo complementa a conversa com previsões, cadastros e resumos.

## 2. Problema

- O produtor segue (ou seguia) um cronograma de plantio herdado da família, mas as mudanças climáticas recentes tornaram esse calendário imprevisível.
- O planejamento do que plantar muitas vezes não leva em conta o clima do período em que a lavoura estará no campo, nem a rotação de culturas.
- O resultado são imprevistos durante o ciclo e perda de produtividade.

## 3. Persona

**Produtor rural de pequeno ou médio porte, de família produtora há gerações.**

- Planta o ano todo ou quase: um plantio atrás do outro, então a decisão sobre o próximo ciclo é recorrente.
- Tem conhecimento prático herdado, mas sente que o calendário tradicional já não funciona como antes.
- Menor nível geral de escolaridade ou pouco contato com novas tecnologias.
- Trabalha com cooperativa e costuma vender as sacas no pré-fixado.
- É quem toma a decisão na propriedade.
- Região de partida: Cianorte, noroeste do Paraná.

## 4. Solução

**O que faz:** planeja o próximo plantio usando todos os fatores disponíveis nas fontes de dados da NASA, nas fontes locais e nos dados do próprio produtor. Indica caminhos para resolver imprevistos e melhorar a produtividade.

**Como o produtor usa:**

- **WhatsApp por áudio (canal principal):** o produtor pergunta e recebe a orientação falando, sem precisar ler telas ou preencher formulários.
- **Aplicativo (apoio):** visualizar previsões das próximas semanas, cadastrar dados da propriedade e consultar resumos.

**O que o produtor informa:**

- Histórico de plantios, inclusive lançamentos retroativos, para o sistema entender o cenário dele e recomendar com mais previsibilidade.
- Resultado de análise de solo, pelo aplicativo ou por áudio.

## 5. Critérios de decisão

Em aberto; os já considerados:

- **Clima na janela de cultivo:** chuva e distribuição de água no período, seca, vento, sol, geada, frio, secura do solo. Exemplo: se a janela será chuvosa, recomendar cultura resistente ao volume de água previsto; o mesmo raciocínio para janela seca.
- **Rotação de culturas:** cada cultura extrai ou deposita algo no solo. Considerar o histórico de plantio e o estado atual do solo.
- **Mercado:** a venda pré-fixada pela cooperativa entra como fator na indicação do que plantar.
- **Pragas (regionais ou da lavoura do produtor):** ainda não confirmado se entra no escopo.

## 6. Fontes de dados

- **NASA:** fontes da aba Resources do desafio, catalogadas em [../resources/index.md](../resources/index.md).
- **Locais:** IPARDES e EMBRAPA, com dados sobre o que é cultivado na região, mercado e clima.
- **Do produtor:** histórico de plantio e análises de solo.

## 7. Como o sistema funciona (visão técnica inicial)

Um motor de IA com um *harness* que permite ao modelo consumir todas essas informações. A forma técnica está em aberto e precisa ser validada (RAG, MCP, API em fluxo de IA etc.).

---

## 8. Diferenciais (rascunho)

Derivados do resumo da equipe; a validar e priorizar.

1. **Áudio no WhatsApp.** Leva análise de dados de satélite a quem não usa painéis nem mapas, no canal que o produtor já usa todos os dias.
2. **Decisão, não dado.** A saída é uma recomendação do que plantar, com explicação, e não um gráfico para o produtor interpretar.
3. **Contexto do produtor.** Combina dados da NASA com o histórico da propriedade, a análise de solo e a condição de venda dele.
4. **Realidade da cooperativa.** Considera o pré-fixado, que na prática limita o que o produtor pode escolher.
5. **Foco regional.** Começa por Cianorte e noroeste do Paraná, com fontes locais, em vez de uma ferramenta genérica.

## 9. Aderência ao desafio

O que o desafio pede e como a ideia se posiciona (texto do desafio em [../CHALLENGE.md](../CHALLENGE.md)).

| O desafio pede | Situação na nossa ideia |
|---|---|
| Ferramenta de apoio à decisão sobre **estratégias de rotação de culturas** | Presente, mas a apresentação atual é de "consultor climático". A rotação precisa aparecer como o centro da resposta. |
| Usar observações da NASA junto com solo local, características das culturas e prioridades do produtor | Coberto. |
| Comparar **pelo menos três estratégias de rotação, incluindo a atual** | Ainda não previsto. Hoje a ideia devolve uma indicação. |
| Para cada estratégia: por que foi sugerida, evidências, benefícios, lacunas de informação e riscos que pedem revisão local | Ainda não previsto. |
| Apoiar, e não substituir, o julgamento do produtor e de especialistas locais | Compatível com o papel de consultor; convém deixar explícito. |
| Ser interpretável por quem tem pouca experiência técnica | Ponto forte: áudio no WhatsApp. |
| Permitir que o produtor informe prioridades e restrições (água, equipamento, mercado) | Parcial: mercado sim; água e equipamento ainda não. |
| Inspiração em famílias produtoras há gerações | A persona coincide com a do desafio. |

**Sugestão:** manter o consultor por áudio como forma, e adotar como conteúdo padrão da resposta a comparação de três caminhos: "continuar como está", e duas alternativas, cada uma com o motivo, o ganho esperado e o risco. Isso atende diretamente ao que o desafio descreve.

## 10. Pontos em aberto

**Levantados pela equipe**

- Lista final de critérios de decisão.
- Pragas entram no escopo ou não.
- Arquitetura técnica do motor de IA (RAG, MCP, API).

**Acrescentados nesta organização**

- **Cobertura das fontes.** 13 das 26 fontes da aba Resources cobrem só os EUA ou a América do Norte. Para Cianorte servem as de satélite da NASA (SMAP, IMERG, Landsat, MODIS, POWER, SRTM, ECOSTRESS), GLDAS, GAEZ, Sentinel-2 e ERA5. Solo, uso da terra, estatísticas e mercado terão de vir de fontes brasileiras.
- **Fontes brasileiras a avaliar**, além de IPARDES e EMBRAPA: ZARC (zoneamento de risco climático, com janelas de plantio por município, cultura e tipo de solo), SIMEPAR e IDR-Paraná (clima e agrometeorologia do estado), INMET, CONAB (preços e custos), DERAL/SEAB (safra por município), IBGE/PAM (produção municipal) e MapBiomas (uso da terra). Nenhuma foi consultada ainda.
- **Previsão do tempo.** As fontes do desafio são de observação e histórico, não de previsão. As "previsões das próximas semanas" do aplicativo e o clima esperado da janela de cultivo dependem de uma fonte de previsão ainda não definida, ou de climatologia e tendência calculadas sobre o histórico.
- **Análise de solo por áudio.** O laudo costuma ser um papel ou PDF do laboratório; enviar foto pelo WhatsApp tende a ser mais simples e menos sujeito a erro do que ditar os valores.
- **Papel da cooperativa.** Definir se ela é só um fator na decisão ou também parceira e canal (acesso aos produtores, dados de preço, agrônomos que revisam as recomendações).
- **Modelo de negócio.** Quem paga: o produtor, a cooperativa ou outro agente.
- **Responsabilidade pela recomendação.** Como deixar claro para o produtor o grau de incerteza e quando procurar o agrônomo.
