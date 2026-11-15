import { copyFile, mkdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import { motorAtual, type MotorAgente } from "./agentes/motor";
import { transcreverArquivo } from "./audio/stt";
import { sintetizar } from "./audio/tts";
import { lerPerfil, registrarConversa, ultimasConversas } from "./clientes";
import { CONFIG } from "./config";
import {
  Analise,
  AudioGerado,
  Contexto,
  Entrada,
  Estado,
  Resposta,
  Transcricao,
  Verificacao,
  type EtapaNome,
} from "./contratos";
import {
  baseDeNumeros,
  extrairNumeros,
  frasesImpositivas,
  numerosSemLastro,
  problemasDaAnalise,
  estrategiasOmitidas,
  problemasDeTexto,
  similaridade,
} from "./verificacao";

/**
 * Pipeline de uma mensagem de voz. Cada etapa grava seu artefato em trabalhos/{id}/;
 * se o processo cair, rodar de novo continua da etapa que faltou.
 *
 *  1 entrada      copia o áudio recebido e registra canal/cliente
 *  2 transcricao  Whisper local
 *  3 contexto     perfil + memória + data (determinístico)
 *  4 analise      AGENTE ANALISTA (ferramentas MCP de dados)
 *  5 resposta     AGENTE COMUNICADOR (tom e contexto do cliente)
 *  6 audio        voz local (SAPI/Maria) → wav + ogg
 *  7 verificacao  Whisper de volta + regras; se falhar, volta ao 5 com as correções
 *  8 saida        entrega na caixa de saída e grava a memória da conversa
 */

const Saida = z.object({ ogg: z.string(), json: z.string() });

export interface Trabalho {
  id: string;
  dir: string;
}

const hojeIso = () => new Date().toISOString().slice(0, 10);
const agora = () => new Date().toISOString();

export function novoId(clienteId: string) {
  const t = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${t}-${clienteId}-${Math.random().toString(36).slice(2, 6)}`;
}

async function lerJson<S extends z.ZodTypeAny>(arq: string, s: S): Promise<z.infer<S> | null> {
  const f = Bun.file(arq);
  return (await f.exists()) ? s.parse(await f.json()) : null;
}

async function gravar(arq: string, v: unknown) {
  await Bun.write(arq, JSON.stringify(v, null, 2));
}

export async function lerEstado(dir: string): Promise<Estado | null> {
  return lerJson(join(dir, "estado.json"), Estado);
}

async function atualizarEstado(dir: string, id: string, mudar: (e: Estado) => void) {
  const e: Estado = (await lerEstado(dir)) ?? { id, situacao: "na_fila", etapas: {}, atualizadoEm: agora() };
  mudar(e);
  e.atualizadoEm = agora();
  await gravar(join(dir, "estado.json"), e);
  return e;
}

/** Executa uma etapa uma vez só: se o artefato existe, reaproveita. */
async function etapa<S extends z.ZodTypeAny>(
  t: Trabalho,
  nome: EtapaNome,
  esquema: S,
  fazer: () => Promise<z.infer<S>>,
  log: (m: string) => void,
): Promise<z.infer<S>> {
  const arq = join(t.dir, `${nome}.json`);
  const pronto = await lerJson(arq, esquema);
  if (pronto) return pronto;
  const t0 = Date.now();
  await atualizarEstado(t.dir, t.id, (e) => {
    e.situacao = "processando";
    e.etapaAtual = nome;
    e.etapas[nome] = { inicio: agora() };
  });
  log(`▶ ${nome}`);
  try {
    const v = esquema.parse(await fazer());
    await gravar(arq, v);
    await atualizarEstado(t.dir, t.id, (e) => {
      e.etapas[nome] = { ...e.etapas[nome]!, fim: agora(), ms: Date.now() - t0 };
    });
    log(`✔ ${nome} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    return v;
  } catch (err) {
    const msg = (err as Error).message;
    await atualizarEstado(t.dir, t.id, (e) => {
      e.etapas[nome] = { ...e.etapas[nome]!, fim: agora(), ms: Date.now() - t0, erro: msg };
    });
    throw err;
  }
}

export interface OpcoesPipeline {
  motor?: MotorAgente;
  log?: (m: string) => void;
}

/** Cria o trabalho a partir de um arquivo de áudio recebido. */
export async function criarTrabalho(arquivo: string, clienteId: string, canal: Entrada["canal"] = "app", id = novoId(clienteId)): Promise<Trabalho> {
  const dir = join(CONFIG.dirTrabalhos, id);
  await mkdir(dir, { recursive: true });
  const destino = join(dir, `entrada${extname(arquivo) || ".audio"}`);
  await copyFile(arquivo, destino);
  const entrada: Entrada = { id, recebidoEm: agora(), canal, clienteId, arquivoOriginal: basename(arquivo) };
  await gravar(join(dir, "entrada.json"), entrada);
  await atualizarEstado(dir, id, (e) => {
    e.situacao = "na_fila";
    e.etapas.entrada = { inicio: entrada.recebidoEm, fim: entrada.recebidoEm, ms: 0 };
  });
  return { id, dir };
}

