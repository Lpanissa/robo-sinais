// Robô de Sinais - Piloto (extensão do Chrome para a Olymp Trade)
(() => {
  if (window.__roboSinais) return;
  window.__roboSinais = true;

  const MINUTO = 60000;
  // extensão atualizada com a aba aberta: o robô antigo para e pede F5 (em vez de dar "Extension context invalidated")
  const vivo = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  let morto = false;
  function aposentar() {
    if (morto) return; morto = true;
    const p = document.getElementById('rs-painel');
    if (p) p.innerHTML = '<div style="padding:12px;font:13px system-ui;color:#e7ecf3;background:#151d29">Robô de Sinais foi atualizado. Recarregando a página sozinho...</div>';
    // dá F5 sozinho assim que não houver ordem deste robô em andamento (no máximo 10 min de espera)
    const desde = Date.now();
    const tentar = () => {
      const andamento = (typeof sessao !== 'undefined') && sessao.ops.some((r) => r.situacao === 'em andamento');
      if (!andamento || Date.now() - desde > 10 * 60000) location.reload(); else setTimeout(tentar, 5000);
    };
    setTimeout(tentar, 3000);
  }
  const repetir = (fn, ms) => { const id = setInterval(() => { if (!vivo()) { clearInterval(id); aposentar(); return; } try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch (e) { if (!vivo()) { clearInterval(id); aposentar(); } } }, ms); return id; };
  // estratégias tiradas por enquanto (deram mais perda na conta real em 24/10): não entram no automático
  const TIRADAS = new Set(['esto_rsi', 'rsi_bb']);
  const RETORNO = 0.85; // retorno médio da Olymp no acerto, usado nas contas do teste
  const EMPATE = (100 / (1 + RETORNO));
  const PADRAO = {
    ligado: false, autoAtivo: false, sempreLeitura: 1, modo: 'todas', estrategia: 'conf', expira: 1, tfManual: 1,
    valor: 10, modoValor: 'percent', percent: 1, chave: '',
    maxPerdasSeguidas: 3, limitePerda: 100, minAcerto: 56, minOps: 40, rigor: 2.5, maxAbertas: 0, metaGanhoDia: 0, limitePerdaDia: 0,
    fecharAlvo: 0, fecharModo: 'auto', fecharManuais: 0, // fechar antes no lucro (0 = nunca); sem stop de perda
  };

  // ---------- ativos ----------
  const FOREX = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'EUR/JPY', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'EUR/GBP', 'GBP/JPY', 'AUD/JPY', 'EUR/CHF'];
  // outras criptos da Olymp (cotação real da Binance, abertas 24 h, inclusive no fim de semana)
  const CRIPTOS = [
    { titulo: 'Litecoin', simbolo: 'LTCUSDT', re: /LITECOIN|LTC/ }, { titulo: 'Ripple', simbolo: 'XRPUSDT', re: /RIPPLE|XRP/ },
    { titulo: 'Solana', simbolo: 'SOLUSDT', re: /SOLANA|SOL\b/ }, { titulo: 'Cardano', simbolo: 'ADAUSDT', re: /CARDANO|ADA\b/ },
    { titulo: 'Dogecoin', simbolo: 'DOGEUSDT', re: /DOGE/ }, { titulo: 'BNB', simbolo: 'BNBUSDT', re: /BNB|BINANCE COIN/ },
    { titulo: 'Polkadot', simbolo: 'DOTUSDT', re: /POLKADOT|DOT\b/ }, { titulo: 'Chainlink', simbolo: 'LINKUSDT', re: /CHAINLINK|LINK\b/ },
    { titulo: 'Avalanche', simbolo: 'AVAXUSDT', re: /AVALANCHE|AVAX/ }, { titulo: 'Tron', simbolo: 'TRXUSDT', re: /TRON|TRX/ },
  ];
  const RANKING_ATIVOS = [
    { titulo: 'EUR/USD', fonte: 'forex', simbolo: 'EUR/USD' }, { titulo: 'GBP/USD', fonte: 'forex', simbolo: 'GBP/USD' },
    { titulo: 'USD/JPY', fonte: 'forex', simbolo: 'USD/JPY' }, { titulo: 'AUD/USD', fonte: 'forex', simbolo: 'AUD/USD' },
    { titulo: 'EUR/JPY', fonte: 'forex', simbolo: 'EUR/JPY' }, { titulo: 'Ouro', fonte: 'forex', simbolo: 'XAU/USD', busca: 'Gold' },
    { titulo: 'Bitcoin', fonte: 'cripto', simbolo: 'BTCUSDT' }, { titulo: 'Ethereum', fonte: 'cripto', simbolo: 'ETHUSDT' },
    ...CRIPTOS.map((c) => ({ titulo: c.titulo, fonte: 'cripto', simbolo: c.simbolo })),
  ];
  function detectarAtivo() {
    const titulo = (q('[data-test="assets-tabs-tab-title"]')?.innerText || '').trim();
    const botao = q('[data-test^="asset-select-button-"][data-test$="/ftt"]');
    const id = botao ? botao.getAttribute('data-test').replace('asset-select-button-', '').replace('/ftt', '') : '';
    const t = titulo.toUpperCase();
    const base = { titulo: titulo || id || '?', id };
    // OTC: o preço é da própria Olymp; o robô monta as velas lendo o preço da tela
    if (/OTC/.test(t) || /OTC/.test(id)) return { ...base, fonte: 'pagina', simbolo: base.titulo };
    for (const par of FOREX) if (t === par || id === par.replace('/', '')) return { ...base, fonte: 'forex', simbolo: par };
    if (/BITCOIN|BTC/.test(t) || /^BTC/.test(id)) return { ...base, fonte: 'cripto', simbolo: 'BTCUSDT' };
    if (/ETHEREUM|ETH/.test(t) || /^ETH/.test(id)) return { ...base, fonte: 'cripto', simbolo: 'ETHUSDT' };
    for (const c of CRIPTOS) if (c.re.test(t) || c.re.test(id.toUpperCase())) return { ...base, fonte: 'cripto', simbolo: c.simbolo };
    if (/GOLD|OURO|XAU/.test(t) || /^XAU/.test(id)) return { ...base, fonte: 'forex', simbolo: 'XAU/USD' };
    if (!titulo) return { ...base, erro: 'Carregando o ativo da Olymp...' };
    // qualquer outro ativo: velas montadas com o preço da tela
    return { ...base, fonte: 'pagina', simbolo: base.titulo };
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
  // sinais de todas as estratégias ao longo do histórico, com o mesmo alerta + confirmação do robô
  // calcula os indicadores uma vez por vela e solta a página de tempos em tempos para não travar a Olymp
  async function sinaisDoHistorico(v, rigor) {
    const pre = {}, out = {};
    for (const e of ESTRATEGIAS) { pre[e.id] = null; out[e.id] = []; }
    for (let i = 40; i < v.length; i++) {
      const w = v.slice(Math.max(0, i - 220), i + 1);
      const I = indicadores(w);
      const k = v[i];
      for (const est of ESTRATEGIAS) {
        const R = est.fn(I, rigor, w) || {};
        let entrou = false;
        const p = pre[est.id];
        if (p) {
          const ok = (R.ready && R.dir === p.dir) || ((p.ready || (R.near && R.dir === p.dir)) && (p.dir === 'up' ? k.c > k.o : k.c < k.o));
          if (ok) { out[est.id].push({ i, dir: p.dir }); entrou = true; }
          pre[est.id] = null;
        }
        if (est.imediato && !entrou && R.ready && R.dir) { out[est.id].push({ i, dir: R.dir }); entrou = true; }
        if (!entrou && R.dir && (R.ready || R.near)) pre[est.id] = { dir: R.dir, ready: !!R.ready };
      }
      if (i % 150 === 0) await espera(0);
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
  async function rankear(porTf) {
    const linhas = [];
    for (const tf of Object.keys(porTf)) {
      const v = porTf[tf];
      if (!v || v.length < 300) continue;
      const corte = Math.floor(v.length * 0.6);
      const todos = await sinaisDoHistorico(v, cfg.rigor);
      for (const est of ESTRATEGIAS) {
        const sinais = todos[est.id];
        const exps = +tf === 1 ? [1, 2, 3, 5] : [1, 2, 3];
        for (const x of exps) {
          const a = medir(v, sinais, x, 0, corte);
          const b = medir(v, sinais, x, corte, v.length);
          const total = medir(v, sinais, x, 0, v.length);
          linhas.push({ tf: +tf, est: est.id, nome: est.nome, exp: x * +tf, a, b, total });
        }
      }
    }
    const aprovadas = linhas.filter((r) => !TIRADAS.has(r.est) && r.a.n >= cfg.minOps * 0.6 && r.b.n >= cfg.minOps * 0.4 && r.a.ac >= cfg.minAcerto && r.b.ac >= cfg.minAcerto);
    aprovadas.sort((x, y) => y.total.lucro - x.total.lucro);
    linhas.sort((x, y) => y.total.lucro - x.total.lucro);
    return { melhor: aprovadas[0] || null, aprovadas, todas: linhas };
  }

  // ---------- estado ----------
  let cfg = { ...PADRAO };
  let motores = {}; // um motor por combinação ativa
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
  let travadas = 0; // botões desligados seguidos: a página da Olymp travou
  let livreAte = 0; // não abre outra operação antes da anterior terminar
  const sessao = { ops: [], perdasSeguidas: 0, resultado: 0, parado: '' };

  // salva e manda para o app (quando a mudança foi feita aqui no PC)
  let aplicandoRemoto = false, ultimoRev = 0, envioCfg = null;
  const salvar = () => {
    chrome.storage.local.set({ cfg });
    if (aplicandoRemoto) return;
    clearTimeout(envioCfg);
    envioCfg = setTimeout(() => { cfg.rev = Math.max(ultimoRev, cfg.rev || 0) + 1; ultimoRev = cfg.rev; chrome.storage.local.set({ cfg }); enviarCfg(); }, 800);
  };
  function status(t, tipo) { statusTxt = t; statusTipo = tipo; }

  // ---------- velas montadas com o preço da tela (OTC e ativos sem cotação externa) ----------
  // o título da aba da Olymp traz o preço ao vivo ("▲ 2366.0750 Ethereum | ..."); a cada segundo vira vela de 1 min
  const MIN_VELAS = 300;
  const colecao = {}; // ativo -> velas de 1 min (guardadas no chrome.storage para juntar histórico entre recargas)
  const chaveHist = (nome) => 'hist:' + nome;
  function precoDaTela() {
    const m = (document.title || '').match(/([\d]+[.,]?[\d]*)/);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    return isFinite(n) && n > 0 ? n : null;
  }
  async function carregarColecao(nome) {
    if (colecao[nome]) return colecao[nome];
    const r = await new Promise((ok) => chrome.storage.local.get(chaveHist(nome), ok));
    colecao[nome] = (r && r[chaveHist(nome)]) || [];
    return colecao[nome];
  }
  let salvoEm = 0;
  function coletar() {
    const a = detectarAtivo();
    if (!a || a.fonte !== 'pagina' || !colecao[a.titulo]) return;
    const p = precoDaTela();
    if (p == null) return;
    const v = colecao[a.titulo];
    const t = Math.floor(Date.now() / MINUTO) * MINUTO;
    const u = v[v.length - 1];
    if (u && u.t === t) { u.h = Math.max(u.h, p); u.l = Math.min(u.l, p); u.c = p; }
    else v.push({ t, o: u && t - u.t === MINUTO ? u.c : p, h: p, l: p, c: p });
    if (v.length > 8000) v.splice(0, v.length - 8000);
    if (Date.now() - salvoEm > 30000) { salvoEm = Date.now(); chrome.storage.local.set({ [chaveHist(a.titulo)]: v }); }
  }
  repetir(coletar, 1000);
  function agregar(v1, tf) {
    if (tf === 1) return v1.slice();
    const out = [];
    for (const k of v1) {
      const t = Math.floor(k.t / (tf * MINUTO)) * tf * MINUTO;
      const u = out[out.length - 1];
      if (u && u.t === t) { u.h = Math.max(u.h, k.h); u.l = Math.min(u.l, k.l); u.c = k.c; }
      else out.push({ t, o: k.o, h: k.h, l: k.l, c: k.c });
    }
    return out;
  }

  async function pedirVelas(alvo, tf, n) {
    if (alvo.fonte === 'pagina') {
      const v1 = await carregarColecao(alvo.titulo);
      return agregar(v1, tf).slice(-n);
    }
    return new Promise((ok, falha) => {
      chrome.runtime.sendMessage({ tipo: 'velas', fonte: alvo.fonte, simbolo: alvo.simbolo, chave: cfg.chave, n, tf }, (r) => {
        if (chrome.runtime.lastError) return falha(new Error(chrome.runtime.lastError.message));
        if (!r || !r.ok) return falha(new Error(r ? r.erro : 'sem resposta'));
        ok(r.velas);
      });
    });
  }

  // combinações que o robô vai operar agora
  // todas: cada estratégia/vela aprovada no teste (a melhor expiração de cada); melhor: só a primeira; manual: a escolhida
  const chaveComb = (c) => `${c.tf}|${c.est}|${c.exp}`;
  function combinacoes() {
    if (cfg.modo === 'manual') {
      const e = ESTRATEGIAS.find((x) => x.id === cfg.estrategia) || ESTRATEGIAS[0];
      return [{ tf: cfg.tfManual, est: e.id, nome: e.nome, exp: cfg.expira, manual: true }];
    }
    if (!rankingAtivo) return [];
    if (cfg.modo === 'melhor') return rankingAtivo.melhor ? [rankingAtivo.melhor] : [];
    const vistos = new Set();
    const lista = [];
    for (const r of rankingAtivo.aprovadas) {
      const k = r.tf + '|' + r.est;
      if (vistos.has(k)) continue;
      vistos.add(k);
      lista.push(r);
    }
    // Leitura (padrão de reversão no suporte/resistência, velas de 1 min, 1 min): sempre ligada, mesmo fora do teste
    if (cfg.sempreLeitura && !vistos.has('1|leitura')) {
      const t = (rankingAtivo.todas || []).find((r) => r.tf === 1 && r.est === 'leitura' && r.exp === 1);
      const vazio = { n: 0, ac: 0, lucro: 0 };
      lista.push({ tf: 1, est: 'leitura', nome: 'Leitura: padrão de reversão no nível', exp: 1, a: t ? t.a : vazio, b: t ? t.b : vazio, total: t ? t.total : vazio, sempre: true });
    }
    return lista;
  }
  const combinacao = () => combinacoes()[0] || null;
  const motorCfg = (c) => ({ rigor: cfg.rigor, expira: c.exp, tf: c.tf * MINUTO, sobrepor: true });

  async function prepararAtivo() {
    ativo = detectarAtivo();
    motores = {};
    escolha = null;
    rankingAtivo = null;
    ultimaBusca = 0;
    if (ativo.erro) { status(ativo.erro, 'erro'); return; }
    if (ativo.fonte === 'forex' && !cfg.chave) { status('Para forex, cole a chave da Twelve Data nos ajustes do painel', 'erro'); return; }
    try {
      status('Testando as combinações de ' + ativo.titulo + ' com velas reais...', 'aviso');
      const porTf = { 1: await pedirVelas(ativo, 1, 5000), 5: await pedirVelas(ativo, 5, 5000) };
      if (ativo.fonte === 'pagina' && porTf[1].length < MIN_VELAS) {
        status(`${ativo.titulo}: juntando velas pela tela (${porTf[1].length} de ${MIN_VELAS} de 1 min). Deixe este ativo aberto.`, 'aviso');
        ativo.juntando = true;
        return;
      }
      rankingAtivo = await rankear(porTf);
      rankingEm = Date.now();
      escolha = rankingAtivo.melhor;
      const lista = combinacoes();
      for (const c of lista) {
        const m = criarMotor();
        carregarHistorico(m, porTf[c.tf].slice(-600), motorCfg(c));
        motores[chaveComb(c)] = m;
      }
      status(lista.length ? `Ao vivo · ${ativo.titulo} · ${lista.length} ${lista.length === 1 ? 'combinação' : 'combinações'}` : `Nenhuma combinação de ${ativo.titulo} passou no teste. Veja o ranking geral.`, lista.length ? 'ok' : 'erro');
    } catch (e) { status('Erro nas cotações: ' + e.message, 'erro'); chaveAtivo = ''; }
  }

  async function ciclo() {
    const novo = detectarAtivo();
    const chave = [novo.titulo, cfg.chave, cfg.modo, cfg.estrategia, cfg.tfManual, cfg.expira, cfg.rigor, cfg.minAcerto, cfg.minOps].join('|');
    if (chave !== chaveAtivo) { chaveAtivo = chave; await prepararAtivo(); return; }
    // ativo da tela ainda juntando velas: reavalia quando tiver o mínimo
    if (ativo && ativo.juntando) {
      const n = (colecao[ativo.titulo] || []).length;
      if (n >= MIN_VELAS) chaveAtivo = '';
      else status(`${ativo.titulo}: juntando velas pela tela (${n} de ${MIN_VELAS} de 1 min). Deixe este ativo aberto.`, 'aviso');
      return;
    }
    const lista = combinacoes();
    if (!ativo || ativo.erro || !lista.length || buscando) return;
    // refaz o teste a cada hora
    if (cfg.modo !== 'manual' && Date.now() - rankingEm > 60 * MINUTO) { chaveAtivo = ''; return; }
    const agora = Date.now();
    // forex: uma busca por minuto (limite do plano grátis); cripto: a cada 2 s
    const devido = ativo.fonte === 'cripto' || ativo.fonte === 'pagina'
      ? agora - ultimaBusca >= 2000
      : Math.floor((agora - 3000) / MINUTO) > Math.floor((ultimaBusca - 3000) / MINUTO);
    if (!devido) return;
    buscando = true;
    ultimaBusca = agora;
    try {
      const tfs = [...new Set(lista.map((c) => c.tf))];
      for (const tf of tfs) {
        // forex com velas de 5 min: só busca quando uma vela de 5 min fecha
        if (ativo.fonte === 'forex' && tf === 5 && Math.floor((agora - 3000) / (5 * MINUTO)) === Math.floor((agora - 3000 - MINUTO) / (5 * MINUTO))) continue;
        const v = await pedirVelas(ativo, tf, 3);
        for (const c of lista.filter((x) => x.tf === tf)) {
          const m = motores[chaveComb(c)];
          if (!m) continue;
          v.forEach((k, i) => atualizar(m, k, i < v.length - 1, motorCfg(c), (id, tipo) => aoAvisar(c, m, id, tipo)));
        }
      }
      status(`Ao vivo · ${ativo.titulo} · ${lista.length} ${lista.length === 1 ? 'combinação' : 'combinações'}`, 'ok');
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
        const v1 = await pedirVelas(alvo, 1, 5000);
        // mercado fechado (forex no fim de semana): a última vela é antiga
        if (!v1.length || Date.now() - v1[v1.length - 1].t > 15 * MINUTO) { rankingGeral.push({ titulo: alvo.titulo, alvo, erro: 'mercado fechado' }); continue; }
        const r = await rankear({ 1: v1, 5: await pedirVelas(alvo, 5, 5000) });
        rankingGeral.push({ titulo: alvo.titulo, alvo, melhor: r.melhor });
      } catch (e) { rankingGeral.push({ titulo: alvo.titulo, alvo, erro: e.message }); }
    }
    // OTC e outros ativos que já juntaram velas suficientes pela tela
    const tudo = await new Promise((ok) => chrome.storage.local.get(null, ok));
    for (const k of Object.keys(tudo || {})) {
      if (!k.startsWith('hist:')) continue;
      const nome = k.slice(5);
      const v1 = tudo[k];
      if (!Array.isArray(v1) || v1.length < MIN_VELAS) continue;
      const alvo = { titulo: nome, fonte: 'pagina', simbolo: nome, busca: nome };
      colecao[nome] = colecao[nome] || v1;
      const r = await rankear({ 1: v1, 5: agregar(v1, 5) });
      rankingGeral.push({ titulo: nome, alvo, melhor: r.melhor });
    }
    rankingGeral.sort((x, y) => (y.melhor ? y.melhor.total.lucro : -1e9) - (x.melhor ? x.melhor.total.lucro : -1e9));
    rodandoGeral = false;
    status('Ranking geral pronto', 'ok');
    desenhar(true);
  }

  // ---------- escolher o ativo sozinho ----------
  // testa todos os ativos, pega o melhor que nenhuma outra janela esteja usando e troca o ativo na Olymp
  let ultimaEscolha = 0, ultimaEntrada = 0, proximaBusca = 0;
  let trocando = false;
  const abertasNestaJanela = () => Object.values(contaGlobal.abertas || {}).filter((a) => a.aba === ABA && a.ate > Date.now()).length;
  async function marcarAtivo(nome) {
    const r = await new Promise((ok) => chrome.storage.local.get('ativosJanelas', ok));
    const m = (r && r.ativosJanelas) || {};
    for (const k of Object.keys(m)) if (m[k].ate < Date.now() || m[k].aba === ABA) delete m[k];
    m[nome] = { aba: ABA, ate: Date.now() + 2 * 60 * MINUTO };
    await new Promise((ok) => chrome.storage.local.set({ ativosJanelas: m }, ok));
  }
  async function ativosDeOutrasJanelas() {
    const r = await new Promise((ok) => chrome.storage.local.get('ativosJanelas', ok));
    const m = (r && r.ativosJanelas) || {};
    return Object.keys(m).filter((k) => m[k].aba !== ABA && m[k].ate > Date.now());
  }
  async function trocarAtivoNaOlymp(nome) {
    const add = q('[data-test="assets-tabs-add-button"]');
    if (!add) throw new Error('não achei o botão de ativos');
    painel.style.visibility = 'hidden';
    try {
      add.click();
      await espera(1500);
      const inp = [...document.querySelectorAll('input')].find((i) => /buscar|search/i.test(i.placeholder || ''));
      if (!inp) throw new Error('não achei a busca de ativos');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(inp, nome);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await espera(1500);
      const item = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && (e.textContent || '').trim() === nome && e.offsetParent);
      if (!item) { add.click(); throw new Error('a Olymp não tem ' + nome + ' agora'); }
      item.click();
      await espera(2500);
    } finally { painel.style.visibility = 'visible'; }
  }
  async function escolherAtivo() {
    if (trocando || !cfg.autoAtivo || abertasNestaJanela() > 0) return;
    trocando = true;
    try {
      ultimaEscolha = Date.now();
      await rodarRankingGeral();
      const ocupados = await ativosDeOutrasJanelas();
      const nota = (r) => (r.melhor ? r.melhor.b.ac + r.melhor.a.ac : -1);
      const candidatos = (rankingGeral || []).filter((r) => r.melhor && !ocupados.includes(r.titulo)).sort((x, y) => nota(y) - nota(x));
      if (!candidatos.length) { status('Escolha automática: nenhum ativo livre com combinação aprovada agora', 'aviso'); return; }
      const atual = detectarAtivo();
      for (const c of candidatos) {
        const nomeOlymp = c.alvo.busca || c.titulo;
        if (atual.titulo === nomeOlymp || atual.titulo === c.titulo) { await marcarAtivo(atual.titulo); status('Escolha automática: ' + atual.titulo + ' continua sendo o melhor', 'ok'); return; }
        try {
          status('Escolha automática: trocando para ' + nomeOlymp + '...', 'aviso');
          await trocarAtivoNaOlymp(nomeOlymp);
          await marcarAtivo(nomeOlymp);
          chaveAtivo = '';
          return;
        } catch (e) { /* tenta o próximo da lista */ }
      }
      status('Escolha automática: não consegui abrir nenhum dos melhores ativos', 'erro');
    } finally { trocando = false; }
  }

  // ---------- operar ----------
  function aoAvisar(c, m, id, tipo) {
    if (id !== c.est || tipo !== 'sinal') return;
    const op = m.S[id].ops[m.S[id].ops.length - 1];
    if (op && op.res === 'aberta') operar(op, c);
  }

  function valorDaEntrada() {
    if (cfg.modoValor !== 'percent') return cfg.valor;
    const s = saldo();
    if (!isFinite(s)) return cfg.valor;
    return Math.max(1, Math.floor((s * cfg.percent) / 100));
  }

  // ---------- controle único entre janelas (mesma conta) ----------
  // guardado no chrome.storage: operações abertas de todas as janelas e o placar da conta
  const ABA = Math.random().toString(36).slice(2);
  let contaGlobal = { abertas: {}, resultado: 0, perdasSeguidas: 0, ganhos: 0, perdas: 0, parado: '' };
  const lerConta = () => new Promise((ok) => chrome.storage.local.get('conta', (r) => ok({ ...contaGlobal, ...(r.conta || {}) })));
  const gravarConta = (cg) => new Promise((ok) => { contaGlobal = cg; chrome.storage.local.set({ conta: cg }, ok); });
  lerConta().then((cg) => { contaGlobal = cg; });
  if (chrome.storage.onChanged) chrome.storage.onChanged.addListener((mud) => { if (mud.conta) { contaGlobal = { ...contaGlobal, ...mud.conta.newValue }; desenhar(); } });
  function limparVencidas(cg) {
    const agora = Date.now();
    for (const k of Object.keys(cg.abertas || {})) if (cg.abertas[k].ate < agora) delete cg.abertas[k];
    return cg;
  }
  // tenta reservar uma vaga para operar; devolve o motivo se não puder
  async function reservar(id, dir, ate, est) {
    await espera(Math.floor(Math.random() * 400)); // evita duas janelas reservarem no mesmo instante
    const cg = limparVencidas(await lerConta());
    if (cg.parado) return 'robô parado na conta: ' + cg.parado;
    const abertas = Object.values(cg.abertas);
    if (cfg.maxAbertas > 0 && abertas.length >= cfg.maxAbertas) return `já há ${abertas.length} operações abertas na conta`;
    // não repete a mesma aposta: a mesma estratégia no mesmo ativo e direção só entra de novo quando a anterior terminar,
    // e no mesmo ativo e direção entra no máximo uma ordem por minuto (duas estratégias concordando não viram duas ordens)
    const mesma = abertas.filter((a) => a.ativo === ativo.titulo && a.dir === dir);
    if (mesma.some((a) => a.est === est)) return 'já tem uma ordem aberta desta estratégia nesta direção';
    if (mesma.some((a) => a.desde && Date.now() - a.desde < 60000)) return 'já entrou neste ativo e direção há menos de 1 minuto';
    if (cfg.maxAbertas > 0 && ativo.fonte === 'cripto' && abertas.some((a) => a.cripto && a.dir === dir && a.ativo !== ativo.titulo)) return 'já há cripto aberta na mesma direção';
    cg.abertas = { ...cg.abertas, [id]: { ativo: ativo.titulo, cripto: ativo.fonte === 'cripto', dir, ate, aba: ABA, est, desde: Date.now() } };
    await gravarConta(cg);
    return null;
  }
  async function liberar(id) {
    const cg = await lerConta();
    if (cg.abertas && cg.abertas[id]) { delete cg.abertas[id]; await gravarConta(cg); }
  }
  // retorno do ativo na Olymp (ex.: "80%"), usado para calcular o resultado sem misturar as janelas
  const retornoAtivo = () => { const n = parseFloat((q('[data-test="asset-select-button-title-value"]')?.innerText || '').replace(',', '.')); return isFinite(n) ? n / 100 : RETORNO; };

  async function operar(sinal, c) {
    const base = { hora: sinal.t, dir: sinal.dir, estrategia: c.nome, ativo: ativo ? ativo.titulo : '' };
    if (!cfg.ligado) { registrar({ ...base, situacao: 'só sinal (robô desligado)' }); return; }
    // várias operações podem ficar abertas; só espera a anterior terminar de ser digitada na Olymp
    for (let i = 0; i < 40 && operando; i++) await espera(500);
    if (operando) { registrar({ ...base, situacao: 'pulou: a Olymp não liberou a tela a tempo' }); return; }
    operando = true;
    const id = ABA + '-' + sinal.t + '-' + c.est;
    const motivo = await reservar(id, sinal.dir, Date.now() + c.exp * MINUTO + 15000, c.est);
    if (motivo) { operando = false; registrar({ ...base, situacao: 'pulou: ' + motivo }); return; }
    const valor = valorDaEntrada();
    const reg = registrar({ ...base, valor, conta: conta(), situacao: 'entrando...', id, sinal, retorno: retornoAtivo() });
    try {
      await ajustarValor(valor);
      await ajustarDuracao(c.exp);
      const antes = saldo();
      // a Olymp às vezes desliga os botões por alguns segundos (gráfico carregando): espera até 15 s
      let botao = null;
      for (let i = 0; i < 30; i++) {
        botao = q(`[data-test="deal-submit-button-${sinal.dir === 'up' ? 'up' : 'down'}"]`);
        if (botao && !botao.disabled) break;
        await espera(500);
      }
      if (!botao || botao.disabled) { travadas++; throw new Error('o botão de operar não está disponível'); }
      travadas = 0;
      botao.click();
      reg.situacao = 'em andamento';
      ultimaEntrada = Date.now();
      enviarOrdem(reg);
      reg.saldoAntes = antes;
      setTimeout(() => conferir(reg), c.exp * MINUTO + 8000);
      guardarPendente({ id, hora: reg.hora, dir: sinal.dir, valor, retorno: reg.retorno, conta: reg.conta, estrategia: c.nome, entrada: sinal.entrada, fim: Date.now() + c.exp * MINUTO, ativo: { titulo: ativo.titulo, fonte: ativo.fonte, simbolo: ativo.simbolo } });
    } catch (e) {
      liberar(id);
      reg.situacao = 'falhou: ' + e.message;
      if (travadas >= 3) { reg.situacao += ' · recarregando a página'; setTimeout(() => location.reload(), 3000); }
    }
    operando = false;
    desenhar();
  }

  // ---------- fechar antes no lucro (só lucro; perda vai até o fim) ----------
  // lê os botões "Fechar antes +US$x" da lista de negociações da Olymp
  function lerValor(txt) {
    const t = txt.replace(/fechar antes|close early|fechar|close/gi, '').replace(/\s+/g, '');
    const m = t.match(/([+\-−–]?)[^\d+\-−–]{0,4}([+\-−–]?)(\d[\d.,]*)/);
    if (!m) return null;
    let n = m[3];
    if (n.includes(',') && n.includes('.')) n = n.lastIndexOf(',') > n.lastIndexOf('.') ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '');
    else n = n.replace(',', '.');
    const v = parseFloat(n);
    if (!isFinite(v)) return null;
    return /[\-−–]/.test(m[1] + m[2]) ? -v : v;
  }
  let fechando = false, ultimaAbertura = 0, fecharInfo = '', rodizio = 0;
  const visivel = (el) => el && el.offsetParent && !el.closest('#rs-painel');
  const acharBotoesFechar = () => [...document.querySelectorAll('button, [role="button"]')].filter((b) => /fechar antes|close early/i.test(b.innerText || '') && visivel(b) && !b.disabled);
  // cartões das ordens abertas na lista (fechados): pequenos, com um cronômetro (00:45) e valor (Đ 1,00 / US$1)
  function acharCards() {
    const lista = [];
    // ordem já aberta (com o botão aparecendo) não entra, senão o clique fecharia ela
    const abertas = acharBotoesFechar().map((b) => { let el = b; for (let i = 0; i < 8 && el; i++, el = el.parentElement) if (/\b\d{1,2}:\d{2}\b/.test(el.innerText || "") && /\d\s*%/.test(el.innerText || "")) return el; return null; }).filter(Boolean);
    for (const el of document.querySelectorAll('div, li, a, button, [data-test]')) {
      if (!visivel(el) || abertas.some((a) => a.contains(el))) continue;
      const t = el.innerText || '';
      if (t.length < 6 || t.length > 160 || /fechar antes|close early/i.test(t)) continue;
      if ((t.match(/\b\d{1,2}:\d{2}\b/g) || []).length !== 1 || !/(US\$|R\$|\$|€|Đ|₫)\s*\d/.test(t)) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 420 || r.height > 180 || r.width < 60) continue;
      lista.push({ el, top: r.top });
    }
    // fica com o menor elemento de cada ordem: o clique nele sobe até o cartão (clicar na lista inteira não abre nada)
    const max = lista.filter((x) => !lista.some((y) => y !== x && x.el.contains(y.el)));
    return max.sort((x, y) => x.top - y.top).map((x) => x.el);
  }
  const acharCardOrdem = () => acharCards()[0] || null;
  // lista de Negociações aberta? (título "Negociações Abertas")
  const listaAberta = () => [...document.querySelectorAll('h1, h2, h3, h4, div, span, p')].some((e) => {
    if (!visivel(e)) return false;
    const t = (e.innerText || '').trim();
    if (/^(negociações abertas|negociacoes abertas|open trades)$/i.test(t)) return true;
    // título grande "Negociações" do painel (o nome na barra lateral é pequeno)
    return /^(negociações|negociacoes|trades)$/i.test(t) && parseFloat(getComputedStyle(e).fontSize) >= 20;
  });
  // botão "Negociações" da barra lateral (vem com o número de ordens antes, ex.: "7 Negociações")
  function botaoNegociacoes() {
    const cands = [...document.querySelectorAll('a, button, [role="button"], [data-test], div, span')].filter((b) => {
      if (!visivel(b)) return false;
      const t = (b.innerText || b.getAttribute('aria-label') || b.title || '').trim();
      if (t.length > 30) return false;
      const r = b.getBoundingClientRect();
      return r.left < 200 && /(^|\n|\s)(negociações|negociacoes|trades)$/i.test(t);
    });
    // o maior deles (o item inteiro da barra, com ícone e número)
    return cands.sort((x, y) => (y.getBoundingClientRect().width * y.getBoundingClientRect().height) - (x.getBoundingClientRect().width * x.getBoundingClientRect().height))[0] || null;
  }
  async function abrirPainelDaOrdem() {
    let card = acharCardOrdem();
    if (!card && !listaAberta()) {
      const bt = botaoNegociacoes();
      if (bt) { bt.click(); await espera(1200); card = acharCardOrdem(); }
    }
    if (card) { card.click(); await espera(900); }
  }
  // lucro cheio da ordem pelo próprio cartão da Olymp ("Valor Đ 1,00" e "· 85%")
  function lucroCheio(b) {
    let el = b;
    for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
      const t = el.innerText || '';
      const v = t.match(/Valor[^\d\n]{0,6}\n?[^\d\n]{0,6}(\d[\d.,]*)/i), r = t.match(/(\d{1,3})\s*%/);
      if (v && r) { const n = lerValor(v[1]); if (n > 0) return n * (+r[1]) / 100; }
    }
    return valorDaEntrada() * retornoAtivo();
  }
  // fechar antes automático: com o histórico das ordens do robô, vê o que teria dado mais lucro
  // (fechar ao chegar em 30/50/70/90% do lucro cheio, ou deixar ir até o fim) e usa o melhor
  let amostras = [];
  chrome.storage.local.get('amostrasFechar', (r) => { amostras = r.amostrasFechar || []; });
  if (chrome.storage.onChanged) chrome.storage.onChanged.addListener((m) => { if (m.amostrasFechar) amostras = m.amostrasFechar.newValue || []; });
  const MIN_AMOSTRAS = 20;
  function decisaoAuto() {
    const a = amostras.slice(-100);
    if (a.length < MIN_AMOSTRAS) return { frac: null, info: `automático: aprendendo (${a.length} de ${MIN_AMOSTRAS} operações) · por enquanto deixa ir até o fim` };
    const nunca = a.reduce((t, x) => t + x.f, 0);
    let melhor = { frac: null, pnl: nunca };
    for (const T of [0.3, 0.5, 0.7, 0.9]) {
      const pnl = a.reduce((t, x) => t + (x.m >= T ? T * x.r : x.f), 0);
      if (pnl > melhor.pnl + 1e-9) melhor = { frac: T, pnl };
    }
    const por = (n) => (n >= 0 ? '+' : '') + n.toFixed(2);
    return melhor.frac == null
      ? { frac: null, info: `automático: deixar ir até o fim está rendendo mais (${por(nunca)} por US$1 nas últimas ${a.length})` }
      : { frac: melhor.frac, info: `automático: fecha em ${Math.round(melhor.frac * 100)}% do lucro (${por(melhor.pnl)} contra ${por(nunca)} deixando ir até o fim, nas últimas ${a.length})` };
  }
  async function guardarAmostra(x) {
    const atual = await new Promise((ok) => chrome.storage.local.get('amostrasFechar', (r) => ok(r.amostrasFechar || [])));
    atual.push(x); if (atual.length > 300) atual.splice(0, atual.length - 300);
    amostras = atual;
    await new Promise((ok) => chrome.storage.local.set({ amostrasFechar: atual }, ok));
  }
  // pico do valor do "Fechar antes" de cada ordem (pelo Trade ID do cartão)
  const picos = new Map();
  function idDaOrdem(b) {
    let el = b;
    for (let i = 0; i < 8 && el; i++, el = el.parentElement) { const m = (el.innerText || '').match(/trade id\s*(\d{5,})/i); if (m) return m[1]; }
    return 'sem-id';
  }
  async function vigiarFechamento() {
    const auto = cfg.fecharModo === 'auto';
    if (fechando || (!auto && !(cfg.fecharAlvo > 0)) || (!cfg.ligado && !cfg.fecharManuais)) return;
    const minhas = cfg.ligado ? sessao.ops.filter((r) => r.situacao === 'em andamento' && r.fechouAntes == null) : [];
    if (!minhas.length && !cfg.fecharManuais) { fecharInfo = 'esperando uma ordem abrir'; return; }
    let botoes = acharBotoesFechar();
    // a Olymp só mostra o "Fechar antes" depois de clicar na ordem: clica nas ordens da lista, revezando
    if (!operando && Date.now() - ultimaAbertura > 4000) {
      const cards = acharCards();
      if (cards.length) {
        ultimaAbertura = Date.now();
        cards[rodizio++ % cards.length].click();
        await espera(700);
        botoes = acharBotoesFechar();
      } else if (!botoes.length && (minhas.length || cfg.fecharManuais)) {
        ultimaAbertura = Date.now();
        await abrirPainelDaOrdem(); // abre a lista de Negociações e clica na ordem
        botoes = acharBotoesFechar();
      }
    }
    if (!botoes.length) {
      fecharInfo = minhas.length ? 'não achei o botão "Fechar antes" (deixe a lista de Negociações aberta)' : 'para as ordens manuais, deixe a lista de Negociações aberta';
      return;
    }
    const dec = auto ? decisaoAuto() : null;
    fecharInfo = auto ? dec.info : 'vigiando a ordem aberta';
    for (const b of botoes) {
      let v = lerValor(b.innerText || '');
      if (v == null && b.parentElement) v = lerValor((b.parentElement.innerText || '').split(/fechar antes|close early/i).pop());
      if (v == null) continue;
      const cheio = lucroCheio(b);
      // aprende: maior valor que o "Fechar antes" chegou nesta ordem (só dá para saber qual é com uma ordem do robô aberta)
      if (minhas.length === 1 && cheio > 0) minhas[0].maxFrac = Math.max(minhas[0].maxFrac || -9, v / cheio);
      // proteger o lucro: a ordem chegou num lucro bom e está voltando (caiu para a metade do pico) -> fecha antes que vire
      let proteger = false;
      if (auto) {
        const id = idDaOrdem(b);
        const pk = Math.max(picos.get(id) || 0, v);
        picos.set(id, pk); if (picos.size > 60) picos.clear();
        proteger = v > 0 && cheio > 0 && pk >= 0.25 * cheio && v <= 0.5 * pk;
      }
      if (v <= 0) continue;
      let alvo;
      if (auto) alvo = proteger ? v : dec.frac == null ? Infinity : cheio * dec.frac;
      else alvo = cfg.fecharModo === 'valor' ? cfg.fecharAlvo : cheio * cfg.fecharAlvo / 100;
      if (v + 1e-9 < alvo) continue;
      fechando = true;
      try {
        b.click();
        await espera(700);
        // se a Olymp pedir confirmação, confirma
        const conf = [...document.querySelectorAll('[role="dialog"] button, [class*="modal"] button, [class*="Modal"] button, [class*="popup"] button')]
          .find((x) => x !== b && x.offsetParent && /^(fechar|confirmar|sim|ok|close|confirm|yes)/i.test((x.innerText || '').trim()));
        if (conf) { conf.click(); await espera(500); }
        await espera(2500); // dá tempo do cartão sumir, para não contar duas vezes
        const reg = minhas.pop();
        if (reg) { liberar(reg.id); if (cheio > 0) reg.maxFrac = Math.max(reg.maxFrac || -9, v / cheio); reg.fechouAntes = Math.round(v * 100) / 100; reg.situacao = `fechou antes (+${v.toFixed(2)})`; reg.resultado = reg.fechouAntes; enviarOrdem(reg); }
        else enviarOrdem(registrar({ hora: Date.now(), dir: '', estrategia: 'ordem manual', situacao: 'fechou antes (manual)', resultado: Math.round(v * 100) / 100, conta: conta() }));
        status(proteger ? `Protegeu o lucro (a ordem estava voltando): +${v.toFixed(2)}` : `Fechou antes no lucro: +${v.toFixed(2)}`, 'ok');
      } finally { fechando = false; }
    }
  }
  repetir(() => vigiarFechamento(), 700);

  // resultado pela cotação (não pelo saldo, que mistura as operações das outras janelas)
  // como a operação terminaria se fosse até o fim (pela cotação)
  function resultadoNoFim(reg) {
    const s = reg.sinal;
    let res = s.res;
    if (res !== 'acerto' && res !== 'erro') {
      const m = Object.values(motores).find((x) => x.velas.length);
      const ult = m ? m.velas[m.velas.length - 1].c : null;
      res = ult == null || ult === s.entrada ? null : (s.dir === 'up' ? ult > s.entrada : ult < s.entrada) ? 'acerto' : 'erro';
    }
    return res === 'acerto' ? Math.round(reg.valor * reg.retorno * 100) / 100 : res === 'erro' ? -reg.valor : null;
  }
  // placar "fechar antes x deixar ir até o fim", somado entre as janelas
  let fecharStats = { n: 0, fechando: 0, deixando: 0, viraram: 0 };
  chrome.storage.local.get('fecharStats', (r) => { if (r.fecharStats) fecharStats = r.fecharStats; });
  if (chrome.storage.onChanged) chrome.storage.onChanged.addListener((m) => { if (m.fecharStats) fecharStats = m.fecharStats.newValue || fecharStats; });
  async function anotarComparacao(reg) {
    const fim = resultadoNoFim(reg);
    reg.seFosseAteOFim = fim;
    const atual = await new Promise((ok) => chrome.storage.local.get('fecharStats', (r) => ok(r.fecharStats || { n: 0, fechando: 0, deixando: 0, viraram: 0 })));
    atual.n++; atual.fechando += reg.fechouAntes; atual.deixando += fim || 0; if (fim != null && fim < 0) atual.viraram++;
    fecharStats = atual;
    await new Promise((ok) => chrome.storage.local.set({ fecharStats: atual }, ok));
  }

  // ---------- ordens em andamento guardadas (se a página recarregar, o resultado é conferido depois) ----------
  // cada ordem fica numa chave própria (pend_<id>): várias ordens abertas no mesmo segundo, ou em janelas
  // diferentes, não apagam mais umas às outras (antes era um objeto só e a última gravação engolia as outras)
  const PEND = 'pend_';
  const lerPendentes = () => new Promise((ok) => chrome.storage.local.get(null, (r) => {
    const m = {};
    for (const [k, v] of Object.entries(r || {})) if (k.startsWith(PEND) && v) m[v.id] = v;
    ok(m);
  }));
  // passa as ordens do formato antigo (um objeto só) para uma chave cada
  chrome.storage.local.get('pendentes', (r) => {
    const velho = (r && r.pendentes) || {};
    const novo = {};
    for (const v of Object.values(velho)) if (v && v.id) novo[PEND + v.id] = v;
    if (r && r.pendentes) chrome.storage.local.set(novo, () => chrome.storage.local.remove('pendentes'));
  });
  function guardarPendente(p) { chrome.storage.local.set({ [PEND + p.id]: p }); }
  function tirarPendente(id) { chrome.storage.local.remove(PEND + id); }
  async function conferirOrfas() {
    const m = await lerPendentes();
    const minhas = new Set(sessao.ops.filter((r) => r.situacao === 'em andamento').map((r) => r.id));
    const vencidas = Object.values(m).filter((p) => p.fim + 30000 < Date.now() && !minhas.has(p.id));
    if (!vencidas.length) return;
    // tira da lista antes de conferir, para outra janela não conferir a mesma
    await new Promise((ok) => chrome.storage.local.remove(vencidas.map((p) => PEND + p.id), ok));
    for (const p of vencidas) {
      let resultado = null, situacao = 'sem resultado (a página recarregou)';
      try {
        const v = await pedirVelas(p.ativo, 1, 1000);
        const k = v.find((x) => x.t <= p.fim && p.fim < x.t + MINUTO);
        if (k && p.entrada != null && k.c !== p.entrada) {
          const ganhou = p.dir === 'up' ? k.c > p.entrada : k.c < p.entrada;
          resultado = ganhou ? Math.round(p.valor * p.retorno * 100) / 100 : -p.valor;
          situacao = ganhou ? 'ganhou' : 'perdeu';
        } else if (k) situacao = 'empate';
      } catch (e) { /* sem velas: fica sem resultado */ }
      await liberar(p.id);
      if (resultado != null) {
        const cg = await lerConta();
        cg.resultado = (cg.resultado || 0) + resultado;
        if (resultado > 0) cg.ganhos = (cg.ganhos || 0) + 1; else cg.perdas = (cg.perdas || 0) + 1;
        somarNoDia(cg, resultado);
        await gravarConta(cg);
        if (cg.parado) parar(cg.parado);
      }
      enviarOrdem({ id: p.id, hora: p.hora, conta: p.conta, ativo: p.ativo.titulo, estrategia: p.estrategia, dir: p.dir, valor: p.valor, resultado, situacao });
    }
    desenhar();
  }
  setTimeout(() => { conferirOrfas().catch(() => {}); }, 20000);
  repetir(() => conferirOrfas(), 120000);

  // ---------- controle pelo app do celular ----------
  // o que o app pode mudar
  const CHAVES_APP = ['ligado', 'autoAtivo', 'sempreLeitura', 'modo', 'modoValor', 'valor', 'percent', 'maxPerdasSeguidas', 'limitePerda',
    'metaGanhoDia', 'limitePerdaDia', 'maxAbertas', 'minAcerto', 'minOps', 'fecharModo', 'fecharAlvo', 'fecharManuais', 'expira', 'estrategia', 'tfManual'];
  const msg = (m) => new Promise((ok) => { try { if (!vivo()) return ok(null); chrome.runtime.sendMessage(m, (r) => { void chrome.runtime.lastError; ok(r || null); }); } catch (e) { ok(null); } });
  function cfgParaApp() { const o = {}; for (const k of CHAVES_APP) o[k] = cfg[k]; return o; }
  function enviarCfg() { msg({ tipo: 'controle-cfg', cfg: cfgParaApp(), rev: cfg.rev || 0 }); }
  async function sincronizarApp() {
    const r = await msg({ tipo: 'controle-ler' });
    if (!r || !r.ok) return;
    const c = r.c;
    if (!c) { cfg.rev = Math.max(cfg.rev || 0, 1); ultimoRev = cfg.rev; chrome.storage.local.set({ cfg }); enviarCfg(); return; }
    ultimoRev = Math.max(ultimoRev, c.rev || 0);
    if ((c.rev || 0) > (cfg.rev || 0) && c.origem !== 'pc' && c.cfg) {
      const ligou = c.cfg.ligado && !cfg.ligado;
      aplicandoRemoto = true;
      try {
        for (const k of CHAVES_APP) if (k in c.cfg) cfg[k] = c.cfg[k];
        cfg.rev = c.rev;
        if (ligou) { sessao.parado = ''; sessao.perdasSeguidas = 0; const cg = await lerConta(); if (cg.parado) { cg.parado = ''; cg.perdasSeguidas = 0; await gravarConta(cg); } }
        salvar();
      } finally { aplicandoRemoto = false; }
      status('Ajustes mudados pelo app do celular', 'ok');
      desenhar(true);
    } else if ((c.rev || 0) < (cfg.rev || 0)) enviarCfg();
  }
  // ---------- escuta dos dados da própria Olymp (olymp-escuta.js) ----------
  // guarda uma amostra de cada tipo de mensagem para estudar o formato do gráfico da Olymp
  const escuta = {};
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || !d.__rsEscuta) return;
    let caminho = d.url; try { const u = new URL(d.url, location.href); caminho = u.host + u.pathname; } catch (e) { /* fica a url */ }
    const forma = d.txt.slice(0, 60).replace(/[0-9]+(\.[0-9]+)?/g, '#');
    const k = d.tipo + ' ' + caminho + ' ' + forma;
    if (escuta[k]) { escuta[k].n++; escuta[k].ult = d.txt.slice(0, 700); return; }
    if (Object.keys(escuta).length >= 40) return;
    escuta[k] = { tipo: d.tipo, url: caminho, n: 1, tam: d.tam, ex: d.txt.slice(0, 700) };
  });
  function enviarEstado() {
    const rd = contaGlobal.dia === hojeTxt() ? (contaGlobal.resultadoDia || 0) : 0;
    const ct = String(conta() || '');
    msg({ tipo: 'controle-estado', aba: ABA, estado: {
      versao: (() => { try { return chrome.runtime.getManifest().version; } catch (e) { return ''; } })(), ligado: !!cfg.ligado, ativo: ativo ? ativo.titulo : '', status: statusTxt,
      conta: /demo/i.test(ct) ? 'demo' : 'real', hoje: Math.round(rd * 100) / 100, parado: contaGlobal.parado || '',
      abertas: sessao.ops.filter((x) => x.situacao === 'em andamento').length, fechar: fecharInfo || '',
      saldo: (q('[data-test="account-balance-value"]')?.innerText || '').trim(),
      escuta: Object.values(escuta),
    } });
  }
  setTimeout(() => { sincronizarApp(); enviarEstado(); }, 5000);
  repetir(() => sincronizarApp(), 15000);
  repetir(() => enviarEstado(), 30000);

  // ---------- limites do dia (meta de ganho e limite de perda; zeram à meia-noite) ----------
  const hojeTxt = () => { const d = new Date(); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; };
  const PARADA_DIA = /^(meta do dia|limite de perda do dia)/;
  function somarNoDia(cg, valor) {
    if (cg.dia !== hojeTxt()) { cg.dia = hojeTxt(); cg.resultadoDia = 0; }
    cg.resultadoDia = (cg.resultadoDia || 0) + valor;
    if (cfg.metaGanhoDia > 0 && cg.resultadoDia >= cfg.metaGanhoDia) cg.parado = `meta do dia batida: +${cg.resultadoDia.toFixed(2)} (volta amanhã)`;
    if (cfg.limitePerdaDia > 0 && -cg.resultadoDia >= cfg.limitePerdaDia) cg.parado = `limite de perda do dia: ${cg.resultadoDia.toFixed(2)} (volta amanhã)`;
  }
  // virou o dia: se parou por meta/limite do dia, volta a operar sozinho
  async function viradaDoDia() {
    const cg = await lerConta();
    if (cg.dia && cg.dia !== hojeTxt()) {
      const eraDoDia = PARADA_DIA.test(cg.parado || '');
      cg.dia = hojeTxt(); cg.resultadoDia = 0;
      if (eraDoDia) { cg.parado = ''; cg.perdasSeguidas = 0; sessao.parado = ''; cfg.ligado = true; salvar(); }
      await gravarConta(cg);
      desenhar(true);
    }
  }
  repetir(() => viradaDoDia(), 60000);

  async function conferir(reg) {
    tirarPendente(reg.id);
    if (reg.fechouAntes != null) {
      await anotarComparacao(reg);
      if (reg.maxFrac != null && reg.seFosseAteOFim != null && reg.valor > 0) guardarAmostra({ m: reg.maxFrac, f: reg.seFosseAteOFim / reg.valor, r: reg.retorno });
      reg.resultado = reg.fechouAntes;
      reg.situacao = reg.seFosseAteOFim == null ? 'fechou antes' : `fechou antes (no fim: ${reg.seFosseAteOFim > 0 ? '+' : ''}${reg.seFosseAteOFim.toFixed(2)})`;
      sessao.resultado += reg.resultado;
      await liberar(reg.id);
      const cg = await lerConta();
      cg.resultado = (cg.resultado || 0) + reg.resultado;
      cg.perdasSeguidas = 0;
      cg.ganhos = (cg.ganhos || 0) + 1;
      somarNoDia(cg, reg.resultado);
      await gravarConta(cg);
      if (cg.parado) parar(cg.parado);
      enviarOrdem(reg);
      desenhar();
      return;
    }
    const s = reg.sinal;
    let res = s.res;
    if (res !== 'acerto' && res !== 'erro') {
      const m = Object.values(motores).find((x) => x.velas.length);
      const ult = m ? m.velas[m.velas.length - 1].c : null;
      res = ult == null || ult === s.entrada ? null : (s.dir === 'up' ? ult > s.entrada : ult < s.entrada) ? 'acerto' : 'erro';
    }
    reg.resultado = res === 'acerto' ? Math.round(reg.valor * reg.retorno * 100) / 100 : res === 'erro' ? -reg.valor : null;
    reg.situacao = reg.resultado == null ? 'empate' : reg.resultado > 0 ? 'ganhou' : 'perdeu';
    if (reg.maxFrac != null && reg.resultado != null && reg.valor > 0) guardarAmostra({ m: reg.maxFrac, f: reg.resultado / reg.valor, r: reg.retorno });
    sessao.resultado += reg.resultado || 0;
    await liberar(reg.id);
    if (reg.resultado != null) {
      const cg = await lerConta();
      cg.resultado = (cg.resultado || 0) + reg.resultado;
      cg.perdasSeguidas = reg.resultado < 0 ? (cg.perdasSeguidas || 0) + 1 : 0;
      if (reg.resultado > 0) cg.ganhos = (cg.ganhos || 0) + 1; else cg.perdas = (cg.perdas || 0) + 1;
      // 0 = sem limite; os limites valem para a conta toda
      if (cfg.maxPerdasSeguidas > 0 && cg.perdasSeguidas >= cfg.maxPerdasSeguidas) cg.parado = `${cg.perdasSeguidas} perdas seguidas`;
      if (cfg.limitePerda > 0 && -cg.resultado >= cfg.limitePerda) cg.parado = `prejuízo da conta chegou a ${(-cg.resultado).toFixed(2)}`;
      somarNoDia(cg, reg.resultado);
      await gravarConta(cg);
      if (cg.parado) parar(cg.parado);
    }
    enviarOrdem(reg);
    desenhar();
  }
  function parar(motivo) { sessao.parado = motivo; cfg.ligado = false; salvar(); }
  // manda a ordem para o app do celular (pelo background, que guarda numa fila se estiver sem internet)
  function enviarOrdem(reg) {
    try {
      if (!vivo()) return;
      const ct = String(reg.conta || conta() || '');
      chrome.runtime.sendMessage({ tipo: 'ordem', linha: {
        id: reg.id || ('manual-' + ABA + '-' + reg.hora), hora: new Date(reg.hora || Date.now()).toISOString(),
        conta: /demo/i.test(ct) ? 'demo' : 'real', ativo: reg.ativo || (ativo ? ativo.titulo : ''), estrategia: reg.estrategia || '',
        dir: reg.dir || '', valor: reg.valor ?? null, resultado: reg.resultado ?? null, situacao: reg.situacao || '',
        fechou_antes: reg.fechouAntes != null || /fechou antes/.test(reg.situacao || ''), se_fosse_ate_o_fim: reg.seFosseAteOFim ?? null,
      } }, () => void chrome.runtime.lastError);
    } catch (e) { /* aba antiga */ }
  }
  function registrar(r) {
    sessao.ops.unshift(r);
    if (sessao.ops.length > 30) sessao.ops.pop();
    desenhar();
    return r;
  }

  // ---------- painel ----------
  let painel, corpo, aberto = false; // sempre começa minimizado
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
#rs-painel.rs-mini{width:auto;border-radius:20px}
#rs-painel.rs-mini .rs-top{border-bottom:0;padding:7px 12px;gap:7px;justify-content:flex-start}
#rs-painel .rs-luz{width:10px;height:10px;border-radius:50%;flex:none}
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
    painel.innerHTML = `<div class="rs-top"><span class="rs-luz" id="rs-luz"></span><b id="rs-tit">Robô de Sinais</b><span class="rs-mono" id="rs-min">+</span></div><div class="rs-c" id="rs-corpo" style="display:none"></div>`;
    painel.classList.add('rs-mini');
    document.body.appendChild(painel);
    corpo = painel.querySelector('#rs-corpo');
    painel.querySelector('.rs-top').addEventListener('click', () => { aberto = !aberto; corpo.style.display = aberto ? 'flex' : 'none'; desenharTopo(); });
    corpo.addEventListener('change', aoMudar);
    corpo.addEventListener('click', aoClicar);
    desenhar(true);
  }

  function aoMudar(e) {
    const k = e.target.dataset.k;
    if (!k) return;
    const v = e.target.value;
    cfg[k] = ['estrategia', 'chave', 'modoValor', 'modo', 'fecharModo'].includes(k) ? v.trim() : parseFloat(String(v).replace(',', '.')) || 0;
    salvar();
    desenhar(true);
  }
  function aoClicar(e) {
    const a = e.target.dataset.a;
    if (a === 'ligar') {
      cfg.ligado = !cfg.ligado;
      if (cfg.ligado) { sessao.parado = ''; sessao.perdasSeguidas = 0; lerConta().then((cg) => { if (cg.parado) { cg.parado = ''; cg.perdasSeguidas = 0; gravarConta(cg); } }); }
      salvar();
      desenhar(true);
    }
    if (a === 'zerar') { fecharStats = { n: 0, fechando: 0, deixando: 0, viraram: 0 }; chrome.storage.local.set({ fecharStats }); sessao.ops.length = 0; sessao.resultado = 0; sessao.perdasSeguidas = 0; sessao.parado = ''; gravarConta({ abertas: {}, resultado: 0, perdasSeguidas: 0, ganhos: 0, perdas: 0, parado: '' }); desenhar(true); }
    if (a === 'geral') rodarRankingGeral();
    // só opera o que passou com folga nas duas partes do teste; troca de ativo sozinho para achar o melhor
    if (a === 'assertivo') { Object.assign(cfg, { minAcerto: 60, minOps: 60, sempreLeitura: 0, modo: 'todas', autoAtivo: 1 }); ultimaEscolha = 0; salvar(); desenhar(true); }
  }

  // minimizado: só a bolinha verde (ligado) ou vermelha (desligado)
  function desenharTopo() {
    if (!painel) return;
    painel.classList.toggle('rs-mini', !aberto);
    const luz = painel.querySelector('#rs-luz'), tit = painel.querySelector('#rs-tit'), min = painel.querySelector('#rs-min');
    luz.style.background = cfg.ligado ? '#2fc59c' : '#f0675b';
    tit.textContent = aberto ? 'Robô de Sinais' : (cfg.ligado ? 'Ligado' : 'Desligado');
    min.textContent = aberto ? '–' : '';
  }
  function desenhar(refazerForm) {
    if (!corpo) return;
    desenharTopo();
    const cor = { ok: '#2fc59c', aviso: '#e5a93a', erro: '#f0675b' }[statusTipo];
    const lista = combinacoes();
    const c = lista[0] || null;
    const agora = Date.now();
    const seg = (t) => Math.max(0, Math.ceil((t - agora) / 1000));
    // o sinal mostrado: uma operação aberta de qualquer combinação; senão o alerta mais próximo
    let aberta = null, pre = null, deQuem = null;
    for (const x of lista) {
      const m = motores[chaveComb(x)];
      const S = m && m.S[x.est];
      if (!S) continue;
      const a = S.ops.find((o) => o.res === 'aberta');
      if (a && !aberta) { aberta = a; deQuem = x; }
      if (S.pre && (!pre || S.pre.ateT < pre.ateT)) { pre = S.pre; if (!aberta) deQuem = x; }
    }
    let sinal;
    if (aberta) sinal = { bg: aberta.dir === 'up' ? '#2fc59c' : '#f0675b', ic: aberta.dir === 'up' ? '▲' : '▼', t: aberta.dir === 'up' ? 'COMPRA' : 'VENDA', s: `${deQuem.nome} · entrada ${hora(aberta.t)} · termina ${hora(aberta.fimT)} (${seg(aberta.fimT)} s)` };
    else if (pre) sinal = { bg: '#e5a93a', ic: '!', t: 'Atenção: possível ' + (pre.dir === 'up' ? 'compra' : 'venda'), s: `${deQuem.nome} · confirma às ${hora(pre.ateT)} (${seg(pre.ateT)} s)` };
    else sinal = { bg: '#253042', ic: '○', t: 'Aguardando', s: c ? 'sem sinal por perto' : 'sem combinação aprovada neste ativo' };
    const ct = conta();
    const real = ct && !/demo/i.test(ct);
    const ganhos = sessao.ops.filter((o) => o.resultado > 0).length;
    const perdas = sessao.ops.filter((o) => o.resultado < 0).length;

    let comb;
    if (!c) comb = `<div class="rs-box">Nenhuma combinação deste ativo passou de ${cfg.minAcerto}% nas duas partes do teste. O robô não vai operar aqui.</div>`;
    else if (c.manual) comb = `<div class="rs-box">Manual: ${esc(descr(c))}</div>`;
    else comb = `<div class="rs-box"><b>${lista.length === 1 ? 'Operando 1 combinação' : `Operando ${lista.length} combinações`}</b> (empate em ${EMPATE.toFixed(0)}%)<br>${lista.map((x) => `${esc(descr(x))}${x.sempre ? ' <b style="color:#e5a93a">(sempre ligada)</b>' : ''}<br><span class="rs-mono" style="color:#8b97a8">teste ${pct(x.a.ac)} (${x.a.n}) · conferência ${pct(x.b.ac)} (${x.b.n})</span>`).join('<br>')}</div>`;

    const geral = rankingGeral ? `<div class="rs-box"><b>Ranking geral</b> (melhor combinação de cada ativo)<br>${rankingGeral.map((r) => `${esc(r.titulo)}: ${r.erro ? 'erro' : r.melhor ? `${esc(descr(r.melhor))} · ${pct(r.melhor.total.ac)} em ${r.melhor.total.n}` : 'nenhuma aprovada'}`).join('<br>')}</div>` : '';

    const topo = `
<div class="rs-st"><span class="rs-dot" style="background:${cor}"></span><span>${esc(statusTxt)}</span></div>
${cfg.autoAtivo && cfg.ligado && proximaBusca > Date.now() && !trocando ? `<div class="rs-st" style="color:#8b97a8">Procurando oportunidades em todos os ativos · próximo teste às ${hora(proximaBusca).slice(0, 5)}</div>` : ''}
${(cfg.fecharAlvo > 0 || cfg.fecharModo === 'auto') && fecharInfo ? `<div class="rs-st" style="color:#8b97a8">Fechar antes: ${esc(fecharInfo)}</div>` : ""}
${real ? `<div class="rs-real">CONTA REAL: as operações usam dinheiro de verdade</div>` : `<div class="rs-l">Conta: ${esc(ct || '?')}</div>`}
${comb}
<div class="rs-sinal"><div class="rs-ic" style="background:${sinal.bg};color:#0e141d;font-weight:800;font-size:20px">${sinal.ic}</div><div><div class="rs-t">${esc(sinal.t)}</div><div class="rs-mono" style="color:#8b97a8;font-size:12px">${esc(sinal.s)}</div></div></div>
<button class="rs-b" data-a="ligar" style="background:${cfg.ligado ? '#f0675b' : '#2fc59c'};color:#0e141d">${cfg.ligado ? 'Desligar robô' : 'Ligar robô (operar)'}</button>
${sessao.parado || contaGlobal.parado ? `<div style="color:#f0675b;font-size:12px">Robô parou: ${esc(sessao.parado || contaGlobal.parado)}</div>` : ''}
${fecharStats.n ? `<div class="rs-box">Fechar antes: <b>${fecharStats.n}</b> operações · fechando antes <b style="color:${fecharStats.fechando >= 0 ? '#2fc59c' : '#f0675b'}">${fecharStats.fechando >= 0 ? '+' : ''}${fecharStats.fechando.toFixed(2)}</b> · se deixasse até o fim <b style="color:${fecharStats.deixando >= 0 ? '#2fc59c' : '#f0675b'}">${fecharStats.deixando >= 0 ? '+' : ''}${fecharStats.deixando.toFixed(2)}</b><br>${fecharStats.viraram} delas teriam virado perda · ${fecharStats.fechando >= fecharStats.deixando ? 'fechar antes está compensando' : 'deixar até o fim estaria rendendo mais'}</div>` : ''}
${(() => { const rd = contaGlobal.dia === hojeTxt() ? (contaGlobal.resultadoDia || 0) : 0; const lim = [cfg.metaGanhoDia > 0 ? 'meta +' + cfg.metaGanhoDia : '', cfg.limitePerdaDia > 0 ? 'limite -' + cfg.limitePerdaDia : ''].filter(Boolean).join(' · '); return `<div class="rs-mono" style="font-size:12px">Hoje (conta toda): <b style="color:${rd >= 0 ? '#2fc59c' : '#f0675b'}">${rd >= 0 ? '+' : ''}${rd.toFixed(2)}</b>${lim ? ` <span style="color:#8b97a8">· ${lim}</span>` : ''}</div>`; })()}
<div class="rs-row rs-mono" style="font-size:12px"><div>Esta janela: <b style="color:${sessao.resultado >= 0 ? '#2fc59c' : '#f0675b'}">${sessao.resultado >= 0 ? '+' : ''}${sessao.resultado.toFixed(2)}</b></div><div>${ganhos} ganhos · ${perdas} perdas</div></div>
<div class="rs-row rs-mono" style="font-size:12px"><div>Conta toda: <b style="color:${(contaGlobal.resultado || 0) >= 0 ? '#2fc59c' : '#f0675b'}">${(contaGlobal.resultado || 0) >= 0 ? '+' : ''}${(contaGlobal.resultado || 0).toFixed(2)}</b></div><div>${contaGlobal.ganhos || 0} g · ${contaGlobal.perdas || 0} p · ${Object.keys(limparVencidas({ abertas: { ...(contaGlobal.abertas || {}) } }).abertas).length} abertas</div></div>
<div class="rs-ops">${sessao.ops.slice(0, 8).map((o) => `<div class="rs-op"><span class="rs-mono">${hora(o.hora)} ${o.dir === 'up' ? '▲ Compra' : o.dir === 'down' ? '▼ Venda' : 'Manual'}</span><span>${esc(o.situacao)}</span><span class="rs-mono" style="color:${o.resultado > 0 ? '#2fc59c' : o.resultado < 0 ? '#f0675b' : '#8b97a8'}">${o.resultado != null ? (o.resultado > 0 ? '+' : '') + o.resultado.toFixed(2) : ''}</span></div>`).join('') || '<span style="color:#8b97a8">Nenhuma operação ainda</span>'}</div>
<button class="rs-b" data-a="geral" style="background:#253042;color:#e7ecf3;font-size:12px;padding:7px">${rodandoGeral ? 'Testando todos os ativos...' : 'Testar todos os ativos (ranking geral)'}</button>
${geral}`;

    const form = `
<div class="rs-l" style="margin-top:4px">Ajustes</div>
<label>Ativo<select data-k="autoAtivo"><option value="0"${!cfg.autoAtivo ? ' selected' : ''}>O que estiver aberto na tela</option><option value="1"${cfg.autoAtivo ? ' selected' : ''}>O robô escolhe o melhor sozinho</option></select></label>
<label>Leitura de vela + suporte/resistência (1 min)<select data-k="sempreLeitura"><option value="1"${cfg.sempreLeitura ? ' selected' : ''}>Sempre operar</option><option value="0"${!cfg.sempreLeitura ? ' selected' : ''}>Só se passar no teste</option></select></label>
<label>Como escolher<select data-k="modo"><option value="todas"${cfg.modo === 'todas' ? ' selected' : ''}>Todas as combinações aprovadas (automático)</option><option value="melhor"${cfg.modo === 'melhor' ? ' selected' : ''}>Só a melhor combinação (automático)</option><option value="manual"${cfg.modo === 'manual' ? ' selected' : ''}>Eu escolho</option></select></label>
${cfg.modo === 'manual' ? `<div class="rs-row">
<label>Estratégia<select data-k="estrategia">${ESTRATEGIAS.map((e) => `<option value="${e.id}"${cfg.estrategia === e.id ? ' selected' : ''}>${e.nome}</option>`).join('')}</select></label>
<label>Velas<select data-k="tfManual">${[1, 5].map((m) => `<option value="${m}"${cfg.tfManual === m ? ' selected' : ''}>${m} min</option>`).join('')}</select></label>
<label>Expiração<select data-k="expira">${[1, 2, 3, 5, 10, 15].map((m) => `<option value="${m}"${cfg.expira === m ? ' selected' : ''}>${m} min</option>`).join('')}</select></label>
</div>` : ''}
<div class="rs-row">
<label>Tipo de entrada<select data-k="modoValor"><option value="percent"${cfg.modoValor === 'percent' ? ' selected' : ''}>% da banca</option><option value="fixo"${cfg.modoValor === 'fixo' ? ' selected' : ''}>Valor fixo</option></select></label>
${cfg.modoValor === 'percent' ? `<label>% da banca por operação<input data-k="percent" value="${cfg.percent}" inputmode="decimal"></label>` : `<label>Valor por operação<input data-k="valor" value="${cfg.valor}" inputmode="decimal"></label>`}
<div class="rs-row"><label>Meta de ganho por dia (0 = sem meta)<input data-k="metaGanhoDia" value="${cfg.metaGanhoDia}" inputmode="decimal"></label><label>Limite de perda por dia (0 = sem limite)<input data-k="limitePerdaDia" value="${cfg.limitePerdaDia}" inputmode="decimal"></label></div>
<label>Parar após perdas seguidas (0 = nunca)<input data-k="maxPerdasSeguidas" value="${cfg.maxPerdasSeguidas}" inputmode="numeric"></label>
<label>Parar se perder na sessão (0 = nunca)<input data-k="limitePerda" value="${cfg.limitePerda}" inputmode="decimal"></label>
<div class="rs-row"><label>Fechar antes no lucro<select data-k="fecharModo"><option value="auto"${cfg.fecharModo === 'auto' ? ' selected' : ''}>Automático (o robô decide)</option><option value="percent"${cfg.fecharModo === 'percent' ? ' selected' : ''}>% do lucro cheio</option><option value="valor"${cfg.fecharModo === 'valor' ? ' selected' : ''}>Valor (US$)</option></select></label>${cfg.fecharModo === 'auto' ? '' : `<label>Alvo (0 = nunca)<input data-k="fecharAlvo" value="${cfg.fecharAlvo}" inputmode="decimal"></label>`}</div>
<label>Fechar antes também nas minhas ordens manuais<select data-k="fecharManuais"><option value="0"${!cfg.fecharManuais ? ' selected' : ''}>Não, só nas do robô</option><option value="1"${cfg.fecharManuais ? ' selected' : ''}>Sim, nas minhas também</option></select></label>
<label>Máx. operações abertas na conta (0 = sem limite)<input data-k="maxAbertas" value="${cfg.maxAbertas}" inputmode="numeric"></label>
<label>Acerto mínimo no teste (%)<input data-k="minAcerto" value="${cfg.minAcerto}" inputmode="numeric"></label>
<label>Sinais mínimos no teste<input data-k="minOps" value="${cfg.minOps}" inputmode="numeric"></label>
</div>
<label>Chave Twelve Data (forex)<input data-k="chave" type="password" value="${esc(cfg.chave)}" placeholder="Cole a chave aqui"></label>
<button class="rs-b" data-a="assertivo" style="background:#e5a93a;color:#0e141d;font-size:12px;padding:7px">Modo mais assertivo (só acima de 60% no teste)</button>
<button class="rs-b" data-a="zerar" style="background:#253042;color:#e7ecf3;font-size:12px;padding:7px">Zerar contagem da sessão</button>`;

    let topoEl = corpo.querySelector('#rs-topo');
    if (!topoEl) {
      corpo.innerHTML = '<div id="rs-topo" style="display:flex;flex-direction:column;gap:9px"></div><div id="rs-form" style="display:flex;flex-direction:column;gap:9px"></div>';
      topoEl = corpo.querySelector('#rs-topo');
    }
    topoEl.innerHTML = topo;
    if (refazerForm || !corpo.querySelector('#rs-form').innerHTML) corpo.querySelector('#rs-form').innerHTML = form;
  }

  // ao abrir a página o robô já vem ligado (menos quando um limite de perda parou a conta)
  chrome.storage.local.get(['cfg', 'conta'], (r) => {
    cfg = { ...PADRAO, ...(r.cfg || {}) };
    if (!cfg.ligado && !(r.conta && r.conta.parado)) { cfg.ligado = true; salvar(); }
    // modo independente (uma vez): escolhe o ativo, usa as melhores combinações e decide o fechar antes sozinho
    if (!cfg.independente) { Object.assign(cfg, { independente: 1, autoAtivo: 1, modo: 'todas', fecharModo: 'auto' }); salvar(); }
    montarPainel();
  });

  let rodando = false;
  repetir(async () => {
    if (!rodando) {
      rodando = true;
      try {
        // escolha automática: ao ligar, a cada hora, ou quando o ativo atual não tem combinação aprovada
        const semComb = ativo && !ativo.juntando && rankingAtivo && !combinacoes().filter((c) => !c.sempre).length;
        // parado também procura: sem combinação aprovada testa os ativos de novo a cada 5 min; sem entrar há 20 min, a cada 20 min
        const parado = Date.now() - Math.max(ultimaEntrada, ultimaEscolha) > 20 * MINUTO;
        const intervalo = semComb ? 5 * MINUTO : parado ? 20 * MINUTO : 60 * MINUTO;
        proximaBusca = ultimaEscolha + intervalo;
        if (cfg.autoAtivo && cfg.ligado && !trocando && Date.now() - ultimaEscolha > intervalo) await escolherAtivo();
        await ciclo();
      } finally { rodando = false; }
    }
    desenhar();
  }, 1000);
})();
