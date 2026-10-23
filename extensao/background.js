// busca as velas de 1 minuto para o robô (fora da página da corretora)
const BINANCE = ['https://api.binance.com', 'https://data-api.binance.vision'];

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function velas(m) {
  if (m.fonte === 'cripto') {
    let erro;
    for (const h of BINANCE) {
      try {
        const k = await json(`${h}/api/v3/klines?symbol=${m.simbolo}&interval=1m&limit=${m.n}`);
        return k.map((x) => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4] }));
      } catch (e) { erro = e; }
    }
    throw erro;
  }
  if (!m.chave) throw new Error('falta a chave da Twelve Data');
  const j = await json(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(m.simbolo)}&interval=1min&timezone=UTC&outputsize=${m.n}&apikey=${encodeURIComponent(m.chave)}`);
  if (j.status === 'error') throw new Error(j.message || 'erro na Twelve Data');
  return j.values.map((v) => ({ t: Date.parse(v.datetime.replace(' ', 'T') + 'Z'), o: +v.open, h: +v.high, l: +v.low, c: +v.close })).reverse();
}

chrome.runtime.onMessage.addListener((m, _s, responder) => {
  if (m.tipo !== 'velas') return false;
  velas(m).then((v) => responder({ ok: true, velas: v })).catch((e) => responder({ ok: false, erro: e.message }));
  return true;
});