export async function processar(t: Trabalho, op: OpcoesPipeline = {}) {
  const log = op.log ?? ((m: string) => console.log(`[${t.id}] ${m}`));
  const motor = op.motor ?? motorAtual();
  try {
    const entrada = Entrada.parse(await Bun.file(join(t.dir, "entrada.json")).json());
    const arqAudio = join(t.dir, `entrada${extname(entrada.arquivoOriginal) || ".audio"}`);

    const transcricao = await etapa(t, "transcricao", Transcricao, () => transcreverArquivo(arqAudio), log);
    log(`  produtor: "${transcricao.texto}"`);

    const contexto = await etapa(t, "contexto", Contexto, async () => ({
      pergunta: transcricao.texto,
      hoje: hojeIso(),
      cliente: await lerPerfil(entrada.clienteId),
      ultimasConversas: await ultimasConversas(entrada.clienteId),
    }), log);

    let ferramentasObservadas: string[] = [];
    const analise = await etapa(t, "analise", Analise, async () => {
      // Uma análise fora do fluxo (sem ferramentas, sem 3 estratégias, campos vazios) é refeita
      // uma vez com os problemas apontados; se continuar ruim, segue marcada nos avisos.
      let ultima: Analise | null = null;
      let problemas: string[] = [];
      for (let tentativa = 1; tentativa <= 2; tentativa++) {
        const r = await motor.executar({
          papel: "analista",
          sufixo: tentativa > 1 ? `.t${tentativa}` : undefined,
          promptSistema: join(CONFIG.dirPrompts, "analista.md"),
          entrada: problemas.length ? { ...contexto, problemasDaTentativaAnterior: problemas } : contexto,
          esquema: Analise,
          modelo: CONFIG.modeloAnalista,
          usaFerramentas: true,
          dirTrabalho: t.dir,
        });
        ferramentasObservadas = r.ferramentas;
        ultima = r.saida;
        problemas = problemasDaAnalise(r.saida, motor.nome === "claude-code" ? r.ferramentas : []);
        await gravar(join(t.dir, "analise.meta.json"), { motor: motor.nome, tentativa, ferramentas: r.ferramentas, problemas, ms: r.ms, custoUsd: r.custoUsd });
        if (!problemas.length) break;
        log(`  análise reprovada (tentativa ${tentativa}): ${problemas.join(" | ")}`);
      }
      return ultima!;
    }, log);
    if (!ferramentasObservadas.length) {
      const meta = await Bun.file(join(t.dir, "analise.meta.json")).json().catch(() => null);
      ferramentasObservadas = meta?.ferramentas ?? [];
    }
    log(`  intenção: ${analise.intencao}; ferramentas: ${(ferramentasObservadas.length ? ferramentasObservadas : analise.ferramentasUsadas.map((f) => f.nome)).join(", ") || "nenhuma"}`);

    // 5–7: comunicador → voz → verificação, com nova tentativa guiada pelos problemas encontrados.
    let correcoes: string[] = [];
    let resposta: Resposta | null = null;
    let audio: AudioGerado | null = null;
    let verificacao: Verificacao | null = await lerJson(join(t.dir, "verificacao.json"), Verificacao);
    if (verificacao) {
      resposta = await lerJson(join(t.dir, "resposta.json"), Resposta);
      audio = await lerJson(join(t.dir, "audio.json"), AudioGerado);
    }
    for (let tentativa = 1; !verificacao && tentativa <= CONFIG.tentativasComunicador; tentativa++) {
      const sufixo = tentativa > 1 ? `-${tentativa}` : "";
      const tR = Date.now();
      await atualizarEstado(t.dir, t.id, (e) => { e.situacao = "processando"; e.etapaAtual = "resposta"; e.etapas[`resposta${sufixo}`] = { inicio: agora() }; });
      log(`▶ resposta${sufixo}`);
      const r = await motor.executar({
        papel: "comunicador",
        promptSistema: join(CONFIG.dirPrompts, "comunicador.md"),
        entrada: { analise, cliente: contexto.cliente, pergunta: contexto.pergunta, ultimasConversas: contexto.ultimasConversas, ...(correcoes.length ? { correcoes } : {}) },
        esquema: Resposta,
        modelo: CONFIG.modeloComunicador,
        usaFerramentas: false,
        dirTrabalho: t.dir,
        sufixo,
      });
      resposta = r.saida;
      await atualizarEstado(t.dir, t.id, (e) => { e.etapas[`resposta${sufixo}`] = { ...e.etapas[`resposta${sufixo}`]!, fim: agora(), ms: Date.now() - tR }; });
      log(`✔ resposta${sufixo}: "${resposta.textoFalado}"`);

      const tA = Date.now();
      await atualizarEstado(t.dir, t.id, (e) => { e.etapaAtual = "audio"; e.etapas[`audio${sufixo}`] = { inicio: agora() }; });
      audio = await sintetizar(resposta.textoFalado, join(t.dir, `resposta${sufixo}.wav`));
      await atualizarEstado(t.dir, t.id, (e) => { e.etapas[`audio${sufixo}`] = { ...e.etapas[`audio${sufixo}`]!, fim: agora(), ms: Date.now() - tA }; });
      log(`✔ audio${sufixo}: ${audio.duracaoS.toFixed(1)} s (${audio.motor})`);

      const tV = Date.now();
      await atualizarEstado(t.dir, t.id, (e) => { e.etapaAtual = "verificacao"; e.etapas[`verificacao${sufixo}`] = { inicio: agora() }; });
      const volta = await transcreverArquivo(audio.arquivoWav);
      const sim = similaridade(resposta.textoFalado, volta.texto);
      const semLastro = numerosSemLastro(extrairNumeros(resposta.textoFalado), baseDeNumeros(analise, contexto));
      const imp = frasesImpositivas(resposta.textoFalado);
      const texto = problemasDeTexto(resposta, contexto.cliente, audio.duracaoS);
      const problemas = [
        ...(sim < CONFIG.similaridadeMinima ? [`O áudio gerado ficou pouco claro: o reconhecimento de volta acertou ${(sim * 100).toFixed(0)}% das palavras. Use frases mais curtas e palavras comuns; evite siglas e números com muitas casas.`] : []),
        ...(semLastro.length ? [`Números sem lastro na análise: ${semLastro.join(", ")}. Use só números que estão na análise.`] : []),
        ...(imp.length ? [`Frases que mandam em vez de sugerir: ${imp.map((f) => `"${f}"`).join("; ")}. Reescreva como sugestão.`] : []),
        ...texto.problemas,
        ...estrategiasOmitidas(resposta, analise).map((n) => `A estratégia "${n}" da análise não foi mencionada na fala. Cite todas as estratégias, meia frase cada.`),
      ];
      const v: Verificacao = {
        aprovado: problemas.length === 0,
        transcricaoDeVolta: volta.texto,
        similaridade: Math.round(sim * 1000) / 1000,
        numerosSemLastro: semLastro.map(String),
        frasesImpositivas: imp,
        duracaoS: audio.duracaoS,
        problemas,
        avisos: [...texto.avisos, ...problemasDaAnalise(analise, ferramentasObservadas)],
        tentativa,
      };
      await gravar(join(t.dir, `verificacao.t${tentativa}.json`), v);
      await atualizarEstado(t.dir, t.id, (e) => { e.etapas[`verificacao${sufixo}`] = { ...e.etapas[`verificacao${sufixo}`]!, fim: agora(), ms: Date.now() - tV }; });
      log(`${v.aprovado ? "✔" : "✖"} verificacao${sufixo}: similaridade ${(sim * 100).toFixed(0)}%${problemas.length ? `; ${problemas.length} problema(s)` : ""}`);
      if (v.aprovado || tentativa === CONFIG.tentativasComunicador) {
        verificacao = v;
        await gravar(join(t.dir, "resposta.json"), resposta);
        await gravar(join(t.dir, "audio.json"), audio);
        await gravar(join(t.dir, "verificacao.json"), v);
      } else correcoes = problemas;
    }

    // 8: saída
    await etapa(t, "saida", Saida, async () => {
      await mkdir(CONFIG.dirCaixaSaida, { recursive: true });
      const ogg = join(CONFIG.dirCaixaSaida, `${t.id}.ogg`);
      await copyFile(audio!.arquivoOgg ?? audio!.arquivoWav, audio!.arquivoOgg ? ogg : ogg.replace(/\.ogg$/, ".wav"));
      const json = join(CONFIG.dirCaixaSaida, `${t.id}.json`);
      await gravar(json, {
        id: t.id,
        clienteId: entrada.clienteId,
        canal: entrada.canal,
        pergunta: transcricao.texto,
        textoFalado: resposta!.textoFalado,
        textoTela: resposta!.textoTela,
        audio: `${t.id}.ogg`,
        duracaoS: audio!.duracaoS,
        verificacao: { aprovado: verificacao!.aprovado, similaridade: verificacao!.similaridade, problemas: verificacao!.problemas, avisos: verificacao!.avisos },
      });
      await registrarConversa(
        entrada.clienteId,
        { quando: agora(), produtor: transcricao.texto, consultor: resposta!.textoFalado, intencao: analise.intencao },
        analise.fatosNovosDoCliente,
      );
      return { ogg, json };
    }, log);

    return atualizarEstado(t.dir, t.id, (e) => { e.situacao = "concluido"; e.etapaAtual = "saida"; e.erro = undefined; });
  } catch (err) {
    const msg = (err as Error).message;
    log(`✖ falhou: ${msg}`);
    return atualizarEstado(t.dir, t.id, (e) => { e.situacao = "falhou"; e.erro = msg; });
  }
}

