// Robô de Sinais - Piloto (extensão do Chrome para a Olymp Trade)
(() => {
  if (window.__roboSinais) return;
  window.__roboSinais = true;

  const MINUTO = 60000;
  const RETORNO = 0.85; // retorno médio da Olymp no acerto, usado nas contas do teste
  const EMPATE = (100 / (1 + RETORNO));
  const PADRAO = {
    ligado: false, modo: 'melhor', estrategia: 'conf', expira: 1, tfManual: 1,
    valor: 10, modoValor: 'percent', percent: 1, chave: '',
    maxPerdasSeguidas: 3, limitePerda: 100, minAcerto: 56, minOps: 40, rigor: 2.5,
  };

  // ---------- ativos ----------
  const FOREX = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'EUR/JPY', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'EUR/GBP', 'GBP/JPY', 'AUD/JPY', 'EUR/CHF'];
  const RANKING_ATIVOS = [
    { titulo: 'EUR/USD', fonte: 'forex', simbolo: 'EUR/USD' }, { titulo: 'GBP/USD', fonte: 'forex', simbolo: 'GBP/USD' },
    { titulo: 'USD/JPY', fonte: 'forex', simbolo: 'USD/JPY' }, { titulo: 'AUD/USD', fonte: 'forex', simbolo: 'AUD/USD' },
    { titulo: 'EUR/JPY', fonte: 'forex', simbolo: 'EUR/JPY' }, { titulo: 'Ouro', fonte: 'forex', simbolo: 'XAU/USD' },
    { titulo: 'Bitcoin', fonte: 'cripto', simbolo: 'BTCUSDT' }, { titulo: 'Ethereum', fonte: 'cripto', simbolo: 'ETHUSDT' },
  ];
  function detectarAtivo() {
    const titulo = (q('[data-test="assets-tabs-tab-title"]')?.innerText || '').trim();
    const botao = q('[data-test^="asset-select-button-"][data-test$="/ftt"]');
    const id = botao ? botao.getAttribute('data-test').replace('asset-select-button-', '').replace('/ftt', '') : '';
    const t = titulo.toUpperCase();
    const base = { titulo: titulo || id || '?', id };
    if (/OTC/.test(t) || /OTC/.test(id)) return { ...base, erro: 'Ativo OTC: o preço é da própria corretora, o robô não consegue ler' };
    for (const par of FOREX) if (t === par || id === par.replace('/', '')) return { ...base, fonte: 'forex', simbolo: par };
    if (/BITCOIN|BTC/.test(t) || /^BTC/.test(id)) return { ...base, fonte: 'cripto', simbolo: 'BTCUSDT' };
    if (/ETHEREUM|ETH/.test(t) || /^ETH/.test(id)) return { ...base, fonte: 'cripto', simbolo: 'ETHUSDT' };
    if (/GOLD|OURO|XAU/.test(t) || /^XAU/.test(id)) return { ...base, fonte: 'forex', simbolo: 'XAU/USD' };
    return { ...base, erro: 'Ativo sem cotação para o robô. Use EUR/USD, GBP/USD, USD/JPY, AUD/USD, EUR/JPY, Ouro, Bitcoin ou Ethereum.' };
  }

  // ---------- página da corretora ----------
  const q = (s) => document.querySelector(s);
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const conta = () => (q('[data-test="account-balance-title"]')?.innerText || '').trim();
  const saldo = () => {
    const t = q('[data-test="account-balance-value"]')?.innerText || '';
    return parseFloat(t.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  };
  const campo = (teste) => q(`[data-test="${teste}"] input`);
  function digitar(input, valor) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    input.focus();
    set.call(input, String(valor));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
  }
  const numeroDoCampo = (v) => parseFloat(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  function minutosDoCampo(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    if (/seg|sec|\bs\b/i.test(v)) return n / 60;
    if (/\bh\b|hora/i.test(v)) return n * 60;
    return n;
  }
  async function ajustarValor(valor) {
    const input = campo('amount-input');
    if (!input) throw new Error('não achei o campo Valor');
    digitar(input, valor);
    await espera(250);
    if (Math.abs(numeroDoCampo(input.value) - valor) > 0.001) throw new Error(`o Valor ficou ${input.value}, esperava ${valor}`);
  }
  async function ajustarDuracao(min) {
    const input = campo('trade-time-duration-input');
    if (!input) throw new Error('não achei o campo Duração');
    for (let i = 0; i < 30; i++) {
      const atual = minutosDoCampo(input.value);
      if (Math.abs(atual - min) < 0.01) return;
      const botao = q(`[data-test="trade-time-duration-${atual < min ? 'inc' : 'dec'}"]`);
      if (!botao) throw new Error('não achei os botões da Duração');
      botao.click();
      await espera(180);
    }
    throw new Error(`não consegui deixar a Duração em ${min} min (está ${input.value})`);
  }

  // ---------- teste das combinações (velas reais) ----------
  // sinais de uma estratégia ao longo do histórico, com o mesmo alerta + confirmação do robô
  function sinaisDoHistorico(v, est, rigor) {
    let pre = null;
    const out = [];
    for (let i = 40; i < v.length; i++) {
      const w = v.slice(Math.max(0, i - 220), i + 1);
      const R = est.fn(indicadores(w), rigor, w) || {};
      const k = v[i];
      if (pre) {
        const ok = (R.ready && R.dir === pre.dir) || ((pre.ready || (R.near && R.dir === pre.dir)) && (pre.dir === 'up' ? k.c > k.o : k.c < k.o));
        if (ok) out.push({ i, dir: pre.dir });
        pre = null;
      }
      if (!pre && R.dir && (R.ready || R.near)) pre = { dir: R.dir, ready: !!R.ready };
    }
    return out;
  }
  function medir(v, sinais, velasExp, de, ate) {
    let w = 0, l = 0, livre = -1;
    for (const s of sinais) {
      if (s.i < de || s.i >= ate || s.i <= livre || s.i + velasExp >= v.length) continue;
      const ent = v[s.i].c, sai = v[s.i + velasExp].c;
      if (sai === ent) continue;
      (s.dir === 'up' ? sai > ent : sai < ent) ? w++ : l++;
      livre = s.i + velasExp;
    }
    return { n: w + l, ac: w + l ? (100 * w) / (w + l) : 0, lucro: w * RETORNO - l };
  }
  // escolhe numa parte do histórico (60%) e confere na parte seguinte (40%), para não escolher por sorte
  function rankear(porTf) {
    const linhas = [];
    for (const tf of Object.keys(porTf)) {
      const v = porTf[tf];
      if (!v || v.length < 300) continue;
      const corte = Math.floor(v.length * 0.6);
      for (const est of ESTRATEGIAS) {
        const sinais = sinaisDoHistorico(v, est, cfg.rigor);
        const exps = +tf === 1 ? [1, 2, 3, 5] : [1, 2, 3];
        for (const x of exps) {
          const a = medir(v, sinais, x, 0, corte);
          const b = medir(v, sinais, x, corte, v.length);
          const total = medir(v, sinais, x, 0, v.length);
          linhas.push({ tf: +tf, est: est.id, nome: est.nome, exp: x * +tf, a, b, total });
        }
      }
    }
    const aprovadas = linhas.filter((r) => r.a.n >= cfg.minOps * 0.6 && r.b.n >= cfg.minOps * 0.4 && r.a.ac >= cfg.minAcerto && r.b.ac >= cfg.minAcerto);
    aprovadas.sort((x, y) => y.total.lucro - x.total.lucro);
    linhas.sort((x, y) => y.total.lucro - x.total.lucro);
    return { melhor: aprovadas[0] || null, aprovadas, todas: linhas };
  }

  // ---------- estado ----------
  let cfg = { ...PADRAO };
  let motor = criarMotor();
  let ativo = null;
  let chaveAtivo = '';
  let escolha = null; // { tf, est, nome, exp, a, b, total }
  let rankingAtivo = null;
  let rankingEm = 0;
  let rankingGeral = null;
  let rodandoGeral = false;
  let ultimaBusca = 0;
  let buscando = false;
  let statusTxt = 'Carregando...';
  let statusTipo = 'aviso';
  let operando = false;
  const sessao = { ops: [], perdasSeguidas: 0, resultado: 0, parado: '' };

  chrome.storage.local.get('cfg', (r) => { cfg = { ...PADRAO, ...(r.cfg || {}) }; montarPainel(); });
  const salvar = () => chrome.storage.local.set({ cfg });
  function status(t, tipo) { statusTxt = t; statusTipo = tipo; }

  function pedirVelas(alvo, tf, n) {
    return new Promise((ok, falha) => {
      chrome.runtime.sendMessage({ tipo: 'velas', fonte: alvo.fonte, simbolo: alvo.simbolo, chave: cfg.chave, n, tf }, (r) => {
        if (chrome.runtime.lastError) return falha(new Error(chrome.runtime.lastError.message));
        if (!r || !r.ok) return falha(new Error(r ? r.erro : 'sem resposta'));
        ok(r.velas);
      });
    });
  }

  // o que o robô vai usar agora: a melhor combinação aprovada ou a escolha manual
  function combinacao() {
    if (cfg.modo === 'manual') {
      const e = ESTRATEGIAS.find((x) => x.id === cfg.estrategia) || ESTRATEGIAS[0];
      return { tf: cfg.tfManual, est: e.id, nome: e.nome, exp: cfg.expira, manual: true };
    }
    return escolha;
  }
  const motorCfg = () => { const c = combinacao(); return { rigor: cfg.rigor, expira: c ? c.exp : cfg.expira, tf: (c ? c.tf : 1) * MINUTO }; };

  async function prepararAtivo() {
    ativo = detectarAtivo();
    motor = criarMotor();
    escolha = null;
    rankingAtivo = null;
    ultimaBusca = 0;
    if (ativo.erro) { status(ativo.erro, 'erro'); return; }
    if (ativo.fonte === 'forex' && !cfg.chave) { status('Para forex, cole a chave da Twelve Data nos ajustes do painel', 'erro'); return; }
    try {
      status('Testando as combinações de ' + ativo.titulo + ' com velas reais...', 'aviso');
      const porTf = { 1: await pedirVelas(ativo, 1, 5000), 5: await pedirVelas(ativo, 5, 5000) };
      rankingAtivo = rankear(porTf);
      rankingEm = Date.now();
      escolha = rankingAtivo.melhor;
      const c = combinacao();
      const tf = c ? c.tf : 1;
      carregarHistorico(motor, porTf[tf].slice(-600), motorCfg());
      status(c ? 'Ao vivo · ' + ativo.titulo : `Nenhuma combinação de ${ativo.titulo} passou no teste. Veja o ranking geral.`, c ? 'ok' : 'erro');
    } catch (e) { status('Erro nas cotações: ' + e.message, 'erro'); chaveAtivo = ''; }
  }

  async function ciclo() {
    const novo = detectarAtivo();
    const chave = [novo.titulo, cfg.chave, cfg.modo, cfg.estrategia, cfg.tfManual, cfg.expira, cfg.rigor, cfg.minAcerto, cfg.minOps].join('|');
    if (chave !== chaveAtivo) { chaveAtivo = chave; await prepararAtivo(); return; }
    if (!ativo || ativo.erro || !motor.velas.length || buscando) return;
    // refaz o teste a cada hora
    if (cfg.modo === 'melhor' && Date.now() - rankingEm > 60 * MINUTO) { chaveAtivo = ''; return; }
    const c = combinacao();
    if (!c) return;
    const tfMs = c.tf * MINUTO;
    const agora = Date.now();
    const devido = ativo.fonte === 'cripto'
      ? agora - ultimaBusca >= 2000
      : Math.floor((agora - 3000) / tfMs) > Math.floor((ultimaBusca - 3000) / tfMs);
    if (!devido) return;
    buscando = true;
    ultimaBusca = agora;
    try {
      const v = await pedirVelas(ativo, c.tf, 3);
      v.forEach((k, i) => atualizar(motor, k, i < v.length - 1, motorCfg(), aoAvisar));
      status('Ao vivo · ' + ativo.titulo, 'ok');
    } catch (e) { status('Erro nas cotações: ' + e.message, 'aviso'); }
    buscando = false;
  }

  async function rodarRankingGeral() {
    if (rodandoGeral) return;
    rodandoGeral = true;
    rankingGeral = [];
    let chamadasForex = 0;
    for (const alvo of RANKING_ATIVOS) {
      if (alvo.fonte === 'forex') {
        if (!cfg.chave) continue;
        if (chamadasForex >= 6) { status('Ranking geral: esperando o limite da Twelve Data (1 min)...', 'aviso'); desenhar(); await espera(62000); chamadasForex = 0; }
        chamadasForex += 2;
      }
      try {
        status('Ranking geral: testando ' + alvo.titulo + '...', 'aviso');
        desenhar();
        const r = rankear({ 1: await pedirVelas(alvo, 1, 5000), 5: await pedirVelas(alvo, 5, 5000) });
        rankingGeral.push({ titulo: alvo.titulo, melhor: r.melhor });
      } catch (e) { rankingGeral.push({ titulo: alvo.titulo, erro: e.message }); }
    }
    rankingGeral.sort((x, y) => (y.melhor ? y.melhor.total.lucro : -1e9) - (x.melhor ? x.melhor.total.lucro : -1e9));
    rodandoGeral = false;
    status('Ranking geral pronto', 'ok');
    desenhar(true);
  }

  // ---------- operar ----------
  function aoAvisar(id, tipo) {
    const c = combinacao();
    if (!c || id !== c.est || tipo !== 'sinal') return;
    const op = motor.S[id].ops[motor.S[id].ops.length - 1];
    if (op && op.res === 'aberta') operar(op, c);
  }

  function valorDaEntrada() {
    if (cfg.modoValor !== 'percent') return cfg.valor;
    const s = saldo();
    if (!isFinite(s)) return cfg.valor;
    return Math.max(1, Math.floor((s * cfg.percent) / 100));
  }

  async function operar(sinal, c) {
    const base = { hora: sinal.t, dir: sinal.dir, estrategia: c.nome };
    if (!cfg.ligado) { registrar({ ...base, situacao: 'só sinal (robô desligado)' }); return; }
    if (sessao.parado) { registrar({ ...base, situacao: 'não operou: ' + sessao.parado }); return; }
    if (operando) return;
    operando = true;
    const valor = valorDaEntrada();
    const reg = registrar({ ...base, valor, conta: conta(), situacao: 'entrando...' });
    try {
      await ajustarValor(valor);
      await ajustarDuracao(c.exp);
      const antes = saldo();
      const botao = q(`[data-test="deal-submit-button-${sinal.dir === 'up' ? 'up' : 'down'}"]`);
      if (!botao || botao.disabled) throw new Error('o botão de operar não está disponível');
      botao.click();
      reg.situacao = 'em andamento';
      reg.saldoAntes = antes;
      setTimeout(() => conferir(reg), c.exp * MINUTO + 8000);
    } catch (e) {
      reg.situacao = 'falhou: ' + e.message;
    }
    operando = false;
    desenhar();
  }

  function conferir(reg) {
    const dif = Math.round((saldo() - reg.saldoAntes) * 100) / 100;
    reg.resultado = isFinite(dif) ? dif : null;
    reg.situacao = reg.resultado == null ? 'sem leitura do saldo' : reg.resultado > 0 ? 'ganhou' : reg.resultado < 0 ? 'perdeu' : 'empate';
    if (reg.resultado != null) {
      sessao.resultado += reg.resultado;
      sessao.perdasSeguidas = reg.resultado < 0 ? sessao.perdasSeguidas + 1 : 0;
      if (sessao.perdasSeguidas >= cfg.maxPerdasSeguidas) parar(`${sessao.perdasSeguidas} perdas seguidas`);
      if (-sessao.resultado >= cfg.limitePerda) parar(`prejuízo da sessão chegou a ${(-sessao.resultado).toFixed(2)}`);
    }
    desenhar();
  }
  function parar(motivo) { sessao.parado = motivo; cfg.ligado = false; salvar(); }
  function registrar(r) {
    sessao.ops.unshift(r);
    if (sessao.ops.length > 30) sessao.ops.pop();
    desenhar();
    return r;
  }

  // ---------- painel ----------
  let painel, corpo, aberto = true;
  const dois = (n) => String(n).padStart(2, '0');
  const hora = (t) => { const d = new Date(t); return `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const pct = (x) => x.toFixed(0) + '%';
  const descr = (c) => `velas de ${c.tf} min · ${c.nome} · expiração ${c.exp} min`;

  function montarPainel() {
    if (painel) return;
    const css = document.createElement('style');
    css.textContent = `
#rs-painel{position:fixed;left:84px;bottom:16px;z-index:2147483646;width:340px;max-height:82vh;overflow:auto;background:#151d29;color:#e7ecf3;border:1px solid #253042;border-radius:10px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)}
#rs-painel *{box-sizing:border-box}
#rs-painel .rs-top{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #253042;cursor:pointer}
#rs-painel .rs-top b{font-size:14px}
#rs-painel .rs-c{padding:10px 12px;display:flex;flex-direction:column;gap:9px}
#rs-painel .rs-l{color:#8b97a8;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
#rs-painel .rs-st{display:flex;gap:6px;align-items:center;font-size:12px}
#rs-painel .rs-dot{width:8px;height:8px;border-radius:50%;flex:none}
#rs-painel .rs-sinal{display:flex;gap:10px;align-items:center;background:#0e141d;border-radius:8px;padding:10px}
#rs-painel .rs-ic{width:40px;height:40px;border-radius:7px;display:grid;place-items:center;flex:none}
#rs-painel .rs-t{font-weight:700;font-size:15px}
#rs-painel .rs-mono{font-family:ui-monospace,Consolas,monospace}
#rs-painel .rs-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#rs-painel label{display:flex;flex-direction:column;gap:3px;color:#8b97a8;font-size:11px}
#rs-painel input,#rs-painel select{background:#0e141d;color:#e7ecf3;border:1px solid #253042;border-radius:5px;padding:6px;font:inherit;width:100%}
#rs-painel button.rs-b{border:0;border-radius:7px;padding:10px;font-weight:700;font-size:14px;cursor:pointer}
#rs-painel .rs-ops{display:flex;flex-direction:column;gap:3px;font-size:12px}
#rs-painel .rs-op{display:flex;justify-content:space-between;gap:6px;border-top:1px solid #253042;padding-top:3px}
#rs-painel .rs-real{background:#f0675b;color:#0e141d;font-weight:700;border-radius:5px;padding:4px 6px;font-size:12px}
#rs-painel .rs-box{background:#0e141d;border-radius:8px;padding:8px 10px;font-size:12px}
`;
    document.head.appendChild(css);
    painel = document.createElement('div');
    painel.id = 'rs-painel';
    painel.innerHTML = `<div class="rs-top"><b>Robô de Sinais</b><span class="rs-mono" id="rs-min">–</span></div><div class="rs-c" id="rs-corpo"></div>`;
    document.body.appendChild(painel);
    corpo = painel.querySelector('#rs-corpo');
    painel.querySelector('.rs-top').addEventListener('click', () => { aberto = !aberto; corpo.style.display = aberto ? 'flex' : 'none'; painel.querySelector('#rs-min').textContent = aberto ? '–' : '+'; });
    corpo.addEventListener('change', aoMudar);
    corpo.addEventListener('click', aoClicar);
    desenhar(true);
  }

  function aoMudar(e) {
    const k = e.target.dataset.k;
    if (!k) return;
    const v = e.target.value;
    cfg[k] = ['estrategia', 'chave', 'modoValor', 'modo'].includes(k) ? v.trim() : parseFloat(String(v).replace(',', '.')) || 0;
    salvar();
    desenhar(true);
  }
  function aoClicar(e) {
    const a = e.target.dataset.a;
    if (a === 'ligar') {
      cfg.ligado = !cfg.ligado;
      if (cfg.ligado) { sessao.parado = ''; sessao.perdasSeguidas = 0; }
      salvar();
      desenhar(true);
    }
    if (a === 'zerar') { sessao.ops.length = 0; sessao.resultado = 0; sessao.perdasSeguidas = 0; sessao.parado = ''; desenhar(true); }
    if (a === 'geral') rodarRankingGeral();
  }

  function desenhar(refazerForm) {
    if (!corpo) return;
    const cor = { ok: '#2fc59c', aviso: '#e5a93a', erro: '#f0675b' }[statusTipo];
    const c = combinacao();
    const S = c ? motor.S[c.est] : null;
    const aberta = S && S.ops.find((o) => o.res === 'aberta');
    const agora = Date.now();
    const seg = (t) => Math.max(0, Math.ceil((t - agora) / 1000));
    let sinal;
    if (aberta) sinal = { bg: aberta.dir === 'up' ? '#2fc59c' : '#f0675b', ic: aberta.dir === 'up' ? '▲' : '▼', t: aberta.dir === 'up' ? 'PARA CIMA' : 'PARA BAIXO', s: `entrada ${hora(aberta.t)} · termina ${hora(aberta.fimT)} (${seg(aberta.fimT)} s)` };
    else if (S && S.pre) sinal = { bg: '#e5a93a', ic: '!', t: 'Atenção: possível ' + (S.pre.dir === 'up' ? 'para cima' : 'para baixo'), s: `confirma às ${hora(S.pre.ateT)} (${seg(S.pre.ateT)} s)` };
    else sinal = { bg: '#253042', ic: '○', t: 'Aguardando', s: c ? 'sem sinal por perto' : 'sem combinação aprovada neste ativo' };
    const ct = conta();
    const real = ct && !/demo/i.test(ct);
    const ganhos = sessao.ops.filter((o) => o.resultado > 0).length;
    const perdas = sessao.ops.filter((o) => o.resultado < 0).length;

    let comb;
    if (!c) comb = `<div class="rs-box">Nenhuma combinação deste ativo passou de ${cfg.minAcerto}% nas duas partes do teste. O robô não vai operar aqui.</div>`;
    else if (c.manual) comb = `<div class="rs-box">Manual: ${esc(descr(c))}</div>`;
    else comb = `<div class="rs-box"><b>Melhor agora:</b> ${esc(descr(c))}<br><span class="rs-mono">teste ${pct(c.a.ac)} (${c.a.n}) · conferência ${pct(c.b.ac)} (${c.b.n}) · empate em ${EMPATE.toFixed(0)}%</span></div>`;

    const geral = rankingGeral ? `<div class="rs-box"><b>Ranking geral</b> (melhor combinação de cada ativo)<br>${rankingGeral.map((r) => `${esc(r.titulo)}: ${r.erro ? 'erro' : r.melhor ? `${esc(descr(r.melhor))} · ${pct(r.melhor.total.ac)} em ${r.melhor.total.n}` : 'nenhuma aprovada'}`).join('<br>')}</div>` : '';

    const topo = `
<div class="rs-st"><span class="rs-dot" style="background:${cor}"></span><span>${esc(statusTxt)}</span></div>
${real ? `<div class="rs-real">CONTA REAL: as operações usam dinheiro de verdade</div>` : `<div class="rs-l">Conta: ${esc(ct || '?')}</div>`}
${comb}
<div class="rs-sinal"><div class="rs-ic" style="background:${sinal.bg};color:#0e141d;font-weight:800;font-size:20px">${sinal.ic}</div><div><div class="rs-t">${esc(sinal.t)}</div><div class="rs-mono" style="color:#8b97a8;font-size:12px">${esc(sinal.s)}</div></div></div>
<button class="rs-b" data-a="ligar" style="background:${cfg.ligado ? '#f0675b' : '#2fc59c'};color:#0e141d">${cfg.ligado ? 'Desligar robô' : 'Ligar robô (operar)'}</button>
${sessao.parado ? `<div style="color:#f0675b;font-size:12px">Robô parou: ${esc(sessao.parado)}</div>` : ''}
<div class="rs-row rs-mono" style="font-size:12px"><div>Sessão: <b style="color:${sessao.resultado >= 0 ? '#2fc59c' : '#f0675b'}">${sessao.resultado >= 0 ? '+' : ''}${sessao.resultado.toFixed(2)}</b></div><div>${ganhos} ganhos · ${perdas} perdas</div></div>
<div class="rs-ops">${sessao.ops.slice(0, 8).map((o) => `<div class="rs-op"><span class="rs-mono">${hora(o.hora)} ${o.dir === 'up' ? '▲' : '▼'}</span><span>${esc(o.situacao)}</span><span class="rs-mono" style="color:${o.resultado > 0 ? '#2fc59c' : o.resultado < 0 ? '#f0675b' : '#8b97a8'}">${o.resultado != null ? (o.resultado > 0 ? '+' : '') + o.resultado.toFixed(2) : ''}</span></div>`).join('') || '<span style="color:#8b97a8">Nenhuma operação ainda</span>'}</div>
<button class="rs-b" data-a="geral" style="background:#253042;color:#e7ecf3;font-size:12px;padding:7px">${rodandoGeral ? 'Testando todos os ativos...' : 'Testar todos os ativos (ranking geral)'}</button>
${geral}`;

    const form = `
<div class="rs-l" style="margin-top:4px">Ajustes</div>
<label>Como escolher<select data-k="modo"><option value="melhor"${cfg.modo === 'melhor' ? ' selected' : ''}>Melhor combinação do ativo (automático)</option><option value="manual"${cfg.modo === 'manual' ? ' selected' : ''}>Eu escolho</option></select></label>
${cfg.modo === 'manual' ? `<div class="rs-row">
<label>Estratégia<select data-k="estrategia">${ESTRATEGIAS.map((e) => `<option value="${e.id}"${cfg.estrategia === e.id ? ' selected' : ''}>${e.nome}</option>`).join('')}</select></label>
<label>Velas<select data-k="tfManual">${[1, 5].map((m) => `<option value="${m}"${cfg.tfManual === m ? ' selected' : ''}>${m} min</option>`).join('')}</select></label>
<label>Expiração<select data-k="expira">${[1, 2, 3, 5, 10, 15].map((m) => `<option value="${m}"${cfg.expira === m ? ' selected' : ''}>${m} min</option>`).join('')}</select></label>
</div>` : ''}
<div class="rs-row">
<label>Tipo de entrada<select data-k="modoValor"><option value="percent"${cfg.modoValor === 'percent' ? ' selected' : ''}>% da banca</option><option value="fixo"${cfg.modoValor === 'fixo' ? ' selected' : ''}>Valor fixo</option></select></label>
${cfg.modoValor === 'percent' ? `<label>% da banca por operação<input data-k="percent" value="${cfg.percent}" inputmode="decimal"></label>` : `<label>Valor por operação<input data-k="valor" value="${cfg.valor}" inputmode="decimal"></label>`}
<label>Parar após perdas seguidas<input data-k="maxPerdasSeguidas" value="${cfg.maxPerdasSeguidas}" inputmode="numeric"></label>
<label>Parar se perder na sessão<input data-k="limitePerda" value="${cfg.limitePerda}" inputmode="decimal"></label>
<label>Acerto mínimo no teste (%)<input data-k="minAcerto" value="${cfg.minAcerto}" inputmode="numeric"></label>
<label>Sinais mínimos no teste<input data-k="minOps" value="${cfg.minOps}" inputmode="numeric"></label>
</div>
<label>Chave Twelve Data (forex)<input data-k="chave" type="password" value="${esc(cfg.chave)}" placeholder="Cole a chave aqui"></label>
<button class="rs-b" data-a="zerar" style="background:#253042;color:#e7ecf3;font-size:12px;padding:7px">Zerar contagem da sessão</button>`;

    let topoEl = corpo.querySelector('#rs-topo');
    if (!topoEl) {
      corpo.innerHTML = '<div id="rs-topo" style="display:flex;flex-direction:column;gap:9px"></div><div id="rs-form" style="display:flex;flex-direction:column;gap:9px"></div>';
      topoEl = corpo.querySelector('#rs-topo');
    }
    topoEl.innerHTML = topo;
    if (refazerForm || !corpo.querySelector('#rs-form').innerHTML) corpo.querySelector('#rs-form').innerHTML = form;
  }

  let rodando = false;
  setInterval(async () => {
    if (!rodando) { rodando = true; try { await ciclo(); } finally { rodando = false; } }
    desenhar();
  }, 1000);
})();
