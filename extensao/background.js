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

chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (m.tipo !== 'velas') return false;
  velas(m).then((v) => responder({ ok: true, velas: v })).catch((e) => responder({ ok: false, erro: e.message }));
  return true;
});
