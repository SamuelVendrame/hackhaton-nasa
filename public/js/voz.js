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

// Fala frase por frase (o Chrome corta falas longas) e avisa quando termina.
export function falar(texto, { aoTerminar } = {}) {
  pararFala();
  const id = ++falaAtual;
  if (!sintese) { setTimeout(() => aoTerminar?.(), 300); return; }
  const limpo = String(texto)
    .replace(/[“”"*_#]/g, '')
    .replace(/(\d)\s*mm\b/g, '$1 milímetros')
    .replace(/(\d)\s*°\s*C?/g, '$1 graus')
    .replace(/(\d)\s*km\/h/g, '$1 quilômetros por hora')
    .replace(/R\$\s*(\d+)/g, '$1 reais')
    .replace(/(\d+)\s*ha\b/g, '$1 hectares');
  const frases = limpo.match(/[^.!?…]+[.!?…]*/g) || [limpo];
  let i = 0;
  const proxima = () => {
    if (id !== falaAtual) return;
    if (i >= frases.length) { aoTerminar?.(); return; }
    const u = new SpeechSynthesisUtterance(frases[i++].trim());
    u.lang = voz?.lang || 'pt-BR';
    if (voz) u.voice = voz;
    u.rate = 1;
    u.onend = proxima;
    u.onerror = proxima;
    sintese.speak(u);
  };
  proxima();
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
