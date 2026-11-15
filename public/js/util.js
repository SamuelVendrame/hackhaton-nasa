export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const dataLocal = (iso) => new Date(`${iso}T12:00:00`);
export const hojeISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
export const fmtData = (iso) => { const d = dataLocal(iso); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
export const fmtDataCurta = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a.slice(2)}`; };
export const diasEntre = (a, b) => Math.round((dataLocal(b) - dataLocal(a)) / 86400000);

export function nomeDoDia(iso, hoje = hojeISO()) {
  const dif = diasEntre(hoje, iso);
  if (dif === 0) return 'hoje';
  if (dif === 1) return 'amanhã';
  return DIAS[dataLocal(iso).getDay()];
}

export function saudacao() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export const horaAgora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

// Armazenamento do navegador: só conveniência da demo, nunca obrigatório.
export const armazenar = {
  ler(chave, padrao = null, sessao = false) {
    try {
      const v = (sessao ? sessionStorage : localStorage).getItem(chave);
      return v == null ? padrao : JSON.parse(v);
    } catch { return padrao; }
  },
  gravar(chave, valor, sessao = false) {
    try { (sessao ? sessionStorage : localStorage).setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
  },
  limpar(chaves) {
    for (const c of chaves) {
      try { localStorage.removeItem(c); sessionStorage.removeItem(c); } catch { /* sem armazenamento */ }
    }
  },
};

export async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// Ícones de traço, herdam a cor do texto
export const ICONES = {
  play: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5 L13 8 L4 13.5 Z" fill="currentColor"/></svg>',
  pause: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/></svg>',
  voltar: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L8 12 L15 19" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  seta: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink:0"><path d="M9 5 L16 12 L9 19" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mic: '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11 a6 6 0 0 0 12 0 M12 17 V21 M9 21 H15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  parar: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>',
  enviar: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 L20 4 L14 20 L11 13 Z" fill="currentColor"/></svg>',
  lampada: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 a6 6 0 0 0 -3.5 10.9 V16 h7 v-2.1 A6 6 0 0 0 12 3 Z M9.5 19 h5 M10.5 21.5 h3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  falante: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9 h4 l5 -4 v14 l-5 -4 H4 Z" fill="currentColor"/><path d="M16 9 a4 4 0 0 1 0 6 M18.5 6.5 a7.5 7.5 0 0 1 0 11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  pessoaFalando: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20 c0 -3.6 2.9 -6 6.5 -6 s6.5 2.4 6.5 6"/><path d="M16.5 5.5 a3.5 3.5 0 0 1 0 5"/><path d="M19 3.5 a6.5 6.5 0 0 1 0 9"/></svg>',
  balao: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M8 9.5h8 M8 12.5h5"/></svg>',
  sol: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="#FFC21A"/><path d="M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M5.6 18.4 L7 17 M17 7 L18.4 5.6" stroke="#E0A800" stroke-width="1.8" stroke-linecap="round"/></svg>',
  nuvem: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18 h10 a4 4 0 0 0 0 -8 a5.5 5.5 0 0 0 -10.6 1.6 A3.2 3.2 0 0 0 7 18 Z" fill="#B9C9BC"/></svg>',
  chuva: '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14 h10 a4 4 0 0 0 0 -8 a5.5 5.5 0 0 0 -10.6 1.6 A3.2 3.2 0 0 0 7 14 Z" fill="#8FA596"/><path d="M8 17 L7 20 M12 17 L11 20 M16 17 L15 20" stroke="#2F7FC1" stroke-width="1.8" stroke-linecap="round"/></svg>',
  bom: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#0ca30c"/><path d="M7.5 12.5 l3 3 l6 -6.5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  atencao: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 L22.5 20.5 H1.5 Z" fill="#fab219"/><path d="M12 9 V14" stroke="#14361F" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.3" fill="#14361F"/></svg>',
  ruim: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#d03b3b"/><path d="M8.5 8.5 l7 7 M15.5 8.5 l-7 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
};

export function iconeDoTempo(mm, chance) {
  if (mm >= 5) return { icone: ICONES.chuva, texto: mm >= 20 ? 'Chuva forte' : 'Chuva' };
  if (mm >= 1 || chance >= 50) return { icone: ICONES.nuvem, texto: 'Pode chover' };
  return { icone: ICONES.sol, texto: 'Sem chuva' };
}
