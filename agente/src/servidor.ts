import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { lerPerfil, salvarPerfil } from "./clientes";
import { CONFIG } from "./config";
import { PerfilCliente } from "./contratos";
import { Observador } from "./observador";
import { criarTrabalho, lerEstado, novoId } from "./pipeline";

/**
 * Serviço de recebimento e envio de áudio (app e testes).
 *
 *   POST /audio?cliente=ID&canal=app    corpo = áudio (bruto) ou multipart com campo "audio"
 *        → 202 { id, estado: "/trabalhos/ID", audio: "/trabalhos/ID/audio" }
 *   GET  /trabalhos/ID                  estado da pipeline + texto da resposta quando pronta
 *   GET  /trabalhos/ID/audio            áudio da resposta (ogg/opus)
 *   GET  /trabalhos/ID/eventos          SSE: avisa quando a situação muda
 *   GET  /clientes/ID  · PUT /clientes/ID   perfil do produtor
 *   GET  /                              página de teste: grava no microfone e toca a resposta
 */

const MIME: Record<string, string> = {
  "audio/ogg": ".ogg", "audio/opus": ".ogg", "audio/webm": ".webm", "video/webm": ".webm",
  "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav",
};

const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "access-control-allow-origin": "*" } });

export async function servir(observador = new Observador()) {
  await observador.iniciar();
  const pagina = Bun.file(join(CONFIG.raiz, "publico", "index.html"));

  const servidor = Bun.serve({
    port: CONFIG.porta,
    idleTimeout: 120,
    async fetch(req) {
      const url = new URL(req.url);
      const partes = url.pathname.split("/").filter(Boolean);

      if (req.method === "OPTIONS")
        return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT", "access-control-allow-headers": "content-type" } });

      if (url.pathname === "/" && req.method === "GET") return new Response(pagina, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (url.pathname === "/saude") return json({ ok: true, fila: observador.tamanhoFila, motorAgente: CONFIG.motorAgente, whisper: CONFIG.modeloWhisper });

      if (url.pathname === "/audio" && req.method === "POST") {
        const cliente = url.searchParams.get("cliente") ?? "desconhecido";
        if (!/^[a-zA-Z0-9-]+$/.test(cliente)) return json({ erro: "cliente inválido" }, 400);
        const canal = (url.searchParams.get("canal") ?? "app") as "app" | "whatsapp" | "teste";
        let bytes: ArrayBuffer;
        let tipo = req.headers.get("content-type") ?? "";
        if (tipo.startsWith("multipart/form-data")) {
          const f = (await req.formData()).get("audio");
          if (!(f instanceof Blob)) return json({ erro: "campo 'audio' ausente" }, 400);
          bytes = await f.arrayBuffer();
          tipo = f.type;
        } else bytes = await req.arrayBuffer();
        if (bytes.byteLength < 1000) return json({ erro: "áudio vazio ou muito curto" }, 400);
        if (bytes.byteLength > 25_000_000) return json({ erro: "áudio maior que 25 MB" }, 413);
        const ext = MIME[tipo.split(";")[0]!.trim()] ?? ".webm";
        const id = novoId(cliente);
        const tmp = join(CONFIG.dirTrabalhos, "_recebidos");
        await mkdir(tmp, { recursive: true });
        const arq = join(tmp, `${id}${ext}`);
        await Bun.write(arq, bytes);
        const t = await criarTrabalho(arq, cliente, canal, id);
        observador.enfileirar(t);
        return json({ id, estado: `/trabalhos/${id}`, audio: `/trabalhos/${id}/audio` }, 202);
      }

      if (partes[0] === "trabalhos" && partes[1] && /^[\w-]+$/.test(partes[1])) {
        const dir = join(CONFIG.dirTrabalhos, partes[1]);
        const estado = await lerEstado(dir).catch(() => null);
        if (!estado) return json({ erro: "trabalho não encontrado" }, 404);
        if (partes[2] === "audio") {
          const a = await Bun.file(join(dir, "audio.json")).json().catch(() => null);
          const arq = a?.arquivoOgg ?? a?.arquivoWav;
          if (estado.situacao === "concluido" && arq && (await Bun.file(arq).exists()))
            return new Response(Bun.file(arq), { headers: { "content-type": arq.endsWith(".ogg") ? "audio/ogg" : "audio/wav", "access-control-allow-origin": "*" } });
          return json({ erro: "áudio ainda não está pronto", situacao: estado.situacao }, 409);
        }
        if (partes[2] === "eventos") {
          let ultimo = "";
          const stream = new ReadableStream({
            async start(c) {
              for (let i = 0; i < 900; i++) {
                const e = await lerEstado(dir).catch(() => null);
                const chave = `${e?.situacao}:${e?.etapaAtual}`;
                if (chave !== ultimo) {
                  ultimo = chave;
                  c.enqueue(`data: ${JSON.stringify(e)}\n\n`);
                }
                if (e?.situacao === "concluido" || e?.situacao === "falhou") break;
                await Bun.sleep(1000);
              }
              c.close();
            },
          });
          return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "access-control-allow-origin": "*" } });
        }
        const ler = (n: string) => Bun.file(join(dir, n)).json().catch(() => null);
        const [transcricao, resposta, verificacao] = await Promise.all([ler("transcricao.json"), ler("resposta.json"), ler("verificacao.json")]);
        return json({
          ...estado,
          pergunta: transcricao?.texto,
          resposta: resposta && { textoFalado: resposta.textoFalado, textoTela: resposta.textoTela },
          verificacao: verificacao && { aprovado: verificacao.aprovado, similaridade: verificacao.similaridade, problemas: verificacao.problemas },
          audio: estado.situacao === "concluido" ? `/trabalhos/${partes[1]}/audio` : null,
        });
      }

      if (partes[0] === "clientes" && partes[1] && /^[a-zA-Z0-9-]+$/.test(partes[1])) {
        if (req.method === "GET") return json(await lerPerfil(partes[1]));
        if (req.method === "PUT") {
          const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
          const r = PerfilCliente.safeParse({ ...corpo, id: partes[1] });
          if (!r.success) return json({ erro: r.error.issues }, 400);
          await salvarPerfil(r.data);
          return json(r.data);
        }
      }
      return json({ erro: "rota não encontrada" }, 404);
    },
  });
  console.log(`serviço de áudio em http://localhost:${servidor.port}  (motor dos agentes: ${CONFIG.motorAgente}, Whisper: ${CONFIG.modeloWhisper})`);
  return servidor;
}
