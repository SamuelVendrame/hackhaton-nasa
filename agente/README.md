# field-shift-agente

Pipeline local de voz do consultor: recebe o áudio do produtor, transcreve (Whisper local), analisa com as ferramentas de dados (agente analista via Claude Code + MCP), ajusta o tom ao cliente (agente comunicador), gera a voz, confere a voz transcrevendo de volta e entrega. Arquitetura em [../docs/agentes.md](../docs/agentes.md).

## Preparar (uma vez)

```bash
cd agente
bun install
bun run scripts/baixar-modelos.ts small     # Whisper small, ~240 MB, de huggingface.co/onnx-community
bun run scripts/baixar-voz.ts faber         # voz neural Piper pt-BR, ~85 MB (github.com/rhasspy/piper + huggingface)
bun run src/cli.ts cliente-exemplo          # perfil "joao-cianorte"
claude                                      # e depois /login (o agente roda como "claude -p")
```

As ferramentas de dados ficam em `../tools` (precisa de `bun install` lá também). O token NASA Earthdata vai em `../tools/.env`.

## Rodar

```bash
bun run servir                                            # http://localhost:3333 (página de teste + API)
bun run src/cli.ts simular "Faz sentido plantar soja mês que vem depois da batata?"
bun run src/cli.ts processar caminho/do/audio.ogg --cliente joao-cianorte
bun run src/cli.ts boletim --cliente joao-cianorte --tipo semanal
bun test
```

Sem login do Claude Code, use `AGENTE_MOTOR=arquivo`: a pipeline grava `trabalhos/{id}/{papel}.pedido.json` e espera `{papel}.resposta.json` (`bun run src/cli.ts pedidos` lista o que está esperando).

## Variáveis (.env)

| Variável | Padrão | |
|---|---|---|
| `AGENTE_MOTOR` | `claude` | `claude` ou `arquivo` |
| `MODELO_ANALISTA` / `MODELO_COMUNICADOR` | `sonnet` / `haiku` | modelos das duas sessões |
| `CLAUDE_BIN` | `~/.local/bin/claude.exe` | caminho do Claude Code |
| `WHISPER_MODELO` | small se baixado, senão base | `onnx-community/whisper-small` |
| `VOZ_MOTOR` | `piper` se instalado, senão `sapi` | motor de voz |
| `VOZ_PIPER`, `VOZ_PIPER_RITMO` | `pt_BR-faber-medium`, `1.0` | voz neural (maior = mais devagar) |
| `VOZ_SAPI`, `VOZ_VELOCIDADE` | `Microsoft Maria Desktop`, `0` | voz do Windows (reserva) |
| `ESFORCO_ANALISTA` / `ESFORCO_COMUNICADOR` | `medium` / `low` | esforço de raciocínio |
| `RACIOCINIO_COMUNICADOR` | desligado | `1` liga o raciocínio estendido do comunicador |
| `PORTA` | `3333` | |
| `SIMILARIDADE_MINIMA` | `0.8` | verificação do áudio |
