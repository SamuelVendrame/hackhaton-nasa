// Registros que o produtor faz no app (formulários de Minha roça ou conversa com o Cid).
// Ficam no navegador dele, somados aos dados de exemplo da roça.

import { armazenar } from './util.js';

export const CHAVE_REGISTROS = 'semeia:registros';
export const CHAVE_RASCUNHO = 'semeia:rascunho';

export function salvarRegistro(ctx, area, tipo, item) {
  const reg = ctx.registros[area] || { historico: [], aplicacoes: [] };
  if (tipo === 'safra') reg.historico.unshift(item);
  else reg.aplicacoes.unshift(item);
  ctx.registros[area] = reg;
  armazenar.gravar(CHAVE_REGISTROS, ctx.registros);
}

// "Corrigir" na conversa: abre o formulário da área já preenchido
export function guardarRascunho(registro) {
  armazenar.gravar(CHAVE_RASCUNHO, registro, true);
}

export function pegarRascunho(area) {
  const r = armazenar.ler(CHAVE_RASCUNHO, null, true);
  if (!r || r.area !== area) return null;
  armazenar.limpar([CHAVE_RASCUNHO]);
  return r;
}
