# Semeia

**Do satélite pro seu plantio.** Protótipo do NASA Space Apps Challenge 2026, desafio *Field Shift: Adapting Farms with NASA Data*.

O Semeia ajuda o pequeno produtor a decidir o que plantar no próximo ciclo. O Cid, assistente do app, conversa por áudio e compara caminhos de rotação usando o clima histórico da roça medido por satélite (NASA), a previsão da semana, o histórico da área e o contrato da cooperativa.

## Como rodar

Precisa de Node 20 ou mais novo. Não há dependências para instalar.

```bash
cp .env.example .env   # opcional: coloque a GROQ_API_KEY para ligar a IA
npm start              # http://localhost:3000
```

- **Com `GROQ_API_KEY`:** o Cid responde com IA (`openai/gpt-oss-120b`) e transcreve o áudio (`whisper-large-v3-turbo`).
- **Sem chave:** tudo funciona em modo demonstração, com respostas prontas montadas sobre os mesmos dados. O microfone usa o reconhecimento de voz do Chrome.
- **Microfone:** o navegador só libera em `localhost` ou HTTPS.

### No celular

```bash
npm run celular        # HTTP em :3000 e HTTPS em :3443, com certificado local
```

Com o celular no mesmo Wi-Fi do notebook, abra o endereço `https://<ip-do-notebook>:3443` que o terminal mostrar. Na primeira vez o navegador avisa que a conexão não é privada (o certificado é gerado na hora, só para a rede local): toque em **Avançado** e continue. Depois disso o microfone funciona.

Se o Wi-Fi do evento bloquear a conexão entre aparelhos, use o roteador do celular (o notebook entra no Wi-Fi do celular) ou um túnel HTTPS.
- **Leitura em voz alta:** usa a voz em português do navegador (Chrome ou Edge têm as melhores vozes).

## O que é real e o que é exemplo

| Parte | Origem |
|---|---|
| Clima histórico de Cianorte, PR (1981 a 2025): chuva, temperatura, umidade do solo | **Real**, NASA POWER, em `public/data/nasa-cianorte.json` |
| Previsão dos próximos 16 dias | **Real**, Open-Meteo, com uma cópia salva para usar sem internet |
| Propriedade, lavouras, histórico, análise de solo, preços da cooperativa | **Exemplo**, em `public/data/fazenda.json` |
| Regras dos três caminhos de rotação | Demonstração, ainda **sem validação de agrônomo**, em `public/js/caminhos.js` |

Para atualizar os dados da NASA: `npm run dados:nasa`.

## Estrutura

```
server.js                 servidor sem dependências: app, previsão e Cid (Groq)
scripts/nasa-power.mjs    baixa o NASA POWER e calcula os indicadores
public/
  index.html, css/        app (identidade do protótipo Semeia)
  js/app.js               rotas e eventos
  js/telas.js             Hoje, Previsão, Clima da roça, Plantio, Minha roça
  js/cid.js               conversa por texto e áudio
  js/caminhos.js          comparação dos 3 caminhos (usado no app e no servidor)
  js/graficos.js          gráficos em SVG
  js/voz.js               fala e gravação no navegador
  data/                   dados da NASA, da roça de exemplo e previsão de reserva
docs/                     visão do produto
resources/                catálogo das fontes de dados do desafio
```
