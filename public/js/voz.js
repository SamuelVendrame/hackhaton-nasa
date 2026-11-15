// Voz do Semeia: o Cid fala pelo próprio navegador (pt-BR) e o produtor
// grava áudio (MediaRecorder) para ser transcrito no servidor.

const sintese = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voz = null;
let falaAtual = 0;

function escolherVoz() {
  if (!sintese) return;
  const vozes = sintese.getVoices().filter((v) => /^pt/i.test(v.lang));
  const nota = (v) =>
    (/BR/i.test(v.lang) ? 4 : 0) +
    (/natural|neural|online|google|francisca|luciana/i.test(v.name) ? 3 : 0) -
    (/espeak|compact/i.test(v.name) ? 5 : 0);
  voz = vozes.sort((a, b) => nota(b) - nota(a))[0] || null;
}
if (sintese) {
  escolherVoz();
  sintese.addEventListener?.('voiceschanged', escolherVoz);
}

export const podeFalar = Boolean(sintese);

// Escreve por extenso o que a voz leria errado ("175 mm", "27 °C", "R$ 58")
function paraFala(texto) {
  return String(texto)
    .replace(/[“”"*_#]/g, '')
    .replace(/(\d)\s*kg\/ha\b/g, '$1 quilos por hectare')
    .replace(/(\d)\s*t\/ha\b/g, '$1 toneladas por hectare')
    .replace(/(\d)\s*kg\b/g, '$1 quilos')
    .replace(/(\d)\s*mm\b/g, '$1 milímetros')
    .replace(/(\d)\s*°\s*C?/g, '$1 graus')
    .replace(/(\d)\s*km\/h/g, '$1 quilômetros por hora')
    .replace(/R\$\s*(\d+)/g, '$1 reais')
    .replace(/(\d+)\s*ha\b/g, '$1 hectares');
}

// Duração aproximada da leitura em voz alta, para o player mostrar o tempo
export function duracaoEstimada(texto) {
  const limpo = paraFala(texto);
  const frases = (limpo.match(/[.!?…]+/g) || []).length || 1;
  return Math.max(1500, Math.round((limpo.length / 14.5) * 1000 + frases * 250));
}

// Fala frase por frase (o Chrome corta falas longas). Para o player acompanhar
// a voz de verdade, avisa quando cada frase começa e termina (com a posição em
// caracteres) e, quando o navegador informa, cada palavra lida.
export function falar(texto, { aoTerminar, aoFrase, aoPalavra } = {}) {
  pararFala();
  const id = ++falaAtual;
  if (!sintese) { setTimeout(() => aoTerminar?.(), 300); return; }
  const limpo = paraFala(texto);
  const total = limpo.length;
  const frases = limpo.match(/[^.!?…]+[.!?…]*/g) || [limpo];
  let i = 0;
  let deslocamento = 0;
  const proxima = () => {
    if (id !== falaAtual) return;
    if (i >= frases.length) { aoTerminar?.(); return; }
    const frase = frases[i++];
    const inicio = deslocamento;
    deslocamento += frase.length;
    const fim = deslocamento;
    const u = new SpeechSynthesisUtterance(frase.trim());
    u.lang = voz?.lang || 'pt-BR';
    if (voz) u.voice = voz;
    u.rate = 1;
    let acabou = false;
    const terminouFrase = () => {
      if (acabou) return;
      acabou = true;
      if (id === falaAtual) aoFrase?.({ tipo: 'fim', inicio, fim, total });
      proxima();
    };
    u.onstart = () => { if (id === falaAtual) aoFrase?.({ tipo: 'inicio', inicio, fim, total }); };
    u.onboundary = (e) => { if (id === falaAtual) aoPalavra?.(inicio + e.charIndex, total); };
    u.onend = terminouFrase;
    u.onerror = terminouFrase;
    sintese.speak(u);
  };
  proxima();
}

// Duração real de um áudio gravado (o cronômetro da gravação inclui a folga de 1 s)
export async function duracaoDoAudio(blob) {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    const contexto = new Contexto();
    const dados = await contexto.decodeAudioData(await blob.arrayBuffer());
    contexto.close?.();
    return Math.round(dados.duration * 1000);
  } catch {
    return null;
  }
}

export function pararFala() {
  falaAtual++;
  try { sintese?.cancel(); } catch { /* nada */ }
}

// ---------- gravação ----------
export const podeGravar = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

export async function gravarAudio() {
  const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
  const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  const gravador = new MediaRecorder(fluxo, tipo ? { mimeType: tipo } : undefined);
  const partes = [];
  gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);
  gravador.start();
  const fechar = () => fluxo.getTracks().forEach((t) => t.stop());
  return {
    parar: () =>
      new Promise((ok) => {
        gravador.onstop = () => { fechar(); ok(new Blob(partes, { type: gravador.mimeType || 'audio/webm' })); };
        gravador.stop();
      }),
    cancelar: () => { gravador.onstop = fechar; try { gravador.stop(); } catch { fechar(); } },
  };
}

// Reconhecimento do próprio navegador (Chrome), usado quando não há IA no servidor.
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
export const podeReconhecer = Boolean(Reconhecimento);

export function reconhecerFala({ aoResultado, aoErro, aoFim }) {
  const r = new Reconhecimento();
  r.lang = 'pt-BR';
  r.continuous = true; // escuta enquanto o botão estiver pressionado
  r.interimResults = false;
  r.maxAlternatives = 1;
  let texto = '';
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) texto += ` ${e.results[i][0].transcript}`;
    }
    aoResultado(texto.trim());
  };
  r.onerror = (e) => aoErro?.(e.error);
  r.onend = () => aoFim?.();
  r.start();
  return { parar: () => r.stop(), cancelar: () => r.abort() };
}
