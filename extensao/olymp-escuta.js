// roda dentro da página da Olymp (antes dela carregar), no mesmo WebSocket que a própria Olymp usa:
// - guarda a lista de ativos da Olymp (id, nome, grupo, se está aberto) e repassa para o robô
// - atende os pedidos de velas do robô, pedindo à Olymp o mesmo histórico que o gráfico dela usa
// - repassa amostras das mensagens (por código de evento) para estudar o formato
(() => {
  if (window.__rsEscuta) return;
  window.__rsEscuta = true;
  let ws = null;          // conexão principal da Olymp (ws.olymptrade.com/otp)
  const pedidos = {};     // uuid -> pedido de velas do robô
  const ativos = {};      // id -> { id, titulo, grupo, fechado }
  let ativosEm = 0;
  let modelo = null;      // último pedido de abertura (e = 23) que a própria Olymp mandou: serve de modelo para abrir em outro ativo
  const modelos = {};     // um modelo por conta (demo / real)
  const grupoDe = (x) => String((x && x.d && x.d[0] && x.d[0].group) || '').toLowerCase();

  const postar = (m) => { try { window.postMessage(m, '*'); } catch (e) { /* ignora */ } };

  function amostra(tipo, url, txt, codigos) {
    const longo = /deal|candle/.test(txt.slice(0, 3000));
    postar({ __rsEscuta: true, tipo, url: String(url || '').slice(0, 200), txt: txt.slice(0, longo ? 2500 : 1500), tam: txt.length, codigos });
  }

  function lerMensagem(url, dado) {
    if (typeof dado !== 'string') return;
    let lista;
    try { lista = JSON.parse(dado); } catch (e) { return; }
    if (!Array.isArray(lista)) return;
    let mudouAtivos = false;
    for (const ev of lista) {
      if (!ev || typeof ev !== 'object') continue;
      // resposta de velas (e = 10): só repassa as que o robô pediu
      if (ev.e === 10) {
        const d = Array.isArray(ev.d) ? ev.d[0] : null;
        // acha o pedido pelo uuid; se a resposta vier sem uuid, pelo par e tamanho da vela
        let u = ev.uuid && pedidos[ev.uuid] ? ev.uuid : null;
        if (!u && d) u = Object.keys(pedidos).find((k) => pedidos[k].pair === d.p && pedidos[k].size === d.tf) || null;
        if (!u) continue;
        const p = pedidos[u];
        delete pedidos[u];
        postar({ __rsVelas: true, id: p.id, ok: !!d, candles: d && Array.isArray(d.candles) ? d.candles : [] });
        continue;
      }
      // negociações: 23 = resposta da abertura, 22 = aviso de abertura, 26 = fechou (status win/loss/standoff)
      if (ev.e === 23 && !Array.isArray(ev.d)) postar({ __rsDeal: true, tipo: 'recusou', motivo: JSON.stringify(ev).slice(0, 300) });
      if ((ev.e === 23 || ev.e === 22 || ev.e === 26) && Array.isArray(ev.d)) {
        // resposta de abertura sem negociação = a Olymp recusou; repassa o motivo
        if (ev.e === 23 && !ev.d.some((x) => x && x.id)) postar({ __rsDeal: true, tipo: 'recusou', motivo: JSON.stringify(ev).slice(0, 300) });
        for (const x of ev.d) {
          if (!x || !x.id || !x.pair) continue;
          postar({ __rsDeal: true, tipo: ev.e === 26 ? 'fechou' : 'abriu', id: x.id, pair: x.pair, dir: x.dir, amount: x.amount, status: x.status, bc: x.balance_change, grupo: x.group });
        }
      }
      // lista de ativos: objetos com id, title e group
      if (Array.isArray(ev.d) && ev.d.length && ev.d[0] && ev.d[0].id && ev.d[0].title && ev.d[0].group) {
        for (const a of ev.d) {
          if (!a || !a.id || !a.title) continue;
          ativos[a.id] = { id: a.id, titulo: a.title, grupo: a.group, fechado: !!(a.locked || a.locked_trading) };
          mudouAtivos = true;
        }
      }
    }
    if (mudouAtivos) ativosEm = Date.now();
    // amostra para estudo (sem as cotações por segundo, que são muitas)
    const codigos = lista.map((x) => x && x.e).join(',');
    if (!/^(1|11|283|1097)$/.test(codigos)) amostra('ws-msg', url, dado, codigos);
  }

  let ultimoTique = 0;
  const WS = window.WebSocket;
  function WSEscuta(url, prot) {
    const w = prot === undefined ? new WS(url) : new WS(url, prot);
    if (/olymptrade\.com\/otp/.test(String(url))) { ws = w; amostra('ws-abriu', url, '', ''); }
    w.addEventListener('message', (ev) => {
      // avisa o robô a cada mensagem (no máximo 4 por segundo): serve de relógio quando a aba está escondida
      const agora = Date.now();
      if (agora - ultimoTique > 250) { ultimoTique = agora; postar({ __rsTique: 1 }); }
      lerMensagem(url, ev.data);
    });
    const sendOrig = w.send.bind(w);
    w.send = (d) => {
      // pedido de abertura de negociação (e = 23): repassa par, direção e duração que a Olymp vai usar
      if (typeof d === 'string' && d.includes('"e":23')) {
        try {
          for (const x of JSON.parse(d)) if (x.e === 23 && x.d && x.d[0]) {
            postar({ __rsDeal: true, tipo: 'pedido', pair: x.d[0].pair, dir: x.d[0].dir, amount: x.d[0].amount, duracao: x.d[0].duration });
            if (!x.__rs) { modelo = JSON.parse(JSON.stringify(x)); if (grupoDe(modelo)) modelos[grupoDe(modelo)] = modelo; postar({ __rsModelo: true, modelo }); }
          }
        } catch (e) { /* ignora */ }
      }
      if (typeof d === 'string' && !/"__rs/.test(d)) { let c = ''; try { c = JSON.parse(d).map((x) => x.e).join(','); } catch (e) { c = '?'; } amostra('ws-envio', url, d, c); }
      return sendOrig(d);
    };
    return w;
  }
  WSEscuta.prototype = WS.prototype;
  Object.assign(WSEscuta, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = WSEscuta;

  // pedidos do robô (content.js)
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (ev.source !== window || !m) return;
    if (m.__rsPedirVelas) {
      const { id, pair, size, to, limit } = m.__rsPedirVelas;
      if (!ws || ws.readyState !== 1) { postar({ __rsVelas: true, id, ok: false, erro: 'conexão da Olymp fechada' }); return; }
      const uuid = 'rs' + Math.random().toString(36).slice(2, 10);
      pedidos[uuid] = { id, pair, size, desde: Date.now() };
      ws.send(JSON.stringify([{ t: 2, e: 10, uuid, d: [{ pair, size, to, limit }] }]));
      setTimeout(() => { if (pedidos[uuid]) { delete pedidos[uuid]; postar({ __rsVelas: true, id, ok: false, erro: 'a Olymp não respondeu' }); } }, 10000);
    }
    if (m.__rsPedirAtivos) postar({ __rsAtivos: true, lista: Object.values(ativos), em: ativosEm });
    // modelo guardado de outra vez (o robô devolve ao carregar a página)
    if (m.__rsGuardarModelo) { const g = grupoDe(m.__rsGuardarModelo); if (g && !modelos[g]) modelos[g] = m.__rsGuardarModelo; if (!modelo) modelo = m.__rsGuardarModelo; }
    // abrir negociação em qualquer ativo sem mudar a tela: copia o pedido que a própria Olymp usa e troca ativo, direção, valor e duração
    if (m.__rsAbrir) {
      const { id, pair, dir, amount, duration, grupo } = m.__rsAbrir;
      if (!ws || ws.readyState !== 1) { postar({ __rsAbrirResp: true, id, ok: false, motivo: 'conexão da Olymp fechada' }); return; }
      // usa só o modelo da própria conta aberta (a Olymp recusa o modelo de uma conta usado na outra)
      const base = modelos[grupo];
      if (!base) { postar({ __rsAbrirResp: true, id, ok: false, motivo: 'ainda não tenho o modelo de ordem da conta ' + (grupo === 'demo' ? 'Demo' : 'Real') + ' (falta uma entrada pela tela nesta conta)' }); return; }
      const x = JSON.parse(JSON.stringify(base));
      x.uuid = 'rs' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      Object.assign(x.d[0], { pair, dir, amount, duration });
      ws.send(JSON.stringify([x]));
      postar({ __rsAbrirResp: true, id, ok: true });
    }
  });
})();
