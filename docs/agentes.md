# Agentes e pipeline de voz

Código em [../agente](../agente). Tudo roda no computador: Whisper (transcrição), voz sintética, verificação e ferramentas de dados. Os únicos passos com modelo de linguagem são os dois agentes, executados pelo **Claude Code em modo terminal** (`claude -p`), cada um numa sessão isolada com prompt próprio.

## Visão geral

```
 app (POST /audio)  ─┐
 WhatsApp (arquivo)  ─┼─► caixa/entrada ──► OBSERVADOR (fila, 1 por vez)
 teste (simular)     ─┘                          │
                                                 ▼
 trabalhos/{id}/        1 entrada      áudio original + canal + cliente
                        2 transcricao  Whisper small local (ONNX, CPU)
                        3 contexto     perfil + últimas conversas + data   (determinístico)
                        4 analise      AGENTE ANALISTA  ── MCP field-shift-dados (21 ferramentas)
                        5 resposta     AGENTE COMUNICADOR (tom e contexto do cliente)
                        6 audio        voz local (Piper, voz neural "faber" pt-BR; SAPI "Maria" de reserva) → wav + ogg/opus
                        7 verificacao  Whisper de volta + regras ── falhou? volta ao 5 com as correções
                        8 saida        caixa/saida/{id}.ogg + {id}.json; memória da conversa
```

Cada etapa grava um JSON validado por esquema ([src/contratos.ts](../agente/src/contratos.ts)). Se o processo cair, rodar de novo continua da etapa que faltou (`retomar <id>`). Cada agente recebe **só** o que precisa:

| Agente | Recebe | Devolve | Ferramentas | Modelo padrão |
|---|---|---|---|---|
| Analista | pergunta transcrita, data, perfil, últimas conversas | `Analise`: intenção, achados com fonte, ≥3 estratégias (quando é decisão), riscos, lacunas, pergunta de retorno, fatos novos do cliente | só o servidor MCP de dados | `sonnet` |
| Comunicador | análise, perfil (nível técnico, tamanho, formalidade, expressões), pergunta, conversas, correções | `Resposta`: texto falado, tópicos de tela, números citados, tom aplicado | nenhuma | `haiku` |

Por que dois agentes: o analista se concentra em acertar o conteúdo (quais dados, quais opções, quanto confiar), sem se preocupar com a forma; o comunicador só escolhe, ordena e fala, sem poder buscar nem inventar fatos. Isso permite um modelo mais barato e rápido na parte de linguagem, e a verificação consegue checar se todo número falado tem lastro na análise.

## Prompts

- [prompts/analista.md](../agente/prompts/analista.md): papel, tabela "o produtor quer saber… → comece por", regras de evidência (nada de número sem fonte), sugerir em vez de decidir, ≥3 estratégias com a pretendida, limites das fontes (sazonal é tendência, DERAL é média do estado), quando mandar ao agrônomo, memória.
- [prompts/comunicador.md](../agente/prompts/comunicador.md): como um consultor de campo fala (responde primeiro, sugere, prova com uma ou duas evidências, cita todas as opções, admite o que não sabe, fecha com pergunta), ajuste por perfil, prioridade de corte, regras de escrita para voz (sem símbolos, números arredondados como se fala) e o boletim proativo.

Os dois foram revisados com subagentes de modelos menores (Sonnet e Haiku) executando o papel e apontando o que ficou ambíguo; as correções já estão aplicadas (ver "Testes" abaixo).

## Verificação (sem IA)

[src/verificacao.ts](../agente/src/verificacao.ts):

1. **O áudio é entendível?** O Whisper transcreve a resposta gerada e comparamos com o texto pretendido (1 − WER, com números normalizados por extenso). Mínimo: 80%.
2. **Algum número foi inventado?** Todo número falado precisa existir na análise ou no perfil (tolerância de arredondamento de fala: 10% ou 1 unidade).
3. **Sugere ou manda?** Frases como "você deve", "plante", "tem que" reprovam.
4. **Cabe no ouvido?** Limite de palavras e de duração por perfil (curta: 90 palavras e 60 s; média: 170 e 110 s), sem símbolos, sem sigla para nível básico.
5. **O fluxo foi seguido?** Pergunta que precisa de dados sem ferramenta de dados (a `StructuredOutput` interna não conta), decisão com menos de 3 estratégias ou sem a pretendida, ou campos "placeholder": o analista é chamado de novo uma vez com os problemas; se persistir, vira aviso.
6. **Todas as estratégias foram citadas?** A cultura de cada estratégia da análise precisa aparecer na fala.

