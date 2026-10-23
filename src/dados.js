export const ATIVOS = [
  { id: 'EURUSD', nome: 'EUR/USD', fonte: 'forex', simbolo: 'EUR/USD', casas: 5 },
  { id: 'GBPUSD', nome: 'GBP/USD', fonte: 'forex', simbolo: 'GBP/USD', casas: 5 },
  { id: 'USDJPY', nome: 'USD/JPY', fonte: 'forex', simbolo: 'USD/JPY', casas: 3 },
  { id: 'AUDUSD', nome: 'AUD/USD', fonte: 'forex', simbolo: 'AUD/USD', casas: 5 },
  { id: 'EURJPY', nome: 'EUR/JPY', fonte: 'forex', simbolo: 'EUR/JPY', casas: 3 },
  { id: 'XAUUSD', nome: 'Ouro', fonte: 'forex', simbolo: 'XAU/USD', casas: 2 },
  { id: 'BTCUSDT', nome: 'Bitcoin', fonte: 'cripto', simbolo: 'BTCUSDT', casas: 1 },
  { id: 'ETHUSDT', nome: 'Ethereum', fonte: 'cripto', simbolo: 'ETHUSDT', casas: 2 },
];

const BINANCE = ['https://api.binance.com', 'https://data-api.binance.vision'];

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// cb: { historico(velas), vela(vela, fechada), status(texto, tipo) }
export function conectar(ativo, chave, cb) {
  let fim = false, ws = null, timer = null;

  if (ativo.fonte === 'cripto') {
    const abrirWs = () => {
      if (fim) return;
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${ativo.simbolo.toLowerCase()}@kline_1m`);
      ws.onopen = () => cb.status('Ao vivo', 'ok');
      ws.onmessage = (e) => {
        try {
          const k = JSON.parse(e.data).k;
          cb.vela({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c }, k.x);
        } catch (_) {}
      };
      ws.onclose = () => {
        if (!fim) { cb.status('Reconectando...', 'aviso'); timer = setTimeout(abrirWs, 3000); }
      };
      ws.onerror = () => { try { ws.close(); } catch (_) {} };
    };
    (async () => {
      cb.status('Carregando velas...', 'aviso');
      let hist = null;
      for (const h of BINANCE) {
        try { hist = await getJson(`${h}/api/v3/klines?symbol=${ativo.simbolo}&interval=1m&limit=500`); break; } catch (_) {}
      }
      if (fim) return;
      if (!hist) { cb.status('Não consegui buscar as velas da Binance', 'erro'); return; }
      cb.historico(hist.map((k) => ({ t: k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4] })));
      abrirWs();
    })();
  } else {
    if (!chave) {
      cb.status('Falta a chave das cotações de forex (veja Ajustes, no fim da tela)', 'erro');
      return () => {};
    }
    const base = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ativo.simbolo)}&interval=1min&timezone=UTC&apikey=${encodeURIComponent(chave)}`;
    const conv = (v) => ({ t: Date.parse(v.datetime.replace(' ', 'T') + 'Z'), o: +v.open, h: +v.high, l: +v.low, c: +v.close });
    const buscar = async (n) => {
      const j = await getJson(base + '&outputsize=' + n);
      if (j.status === 'error') throw new Error(j.message || 'erro');
      return j.values.map(conv).reverse();
    };
    const agendar = () => {
      const agora = Date.now();
      // 3 segundos depois de virar o minuto
      timer = setTimeout(ciclo, Math.ceil((agora + 1) / 60000) * 60000 + 3000 - agora);
    };
    const ciclo = async () => {
      if (fim) return;
      try {
        const h = await buscar(3);
        if (fim) return;
        h.forEach((c, i) => cb.vela(c, i < h.length - 1));
        cb.status('Ao vivo · atualiza a cada minuto', 'ok');
      } catch (e) {
        cb.status('Erro nas cotações: ' + e.message, 'aviso');
      }
      agendar();
    };
    (async () => {
      cb.status('Carregando velas...', 'aviso');
      try {
        const h = await buscar(500);
        if (fim) return;
        cb.historico(h);
        cb.status('Ao vivo · atualiza a cada minuto', 'ok');
      } catch (e) {
        cb.status('Erro nas cotações: ' + e.message, 'erro');
        return;
      }
      agendar();
    })();
  }

  return () => {
    fim = true;
    clearTimeout(timer);
    if (ws) { ws.onclose = null; try { ws.close(); } catch (_) {} }
  };
}
