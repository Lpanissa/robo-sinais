// Robô de Sinais - Piloto (extensão do Chrome para a Olymp Trade)
(() => {
  if (window.__roboSinais) return;
  window.__roboSinais = true;

  const MINUTO = 60000;
  const PADRAO = {
    ligado: false, estrategia: 'auto', expira: 1, valor: 10, chave: '', modoValor: 'percent', percent: 1,
    maxPerdasSeguidas: 3, limitePerda: 100, minAcerto: 57, minOps: 12,
  };

  // ---------- ativos ----------
  const FOREX = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'EUR/JPY', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'EUR/GBP', 'GBP/JPY', 'AUD/JPY', 'EUR/CHF'];
  function detectarAtivo() {
    const titulo = (q('[data-test="assets-tabs-tab-title"]')?.innerText || '').trim();
    const botao = q('[data-test^="asset-select-button-"][data-test$="/ftt"]');
    const id = botao ? botao.getAttribute('data-test').replace('asset-select-button-', '').replace('/ftt', '') : '';
    const t = titulo.toUpperCase();
    const base = { titulo: titulo || id || '?', id };
    if (/OTC/.test(t) || /OTC/.test(id)) return { ...base, erro: 'Ativo OTC: o preço é da própria corretora, o robô não consegue ler' };
    for (const par of FOREX) if (t === par || id === par.replace('/', '')) return { ...base, fonte: 'forex', simbolo: par, casas: /JPY/.test(par) ? 3 : 5 };
    if (/BITCOIN|BTC/.test(t) || /^BTC/.test(id)) return { ...base, fonte: 'cripto', simbolo: 'BTCUSDT', casas: 1 };
    if (/ETHEREUM|ETH/.test(t) || /^ETH/.test(id)) return { ...base, fonte: 'cripto', simbolo: 'ETHUSDT', casas: 2 };
    if (/GOLD|OURO|XAU/.test(t) || /^XAU/.test(id)) return { ...base, fonte: 'forex', simbolo: 'XAU/USD', casas: 2 };
    return { ...base, erro: 'Ativo sem cotação para o robô. Use EUR/USD, GBP/USD, USD/JPY, Ouro, Bitcoin ou Ethereum.' };
  }

  // ---------- página da corretora ----------
  const q = (s) => document.querySelector(s);
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const conta = () => (q('[data-test="account-balance-title"]')?.innerText || '').trim();
  const saldo = () => {
    const t = q('[data-test="account-balance-value"]')?.innerText || '';
    const n = t.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(n);
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
    for (let i = 0; i < 20; i++) {
      const atual = minutosDoCampo(input.value);
      if (Math.abs(atual - min) < 0.01) return;
      const botao = q(`[data-test="trade-time-duration-${atual < min ? 'inc' : 'dec'}"]`);
      if (!botao) throw new Error('não achei os botões da Duração');
      botao.click();
      await espera(180);
    }
    throw new Error(`não consegui deixar a Duração em ${min} min (está ${input.value})`);
  }

  // ---------- estado ----------
  let cfg = { ...PADRAO };
  let motor = criarMotor();
  let ativo = null;
  let chaveAtivo = '';
  let ultimaBusca = 0;
  let buscando = false;
  let statusTxt = 'Carregando...';
  let statusTipo = 'aviso';
  let operando = false;
  const sessao = { ops: [], perdasSeguidas: 0, resultado: 0, parado: '' };

  chrome.storage.local.get('cfg', (r) => { cfg = { ...PADRAO, ...(r.cfg || {}) }; montarPainel(); });
  const salvar = () => chrome.storage.local.set({ cfg });

  // estratégia que vale agora: a escolhida ou, no automático, a de melhor acerto nas últimas horas
  function placarRecente(id) {
    const desde = Date.now() - 6 * 60 * MINUTO;
    return placar(motor.S[id], { ...cfg, banca: 1e9, retorno: 85 }, desde);
  }
  function estrategiaAtual() {
    if (cfg.estrategia !== 'auto') return { id: cfg.estrategia, motivo: 'escolhida por você' };
    let melhor = null;
    for (const e of ESTRATEGIAS) {
      const p = placarRecente(e.id);
      const ac = p.total ? (p.acertos / p.total) * 100 : 0;
      if (p.total >= cfg.minOps && ac >= cfg.minAcerto && (!melhor || ac > melhor.ac)) melhor = { id: e.id, ac, total: p.total };
    }
    if (!melhor) return { id: null, motivo: `nenhuma estratégia passou de ${cfg.minAcerto}% nas últimas 6 horas` };
    return { id: melhor.id, motivo: `${melhor.ac.toFixed(0)}% de acerto em ${melhor.total} sinais nas últimas 6 horas` };
  }

  // ---------- dados ----------
  function pedirVelas(n) {
    return new Promise((ok, falha) => {
      chrome.runtime.sendMessage({ tipo: 'velas', fonte: ativo.fonte, simbolo: ativo.simbolo, chave: cfg.chave, n }, (r) => {
        if (chrome.runtime.lastError) return falha(new Error(chrome.runtime.lastError.message));
        if (!r || !r.ok) return falha(new Error(r ? r.erro : 'sem resposta'));
        ok(r.velas);
      });
    });
  }

  async function ciclo() {
    const novo = detectarAtivo();
    const chave = novo.titulo + '|' + (novo.simbolo || '') + '|' + cfg.chave + '|' + cfg.expira + '|' + cfg.rigor;
    if (chave !== chaveAtivo) {
      chaveAtivo = chave;
      ativo = novo;
      motor = criarMotor();
      ultimaBusca = 0;
      if (ativo.erro) { status(ativo.erro, 'erro'); return; }
      if (ativo.fonte === 'forex' && !cfg.chave) { status('Para forex, cole a chave da Twelve Data nos ajustes do painel', 'erro'); return; }
      try {
        status('Carregando velas de ' + ativo.titulo + '...', 'aviso');
        const v = await pedirVelas(500);
        carregarHistorico(motor, v, motorCfg());
        status('Ao vivo · ' + ativo.titulo, 'ok');
      } catch (e) { status('Erro nas cotações: ' + e.message, 'erro'); chaveAtivo = ''; }
      return;
    }
    if (ativo.erro || !motor.velas.length || buscando) return;
    const agora = Date.now();
    const intervalo = ativo.fonte === 'cripto' ? 2000 : null;
    const devido = intervalo ? agora - ultimaBusca >= intervalo : Math.floor((agora - 3000) / MINUTO) > Math.floor((ultimaBusca - 3000) / MINUTO);
    if (!devido) return;
    buscando = true;
    ultimaBusca = agora;
    try {
      const v = await pedirVelas(3);
      v.forEach((c, i) => atualizar(motor, c, i < v.length - 1, motorCfg(), aoAvisar));
      status('Ao vivo · ' + ativo.titulo, 'ok');
    } catch (e) { status('Erro nas cotações: ' + e.message, 'aviso'); }
    buscando = false;
  }
  const motorCfg = () => ({ rigor: cfg.rigor || 2.5, expira: cfg.expira });
  function status(t, tipo) { statusTxt = t; statusTipo = tipo; }

  // ---------- operar ----------
  function aoAvisar(id, tipo) {
    const atual = estrategiaAtual();
    if (id !== atual.id) return;
    if (tipo === 'sinal') {
      const op = motor.S[id].ops[motor.S[id].ops.length - 1];
      if (op && op.res === 'aberta') operar(op, id);
    }
  }

  async function operar(sinal, id) {
    const nome = ESTRATEGIAS.find((e) => e.id === id).nome;
    if (!cfg.ligado) { registrar({ hora: sinal.t, dir: sinal.dir, estrategia: nome, situacao: 'só sinal (robô desligado)' }); return; }
    if (sessao.parado) { registrar({ hora: sinal.t, dir: sinal.dir, estrategia: nome, situacao: 'não operou: ' + sessao.parado }); return; }
    if (operando) return;
    operando = true;
    const valor = valorDaEntrada();
    const reg = registrar({ hora: sinal.t, dir: sinal.dir, estrategia: nome, valor, conta: conta(), situacao: 'entrando...' });
    try {
      await ajustarValor(valor);
      await ajustarDuracao(cfg.expira);
      const antes = saldo();
      const botao = q(`[data-test="deal-submit-button-${sinal.dir === 'up' ? 'up' : 'down'}"]`);
      if (!botao || botao.disabled) throw new Error('o botão de operar não está disponível');
      botao.click();
      reg.situacao = 'em andamento';
      reg.saldoAntes = antes;
      setTimeout(() => conferir(reg), cfg.expira * MINUTO + 8000);
    } catch (e) {
      reg.situacao = 'falhou: ' + e.message;
    }
    operando = false;
    desenhar();
  }

  // gestão de banca: valor fixo ou uma porcentagem pequena do saldo (sobe com a banca, cai junto se perder)
  function valorDaEntrada() {
    if (cfg.modoValor !== 'percent') return cfg.valor;
    const s = saldo();
    if (!isFinite(s)) return cfg.valor;
    return Math.max(1, Math.floor((s * cfg.percent) / 100));
  }

  function conferir(reg) {
    const depois = saldo();
    const dif = Math.round((depois - reg.saldoAntes) * 100) / 100;
    // com a operação aberta o saldo já desconta o valor; no fim volta valor + lucro ou nada
    const resultado = isFinite(dif) ? dif : null;
    reg.resultado = resultado;
    reg.situacao = resultado == null ? 'sem leitura do saldo' : resultado > 0 ? 'ganhou' : resultado < 0 ? 'perdeu' : 'empate';
    if (resultado != null) {
      sessao.resultado += resultado;
      sessao.perdasSeguidas = resultado < 0 ? sessao.perdasSeguidas + 1 : 0;
      if (sessao.perdasSeguidas >= cfg.maxPerdasSeguidas) parar(`${sessao.perdasSeguidas} perdas seguidas`);
      if (-sessao.resultado >= cfg.limitePerda) parar(`prejuízo da sessão chegou a ${(-sessao.resultado).toFixed(2)}`);
    }
    desenhar();
  }

  function parar(motivo) {
    sessao.parado = motivo;
    cfg.ligado = false;
    salvar();
  }

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
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function montarPainel() {
    if (painel) return;
    const css = document.createElement('style');
    css.textContent = `
#rs-painel{position:fixed;left:84px;bottom:16px;z-index:2147483646;width:330px;max-height:80vh;overflow:auto;background:#151d29;color:#e7ecf3;border:1px solid #253042;border-radius:10px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)}
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
    cfg[k] = ['estrategia', 'chave', 'modoValor'].includes(k) ? v.trim() : parseFloat(String(v).replace(',', '.')) || 0;
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
  }

  let ultimoForm = '';
  function desenhar(refazerForm) {
    if (!corpo) return;
    const cor = { ok: '#2fc59c', aviso: '#e5a93a', erro: '#f0675b' }[statusTipo];
    const atual = estrategiaAtual();
    const S = atual.id ? motor.S[atual.id] : null;
    const aberta = S && S.ops.find((o) => o.res === 'aberta');
    const agora = Date.now();
    const seg = (t) => Math.max(0, Math.ceil((t - agora) / 1000));
    let sinal;
    if (aberta) sinal = { bg: aberta.dir === 'up' ? '#2fc59c' : '#f0675b', ic: aberta.dir === 'up' ? '▲' : '▼', t: aberta.dir === 'up' ? 'PARA CIMA' : 'PARA BAIXO', s: `entrada ${hora(aberta.t)} · termina ${hora(aberta.fimT)} (${seg(aberta.fimT)} s)` };
    else if (S && S.pre) sinal = { bg: '#e5a93a', ic: '!', t: 'Atenção: possível ' + (S.pre.dir === 'up' ? 'para cima' : 'para baixo'), s: `confirma às ${hora(S.pre.ateT)} (${seg(S.pre.ateT)} s)` };
    else sinal = { bg: '#253042', ic: '○', t: 'Aguardando', s: atual.id ? 'sem sinal por perto' : 'sem estratégia boa agora' };
    const nomeAtual = atual.id ? ESTRATEGIAS.find((e) => e.id === atual.id).nome : '—';
    const c = conta();
    const real = c && !/demo/i.test(c);
    const ganhos = sessao.ops.filter((o) => o.resultado > 0).length;
    const perdas = sessao.ops.filter((o) => o.resultado < 0).length;

    const topo = `
<div class="rs-st"><span class="rs-dot" style="background:${cor}"></span><span>${esc(statusTxt)}</span></div>
${real ? `<div class="rs-real">CONTA REAL: as operações usam dinheiro de verdade</div>` : `<div class="rs-l">Conta: ${esc(c || '?')}</div>`}
<div class="rs-sinal"><div class="rs-ic" style="background:${sinal.bg};color:#0e141d;font-weight:800;font-size:20px">${sinal.ic}</div><div><div class="rs-t">${esc(sinal.t)}</div><div class="rs-mono" style="color:#8b97a8;font-size:12px">${esc(sinal.s)}</div></div></div>
<div style="font-size:12px;color:#8b97a8">Estratégia agora: <b style="color:#e7ecf3">${esc(nomeAtual)}</b> · ${esc(atual.motivo)}</div>
<button class="rs-b" data-a="ligar" style="background:${cfg.ligado ? '#f0675b' : '#2fc59c'};color:#0e141d">${cfg.ligado ? 'Desligar robô' : 'Ligar robô (operar)'}</button>
${sessao.parado ? `<div style="color:#f0675b;font-size:12px">Robô parou: ${esc(sessao.parado)}</div>` : ''}
<div class="rs-row rs-mono" style="font-size:12px"><div>Sessão: <b style="color:${sessao.resultado >= 0 ? '#2fc59c' : '#f0675b'}">${sessao.resultado >= 0 ? '+' : ''}${sessao.resultado.toFixed(2)}</b></div><div>${ganhos} ganhos · ${perdas} perdas</div></div>
<div class="rs-ops">${sessao.ops.slice(0, 8).map((o) => `<div class="rs-op"><span class="rs-mono">${hora(o.hora)} ${o.dir === 'up' ? '▲' : '▼'}</span><span>${esc(o.situacao)}</span><span class="rs-mono" style="color:${o.resultado > 0 ? '#2fc59c' : o.resultado < 0 ? '#f0675b' : '#8b97a8'}">${o.resultado != null ? (o.resultado > 0 ? '+' : '') + o.resultado.toFixed(2) : ''}</span></div>`).join('') || '<span style="color:#8b97a8">Nenhuma operação ainda</span>'}</div>`;

    const form = `
<div class="rs-l" style="margin-top:4px">Ajustes</div>
<label>Estratégia<select data-k="estrategia">
<option value="auto"${cfg.estrategia === 'auto' ? ' selected' : ''}>Automática (a melhor do momento)</option>
${ESTRATEGIAS.map((e) => `<option value="${e.id}"${cfg.estrategia === e.id ? ' selected' : ''}>${e.nome}</option>`).join('')}
</select></label>
<div class="rs-row">
<label>Tipo de entrada<select data-k="modoValor"><option value="percent"${cfg.modoValor === 'percent' ? ' selected' : ''}>% da banca</option><option value="fixo"${cfg.modoValor === 'fixo' ? ' selected' : ''}>Valor fixo</option></select></label>
${cfg.modoValor === 'percent' ? `<label>% da banca por operação<input data-k="percent" value="${cfg.percent}" inputmode="decimal"></label>` : `<label>Valor por operação<input data-k="valor" value="${cfg.valor}" inputmode="decimal"></label>`}
<label>Expiração<select data-k="expira">${[1, 2, 3, 5].map((m) => `<option value="${m}"${cfg.expira === m ? ' selected' : ''}>${m} min</option>`).join('')}</select></label>
<label>Parar após perdas seguidas<input data-k="maxPerdasSeguidas" value="${cfg.maxPerdasSeguidas}" inputmode="numeric"></label>
<label>Parar se perder na sessão<input data-k="limitePerda" value="${cfg.limitePerda}" inputmode="decimal"></label>
<label>Acerto mínimo (automática, %)<input data-k="minAcerto" value="${cfg.minAcerto}" inputmode="numeric"></label>
<label>Sinais mínimos (automática)<input data-k="minOps" value="${cfg.minOps}" inputmode="numeric"></label>
</div>
<label>Chave Twelve Data (forex)<input data-k="chave" type="password" value="${esc(cfg.chave)}" placeholder="Cole a chave aqui"></label>
<button class="rs-b" data-a="zerar" style="background:#253042;color:#e7ecf3;font-size:12px;padding:7px">Zerar contagem da sessão</button>`;

    let topoEl = corpo.querySelector('#rs-topo');
    if (!topoEl) {
      corpo.innerHTML = '<div id="rs-topo" style="display:flex;flex-direction:column;gap:9px"></div><div id="rs-form" style="display:flex;flex-direction:column;gap:9px"></div>';
      topoEl = corpo.querySelector('#rs-topo');
    }
    topoEl.innerHTML = topo;
    if (refazerForm || !ultimoForm) {
      corpo.querySelector('#rs-form').innerHTML = form;
      ultimoForm = form;
    }
  }

  setInterval(() => { ciclo(); desenhar(); }, 1000);
})();
