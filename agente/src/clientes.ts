import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG } from "./config";
import { PerfilCliente, Turno } from "./contratos";

/**
 * Perfis e memória de conversa, em arquivos (dados/clientes/{id}.json e {id}.conversas.jsonl).
 * No produto isso vai para o banco do app; o formato é o mesmo.
 */

const arqPerfil = (id: string) => join(CONFIG.dirClientes, `${id}.json`);
const arqConversas = (id: string) => join(CONFIG.dirClientes, `${id}.conversas.jsonl`);

export async function lerPerfil(id: string): Promise<PerfilCliente> {
  const f = Bun.file(arqPerfil(id));
  if (await f.exists()) return PerfilCliente.parse(await f.json());
  // Produtor desconhecido: perfil mínimo; o agente vai pedir o que faltar.
  return PerfilCliente.parse({ id, nome: "produtor", comoChamar: "", local: { municipio: "Cianorte", uf: "PR" } });
}

export async function salvarPerfil(p: PerfilCliente) {
  await mkdir(CONFIG.dirClientes, { recursive: true });
  await Bun.write(arqPerfil(p.id), JSON.stringify(PerfilCliente.parse(p), null, 2));
}

export async function ultimasConversas(id: string, n = 4): Promise<Turno[]> {
  const f = Bun.file(arqConversas(id));
  if (!(await f.exists())) return [];
  const linhas = (await f.text()).split("\n").filter(Boolean).slice(-n);
  return linhas.map((l) => Turno.parse(JSON.parse(l)));
}

export async function registrarConversa(id: string, turno: Turno, fatosNovos: string[] = []) {
  await mkdir(CONFIG.dirClientes, { recursive: true });
  await appendFile(arqConversas(id), JSON.stringify(Turno.parse(turno)) + "\n");
  if (fatosNovos.length) {
    const p = await lerPerfil(id);
    const ja = new Set(p.observacoes.map((o) => o.toLowerCase()));
    p.observacoes.push(...fatosNovos.filter((f) => !ja.has(f.toLowerCase())));
    await salvarPerfil(p);
  }
}
