import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { transcreverArquivo } from "./audio/stt";
import { motorSapi } from "./audio/tts";
import { gerarBoletim } from "./boletim";
import { salvarPerfil } from "./clientes";
import { CONFIG } from "./config";
import { PerfilCliente } from "./contratos";
import { Observador } from "./observador";
import { criarTrabalho, novoId, processar } from "./pipeline";
import { servir } from "./servidor";

const [cmd, ...resto] = process.argv.slice(2);
const opcao = (nome: string, padrao?: string) => {
  const i = resto.indexOf(`--${nome}`);
  return i >= 0 ? resto[i + 1] : padrao;
};
const posicionais = resto.filter((a, i) => !a.startsWith("--") && !resto[i - 1]?.startsWith("--"));

const AJUDA = `field-shift-agente

  servir                         serviço HTTP (POST /audio) + observador da caixa de entrada
  observar                       só o observador de caixa/entrada
  processar <audio> [--cliente ID] [--canal app|whatsapp]
                                 roda a pipeline completa para um arquivo
  simular "<pergunta>" [--cliente ID]
                                 gera o áudio da pergunta com a voz local e roda a pipeline
  boletim [--cliente ID] [--tipo semanal|mensal]
                                 disparo proativo em áudio (WhatsApp): ferramenta → comunicador → voz
  retomar <id>                   continua um trabalho parado (reaproveita as etapas prontas)
  transcrever <audio>            só o Whisper
  pedidos                        lista pedidos aguardando agente (motor "arquivo")
  cliente-exemplo                cria o perfil de exemplo "joao-cianorte"

Variáveis: AGENTE_MOTOR=claude|arquivo, MODELO_ANALISTA, MODELO_COMUNICADOR, WHISPER_MODELO, PORTA.`;

async function main() {
  switch (cmd) {
    case "servir":
      await servir();
      return;
    case "observar":
      await new Observador().iniciar();
      return;
    case "processar": {
      const arq = posicionais[0];
      if (!arq) throw new Error("informe o arquivo de áudio");
      const t = await criarTrabalho(arq, opcao("cliente", "joao-cianorte")!, (opcao("canal", "teste") as any));
      const e = await processar(t);
      console.log(JSON.stringify(e, null, 2));
      process.exit(e.situacao === "concluido" ? 0 : 1);
    }
    case "simular": {
      const texto = posicionais[0];
      if (!texto) throw new Error('informe a pergunta entre aspas: simular "Faz sentido plantar soja?"');
      const cliente = opcao("cliente", "joao-cianorte")!;
      const dir = join(CONFIG.dirTrabalhos, "_simulados");
      await mkdir(dir, { recursive: true });
      const wav = join(dir, `${novoId(cliente)}.wav`);
      await motorSapi.sintetizar(texto, wav);
      const t = await criarTrabalho(wav, cliente, "teste");
      const e = await processar(t);
      console.log(JSON.stringify(e, null, 2));
      process.exit(e.situacao === "concluido" ? 0 : 1);
    }
    case "boletim": {
      const e = await gerarBoletim(opcao("cliente", "joao-cianorte")!, (opcao("tipo", "semanal") as "semanal" | "mensal"));
      console.log(JSON.stringify(e, null, 2));
      process.exit(e.situacao === "concluido" ? 0 : 1);
    }
    case "retomar": {
      const id = posicionais[0]!;
      const e = await processar({ id, dir: join(CONFIG.dirTrabalhos, id) });
      console.log(JSON.stringify(e, null, 2));
      process.exit(e.situacao === "concluido" ? 0 : 1);
    }
    case "transcrever": {
      console.log(JSON.stringify(await transcreverArquivo(posicionais[0]!), null, 2));
      return;
    }
    case "pedidos": {
      for (const id of await readdir(CONFIG.dirTrabalhos).catch(() => [] as string[])) {
        const dir = join(CONFIG.dirTrabalhos, id);
        for (const n of await readdir(dir).catch(() => [] as string[])) {
          if (!n.endsWith(".pedido.json")) continue;
          const resp = n.replace(".pedido.json", ".resposta.json");
          if (!(await Bun.file(join(dir, resp)).exists()) && !(await Bun.file(join(dir, n.replace(".pedido.json", ".json"))).exists()))
            console.log(join(dir, n));
        }
      }
      return;
    }
    case "cliente-exemplo": {
      const p = PerfilCliente.parse({
        id: "joao-cianorte",
        nome: "João da Silva",
        comoChamar: "Seu João",
        local: { cep: "87209000", municipio: "Cianorte", uf: "PR", pontoDoTalhao: false },
        propriedade: { areaHa: 24, irrigacao: false, culturaAtual: "batata", historicoPlantios: ["soja", "milho-safrinha", "batata"], cooperativa: "Cocamar" },
        comunicacao: { nivelTecnico: "basico", tamanhoResposta: "curta", formalidade: "respeitosa", expressoes: [] },
        observacoes: [],
      });
      await salvarPerfil(p);
      console.log(JSON.stringify(p, null, 2));
      return;
    }
    default:
      console.log(AJUDA);
  }
}

main().catch((e) => {
  console.error(`erro: ${(e as Error).message}`);
  process.exit(1);
});