Se reprovar (itens 1–4 e 6), o comunicador é chamado de novo com a lista de correções (até 2 tentativas). O resultado da verificação vai junto com a resposta para o app.

## Variação: boletim proativo (WhatsApp)

`bun run src/cli.ts boletim --cliente ID --tipo semanal|mensal`: não há pergunta nem analista. As ferramentas determinísticas `resumo_periodico` e `condicao_recente` geram a análise ([src/boletim.ts](../agente/src/boletim.ts)), e o resto é o mesmo caminho (comunicador → voz → verificação → caixa de saída). É o que o agendamento semanal/mensal chama.

## Motores dos agentes

[src/agentes/motor.ts](../agente/src/agentes/motor.ts). A pipeline não sabe qual está em uso.

- **`claude`** (padrão): `claude -p --system-prompt-file prompts/X.md --json-schema <esquema> --mcp-config config/mcp.json --strict-mcp-config --tools "" --allowedTools mcp__field-shift-dados --output-format stream-json`. Sem ferramentas de arquivo ou terminal; a saída é validada pelo esquema; a sessão completa fica em `trabalhos/{id}/{papel}.sessao.jsonl` (inclui as ferramentas chamadas). **Requer o Claude Code logado uma vez** neste computador. O servidor MCP é marcado `alwaysLoad` e o processo roda com `MCP_CONNECTION_NONBLOCKING=false`: sem isso o agente começa antes de as ferramentas conectarem e responde sem dados (aconteceu no 1º teste real).
- **`arquivo`**: grava `{papel}.pedido.json` (prompt, entrada, esquema) e espera `{papel}.resposta.json`. Serve para testes, para um humano ou para outro executor. Foi o motor usado nos testes desta noite, com subagentes no papel dos agentes.

## Serviço de recebimento e envio de áudio

`bun run servir` (porta 3333):

| Rota | Faz |
|---|---|
| `POST /audio?cliente=ID&canal=app` | recebe o áudio (corpo bruto ou multipart `audio`; ogg, webm, m4a, mp3, wav) e devolve `202 {id}` |
| `GET /trabalhos/ID` | situação, etapa atual, pergunta transcrita, resposta e verificação |
| `GET /trabalhos/ID/eventos` | SSE com cada mudança de etapa |
| `GET /trabalhos/ID/audio` | áudio da resposta (ogg/opus, formato de nota de voz do WhatsApp) |
| `GET/PUT /clientes/ID` | perfil do produtor |
| `GET /` | página de teste: segura para falar, acompanha as etapas e toca a resposta |

Também dá para soltar arquivos em `caixa/entrada/` com o nome `{clienteId}__qualquer.ogg`: o observador pega, processa e põe a resposta em `caixa/saida/`.

## Desempenho medido (i3-8130U, 4 threads, sem GPU)

| Etapa | Tempo |
|---|---|
| Whisper small, 1ª chamada (carrega o modelo) | ~18–27 s para ~8 s de áudio |
| Whisper small, modelo carregado | ~0,45 s por segundo de áudio |
| Analista com `comparar_estrategias` (cache quente) | ~60–70 s |
| Voz (Piper faber) + ogg | ~4–6 s para ~30 s de fala (SAPI: ~2 s, mas robótica) |
| Verificação (Whisper de volta) | ~0,45 s por segundo de áudio |
| Analista real (Sonnet, esforço medium) | ~55–65 s, ~US$ 0,24 |
| Comunicador real (Haiku, sem raciocínio estendido, esforço low) | ~10–13 s, ~US$ 0,02 (antes: 45–90 s, até US$ 0,11) |
| Atendimento completo com motor `claude` real | ~1 min 45 s (antes: 3–4 min) |
