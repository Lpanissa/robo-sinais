// roda dentro da página da Olymp (antes dela carregar) e escuta os dados que a própria Olymp recebe
// para desenhar o gráfico: mensagens do WebSocket e respostas de fetch/XHR.
// Por enquanto só repassa amostras para o robô (content.js) estudar o formato; não muda nada na página.
(() => {
  if (window.__rsEscuta) return;
  window.__rsEscuta = true;
  const enviar = (tipo, url, dado) => {
    try {
      let txt = typeof dado === 'string' ? dado : dado instanceof ArrayBuffer ? '[binário ' + dado.byteLength + ' bytes]' : dado instanceof Blob ? '[blob ' + dado.size + ' bytes]' : String(dado);
      window.postMessage({ __rsEscuta: true, tipo, url: String(url || '').slice(0, 200), txt: txt.slice(0, 1500), tam: txt.length }, '*');
    } catch (e) { /* ignora */ }
  };

  const WS = window.WebSocket;
  function WSEscuta(url, prot) {
    const ws = prot === undefined ? new WS(url) : new WS(url, prot);
    enviar('ws-abriu', url, '');
    ws.addEventListener('message', (ev) => enviar('ws-msg', url, ev.data));
    const sendOrig = ws.send.bind(ws);
    ws.send = (d) => { enviar('ws-envio', url, d); return sendOrig(d); };
    return ws;
  }
  WSEscuta.prototype = WS.prototype;
  Object.assign(WSEscuta, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = WSEscuta;

  const f = window.fetch;
  window.fetch = async function (...a) {
    const r = await f.apply(this, a);
    try {
      const url = typeof a[0] === 'string' ? a[0] : a[0] && a[0].url;
      const tipo = r.headers.get('content-type') || '';
      if (/json|text/.test(tipo)) r.clone().text().then((t) => enviar('fetch', url, t)).catch(() => {});
      else enviar('fetch', url, '[' + tipo + ']');
    } catch (e) { /* ignora */ }
    return r;
  };

  const abrir = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url, ...resto) {
    this.addEventListener('load', () => { try { enviar('xhr', url, typeof this.response === 'string' ? this.response : this.responseText || '[' + this.responseType + ']'); } catch (e) { enviar('xhr', url, '[sem texto]'); } });
    return abrir.call(this, m, url, ...resto);
  };
})();
