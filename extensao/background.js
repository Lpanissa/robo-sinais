// busca as velas para o robô (fora da página da corretora)
// m: { fonte: 'cripto'|'forex', simbolo, chave, n, tf: 1|5 (minutos) }
const BINANCE = ['https://api.binance.com', 'https://data-api.binance.vision'];

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function binance(simbolo, tf, n) {
  let erro;
  for (const h of BINANCE) {
    try {
      let out = [];
      let fim = Date.now();
      while (out.length < n) {
        const lim = Math.min(1000, n - out.length);
        const k = await json(`${h}/api/v3/klines?symbol=${simbolo}&interval=${tf}m&limit=${lim}&endTime=${fim}`);
        const v = k.map((x) => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4] }));
        out = v.concat(out);
        if (v.length < lim) break;
        fim = v[0].t - 1;
      }
      return out;
    } catch (e) { erro = e; }
  }
  throw erro;
}

async function velas(m) {
  const tf = m.tf || 1;
  if (m.fonte === 'cripto') return binance(m.simbolo, tf, m.n);
  if (!m.chave) throw new Error('falta a chave da Twelve Data');
  const j = await json(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(m.simbolo)}&interval=${tf}min&timezone=UTC&outputsize=${Math.min(5000, m.n)}&apikey=${encodeURIComponent(m.chave)}`);
  if (j.status === 'error') throw new Error(j.message || 'erro na Twelve Data');
  return j.values.map((v) => ({ t: Date.parse(v.datetime.replace(' ', 'T') + 'Z'), o: +v.open, h: +v.high, l: +v.low, c: +v.close })).reverse();
}

// ---------- histórico para o app do celular (Supabase) ----------
const SB_URL = 'https://fyxksvydxwvygjebanno.supabase.co/rest/v1/sinais_ordens';
const SB_CHAVE = 'sb_publishable_HA-Ez2aumnGCLZt2rf-bsQ_MqipvpWK';
const CODIGO = 'rJAShHACX2c91d6HpYqypp_1'; // mesmo código do app: só quem tem ele lê as ordens
async function enviarLote(linhas) {
  const r = await fetch(SB_URL + '?on_conflict=id', {
    method: 'POST',
    headers: { apikey: SB_CHAVE, Authorization: 'Bearer ' + SB_CHAVE, 'Content-Type': 'application/json', 'x-codigo': CODIGO, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(linhas.map((l) => ({ ...l, codigo: CODIGO, atualizado_em: new Date().toISOString() }))),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}
let enviando = false;
async function enviarFila(nova) {
  const { filaOrdens = [] } = await chrome.storage.local.get('filaOrdens');
  if (nova) { const i = filaOrdens.findIndex((x) => x.id === nova.id); if (i >= 0) filaOrdens[i] = nova; else filaOrdens.push(nova); }
  await chrome.storage.local.set({ filaOrdens: filaOrdens.slice(-500) });
  if (enviando || !filaOrdens.length) return;
  enviando = true;
  try {
    const lote = filaOrdens.slice(0, 100);
    await enviarLote(lote);
    const { filaOrdens: atual = [] } = await chrome.storage.local.get('filaOrdens');
    const ids = new Map(lote.map((l) => [l.id, JSON.stringify(l)]));
    await chrome.storage.local.set({ filaOrdens: atual.filter((x) => ids.get(x.id) !== JSON.stringify(x)) });
  } catch (e) { /* sem internet: tenta de novo na próxima ordem */ } finally { enviando = false; }
}

chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (m.tipo === 'ordem') { enviarFila(m.linha).then(() => responder({ ok: true })).catch(() => responder({ ok: false })); return true; }
  if (m.tipo !== 'velas') return false;
  velas(m).then((v) => responder({ ok: true, velas: v })).catch((e) => responder({ ok: false, erro: e.message }));
  return true;
});
