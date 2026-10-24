// teste: simula as APIs do Chrome dentro da página (sem extensão instalada)
window.chrome = window.chrome || {};
const __mem = { cfg: { ligado: false } };
window.chrome.storage = { local: { get: (k, cb) => cb({ cfg: __mem.cfg }), set: (o) => Object.assign(__mem, o) } };
window.chrome.runtime = { lastError: null, sendMessage: (m, cb) => { __velas(m).then((v) => cb({ ok: true, velas: v })).catch((e) => cb({ ok: false, erro: e.message })); } };
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

async function __velas(m) {
  const tf = m.tf || 1;
  if (m.fonte === 'cripto') return binance(m.simbolo, tf, m.n);
  if (!m.chave) throw new Error('falta a chave da Twelve Data');
  const j = await json(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(m.simbolo)}&interval=${tf}min&timezone=UTC&outputsize=${Math.min(5000, m.n)}&apikey=${encodeURIComponent(m.chave)}`);
  if (j.status === 'error') throw new Error(j.message || 'erro na Twelve Data');
  return j.values.map((v) => ({ t: Date.parse(v.datetime.replace(' ', 'T') + 'Z'), o: +v.open, h: +v.high, l: +v.low, c: +v.close })).reverse();
}

function ema(arr, n) {
  const k = 2 / (n + 1);
  let e = arr[0];
  return arr.map((x) => (e = x * k + e * (1 - k)));
}

function rsi(cl, n = 14) {
  if (cl.length < n + 1) return 50;
  // RSI de Wilder
  let g = 0, p = 0;
  for (let i = 1; i <= n; i++) {
    const d = cl[i] - cl[i - 1];
    if (d > 0) g += d; else p -= d;
  }
  g /= n; p /= n;
  for (let i = n + 1; i < cl.length; i++) {
    const d = cl[i] - cl[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    p = (p * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (p === 0) return 100;
  return 100 - 100 / (1 + g / p);
}

function bollinger(cl, n = 20) {
  const s = cl.slice(-n);
  const m = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
  return { m, up: m + 2 * sd, lo: m - 2 * sd };
}

function atr(v, n = 14) {
  const s = v.slice(-n);
  return s.reduce((a, k) => a + (k.h - k.l), 0) / s.length || 1e-9;
}

function estocastico(velas, n = 14) {
  const s = velas.slice(-n);
  const hi = Math.max(...s.map((k) => k.h)), lo = Math.min(...s.map((k) => k.l));
  return hi === lo ? 50 : (100 * (velas[velas.length - 1].c - lo)) / (hi - lo);
}

function indicadores(velas) {
  const cl = velas.map((k) => k.c);
  const n = cl.length - 1;
  return {
    cl, n, e9: ema(cl, 9), e21: ema(cl, 21), e200: ema(cl, 200), r: rsi(cl.slice(-200)), r2: rsi(cl.slice(-200), 2),
    b: bollinger(cl), atr: atr(velas), st: estocastico(velas), last: velas[n],
  };
}
const ESTRATEGIAS = [
  {
    id: 'conf', nome: 'Confluência', desc: 'Tendência + RSI + Bollinger',
    fn(I, rigor) {
      let s = I.e9[I.n] > I.e21[I.n] ? 1 : -1;
      if (I.r < 38) s++; else if (I.r > 62) s--;
      const bw = (I.b.up - I.b.lo) * 0.15;
      if (I.last.c <= I.b.lo + bw) s++; else if (I.last.c >= I.b.up - bw) s--;
      s += I.last.c > I.last.o ? 0.5 : -0.5;
      const a = Math.abs(s);
      return { dir: s > 0 ? 'up' : 'down', ready: a >= rigor, near: a >= rigor - 1 && (I.r < 40 || I.r > 60) };
    },
  },
  {
    id: 'rsi', nome: 'RSI puro', desc: 'Abaixo de 30 sobe, acima de 70 desce',
    fn(I) {
      if (I.r < 30) return { dir: 'up', ready: true };
      if (I.r > 70) return { dir: 'down', ready: true };
      if (I.r < 36) return { dir: 'up', near: true };
      if (I.r > 64) return { dir: 'down', near: true };
      return {};
    },
  },
  {
    id: 'mm', nome: 'Cruzamento de médias', desc: 'Média 9 cruza a média 21',
    fn(I) {
      const d = I.e9[I.n] - I.e21[I.n], dp = I.e9[I.n - 1] - I.e21[I.n - 1];
      if (d > 0 && dp <= 0) return { dir: 'up', ready: true };
      if (d < 0 && dp >= 0) return { dir: 'down', ready: true };
      if (Math.abs(d) < I.atr * 0.15 && Math.abs(d) < Math.abs(dp)) return { dir: d > 0 ? 'down' : 'up', near: true };
      return {};
    },
  },
  {
    id: 'sr', nome: 'Suporte e resistência', desc: 'Toque no topo ou fundo de 30 velas com rejeição',
    fn(I, rigor, v) {
      const w = v.slice(-31, -1);
      const hi = Math.max(...w.map((k) => k.h)), lo = Math.min(...w.map((k) => k.l)), k = I.last;
      if (k.l <= lo && k.c > k.o) return { dir: 'up', ready: true };
      if (k.h >= hi && k.c < k.o) return { dir: 'down', ready: true };
      if (k.c - lo < I.atr * 0.4) return { dir: 'up', near: true };
      if (hi - k.c < I.atr * 0.4) return { dir: 'down', near: true };
      return {};
    },
  },
  {
    id: 'esto', nome: 'Estocástico extremo', desc: 'Estocástico 14 abaixo de 5 compra, acima de 95 vende', imediato: true,
    fn(I) {
      if (I.st < 5) return { dir: 'up', ready: true };
      if (I.st > 95) return { dir: 'down', ready: true };
      if (I.st < 12) return { dir: 'up', near: true };
      if (I.st > 88) return { dir: 'down', near: true };
      return {};
    },
  },
  {
    id: 'rsi2', nome: 'RSI 2 extremo', desc: 'RSI de 2 períodos abaixo de 5 compra, acima de 95 vende', imediato: true,
    fn(I) {
      if (I.r2 < 5) return { dir: 'up', ready: true };
      if (I.r2 > 95) return { dir: 'down', ready: true };
      if (I.r2 < 15) return { dir: 'up', near: true };
      if (I.r2 > 85) return { dir: 'down', near: true };
      return {};
    },
  },
  {
    id: 'estoc', nome: 'Estocástico contra a tendência', desc: 'Estocástico extremo só quando o preço esticou contra a média 200', imediato: true,
    fn(I) {
      const acima = I.last.c > I.e200[I.n];
      if (I.st < 5 && !acima) return { dir: 'up', ready: true };
      if (I.st > 95 && acima) return { dir: 'down', ready: true };
      if (I.st < 12 && !acima) return { dir: 'up', near: true };
      if (I.st > 88 && acima) return { dir: 'down', near: true };
      return {};
    },
  },
  {
    id: 'esto_rsi', nome: 'Estocástico + RSI', desc: 'Estocástico abaixo de 10 com RSI abaixo de 35 compra; o contrário vende', imediato: true,
    fn(I) {
      if (I.st < 10 && I.r < 35) return { dir: 'up', ready: true };
      if (I.st > 90 && I.r > 65) return { dir: 'down', ready: true };
      if (I.st < 20 && I.r < 42) return { dir: 'up', near: true };
      if (I.st > 80 && I.r > 58) return { dir: 'down', near: true };
      return {};
    },
  },
  {
    id: 'esto_sr', nome: 'Estocástico + Suporte e resistência', desc: 'Estocástico extremo encostado no fundo ou topo das últimas 30 velas', imediato: true,
    fn(I, rigor, v) {
      const w = v.slice(-31, -1);
      const hi = Math.max(...w.map((k) => k.h)), lo = Math.min(...w.map((k) => k.l));
      const perto = I.atr * 0.5;
      if (I.st < 10 && I.last.l - lo < perto) return { dir: 'up', ready: true };
      if (I.st > 90 && hi - I.last.h < perto) return { dir: 'down', ready: true };
      if (I.st < 20 && I.last.l - lo < perto * 2) return { dir: 'up', near: true };
      if (I.st > 80 && hi - I.last.h < perto * 2) return { dir: 'down', near: true };
      return {};
    },
  },
  {
    id: 'rsi_bb', nome: 'RSI + Bollinger', desc: 'RSI abaixo de 30 fora da banda inferior compra; o contrário vende', imediato: true,
    fn(I) {
      const c = I.last.c;
      if (I.r < 30 && c <= I.b.lo) return { dir: 'up', ready: true };
      if (I.r > 70 && c >= I.b.up) return { dir: 'down', ready: true };
      if (I.r < 38 && c <= I.b.lo + (I.b.m - I.b.lo) * 0.3) return { dir: 'up', near: true };
      if (I.r > 62 && c >= I.b.up - (I.b.up - I.b.m) * 0.3) return { dir: 'down', near: true };
      return {};
    },
  },
  {
    id: 'bb3', nome: 'Bollinger 3 desvios', desc: 'Preço passou de 3 desvios da média 20: aposta na volta', imediato: true,
    fn(I) {
      const sd = (I.b.up - I.b.m) / 2, c = I.last.c;
      if (c < I.b.m - 3 * sd) return { dir: 'up', ready: true };
      if (c > I.b.m + 3 * sd) return { dir: 'down', ready: true };
      if (c < I.b.m - 2.5 * sd) return { dir: 'up', near: true };
      if (c > I.b.m + 2.5 * sd) return { dir: 'down', near: true };
      return {};
    },
  },
  {
    id: 'contra5', nome: 'Contra 5 velas', desc: '5 velas seguidas na mesma cor: aposta na virada', imediato: true,
    fn(I, rigor, v) {
      const u = v.slice(-5), u4 = v.slice(-4);
      if (u.every((k) => k.c > k.o)) return { dir: 'down', ready: true };
      if (u.every((k) => k.c < k.o)) return { dir: 'up', ready: true };
      if (u4.every((k) => k.c > k.o)) return { dir: 'down', near: true };
      if (u4.every((k) => k.c < k.o)) return { dir: 'up', near: true };
      return {};
    },
  },
  {
    id: 'pavio', nome: 'Pavio na resistência/suporte', desc: 'Vela bate no topo (ou fundo) anterior e fecha com pavio longo: entra contra', imediato: true,
    fn(I, rigor, v) {
      if (v.length < 130) return {};
      const w = v.slice(-121, -10); // nível anterior: das últimas 120 velas, menos as 10 mais recentes
      const hi = Math.max(...w.map((k) => k.h)), lo = Math.min(...w.map((k) => k.l));
      const k = I.last, tol = I.atr * 0.3;
      const corpo = Math.abs(k.c - k.o) || 1e-9, rng = k.h - k.l || 1e-9;
      const sup = k.h - Math.max(k.o, k.c), inf = Math.min(k.o, k.c) - k.l;
      if (k.h >= hi - tol && k.c < hi && sup >= 1.5 * corpo && sup >= 0.5 * rng) return { dir: 'down', ready: true };
      if (k.l <= lo + tol && k.c > lo && inf >= 1.5 * corpo && inf >= 0.5 * rng) return { dir: 'up', ready: true };
      if (k.h >= hi - tol * 2 && k.c < hi) return { dir: 'down', near: true };
      if (k.l <= lo + tol * 2 && k.c > lo) return { dir: 'up', near: true };
      return {};
    },
  },
  // ---------- padrões de vela ----------
  {
    id: 'martelo', nome: 'Martelo / Estrela cadente', desc: 'Martelo depois de queda compra; estrela cadente depois de alta vende', imediato: true,
    fn(I, rigor, v) {
      const k = I.last, c = Math.abs(k.c - k.o) || 1e-9, r = k.h - k.l || 1e-9;
      const sup = k.h - Math.max(k.o, k.c), inf = Math.min(k.o, k.c) - k.l;
      const antes = v.slice(-6, -1), caiu = antes[0].c > antes[antes.length - 1].c, subiu = antes[0].c < antes[antes.length - 1].c;
      if (caiu && inf >= 2 * c && sup <= 0.3 * r) return { dir: 'up', ready: true };
      if (subiu && sup >= 2 * c && inf <= 0.3 * r) return { dir: 'down', ready: true };
      return {};
    },
  },
  {
    id: 'engolfo', nome: 'Engolfo', desc: 'Vela que engole a anterior na direção contrária', imediato: true,
    fn(I, rigor, v) {
      const a = v[v.length - 2], b = I.last;
      if (a.c < a.o && b.c > b.o && b.c > a.o && b.o <= a.c) return { dir: 'up', ready: true };
      if (a.c > a.o && b.c < b.o && b.c < a.o && b.o >= a.c) return { dir: 'down', ready: true };
      return {};
    },
  },
  {
    id: 'doji', nome: 'Doji no extremo', desc: 'Vela de corpo mínimo com RSI esticado: indecisão, aposta na volta', imediato: true,
    fn(I) {
      const k = I.last, r = k.h - k.l || 1e-9;
      if (Math.abs(k.c - k.o) > 0.1 * r) return {};
      if (I.r < 35) return { dir: 'up', ready: true };
      if (I.r > 65) return { dir: 'down', ready: true };
      return {};
    },
  },
  {
    id: 'harami', nome: 'Harami', desc: 'Vela pequena dentro do corpo da anterior grande: perda de força', imediato: true,
    fn(I, rigor, v) {
      const a = v[v.length - 2], b = I.last;
      const ca = Math.abs(a.c - a.o), cb = Math.abs(b.c - b.o);
      if (ca < I.atr * 0.8 || cb > ca * 0.5) return {};
      const dentro = Math.max(b.o, b.c) <= Math.max(a.o, a.c) && Math.min(b.o, b.c) >= Math.min(a.o, a.c);
      if (!dentro) return {};
      return a.c < a.o ? { dir: 'up', ready: true } : { dir: 'down', ready: true };
    },
  },
  {
    id: 'estrela', nome: 'Estrela da manhã / da noite', desc: 'Vela forte, vela pequena e vela forte para o outro lado', imediato: true,
    fn(I, rigor, v) {
      const [a, b, c] = v.slice(-3);
      const ca = Math.abs(a.c - a.o), cb = Math.abs(b.c - b.o), cc = Math.abs(c.c - c.o);
      if (ca < I.atr * 0.7 || cb > ca * 0.4 || cc < ca * 0.5) return {};
      const meioA = (a.o + a.c) / 2;
      if (a.c < a.o && c.c > c.o && c.c > meioA) return { dir: 'up', ready: true };
      if (a.c > a.o && c.c < c.o && c.c < meioA) return { dir: 'down', ready: true };
      return {};
    },
  },
  {
    id: 'tres', nome: 'Três soldados / Três corvos', desc: '3 velas fortes seguidas na mesma direção: segue o movimento', imediato: true,
    fn(I, rigor, v) {
      const u = v.slice(-3);
      const fortes = u.every((k) => Math.abs(k.c - k.o) > 0.6 * (k.h - k.l || 1e-9));
      if (!fortes) return {};
      if (u.every((k, i) => k.c > k.o && (i === 0 || k.c > u[i - 1].c))) return { dir: 'up', ready: true };
      if (u.every((k, i) => k.c < k.o && (i === 0 || k.c < u[i - 1].c))) return { dir: 'down', ready: true };
      return {};
    },
  },
  // ---------- leitura de gráfico: padrão de reversão em cima de um nível ----------
  {
    id: 'leitura', nome: 'Leitura: padrão de reversão no nível', desc: 'Preço num suporte/resistência que já segurou antes + vela de reversão (pavio, martelo, engolfo, doji, harami, estrela)', imediato: true,
    fn(I, rigor, v) {
      if (v.length < 130) return {};
      const k = I.last, a = v[v.length - 2], b3 = v[v.length - 3];
      const tol = I.atr * 0.35;
      // níveis: topos e fundos de 2 horas (sem as 5 velas mais recentes) que foram tocados pelo menos 2 vezes
      const w = v.slice(-125, -5);
      const toques = (nivel, lado) => w.filter((x) => Math.abs((lado === 'hi' ? x.h : x.l) - nivel) <= tol).length;
      const hi = Math.max(...w.map((x) => x.h)), lo = Math.min(...w.map((x) => x.l));
      const naResist = k.h >= hi - tol && k.c <= hi + tol && toques(hi, 'hi') >= 2;
      const noSuporte = k.l <= lo + tol && k.c >= lo - tol && toques(lo, 'lo') >= 2;
      if (!naResist && !noSuporte) return {};
      const corpo = Math.abs(k.c - k.o) || 1e-9, rng = k.h - k.l || 1e-9;
      const sup = k.h - Math.max(k.o, k.c), inf = Math.min(k.o, k.c) - k.l;
      const doji = corpo <= 0.1 * rng;
      const ca = Math.abs(a.c - a.o);
      // padrões de baixa (para a resistência)
      const baixa = (sup >= 1.5 * corpo && sup >= 0.45 * rng) || doji
        || (a.c > a.o && k.c < k.o && k.c < a.o && k.o >= a.c)
        || (a.c > a.o && ca > I.atr * 0.6 && Math.max(k.o, k.c) <= a.c && Math.min(k.o, k.c) >= a.o && corpo < ca * 0.5)
        || (b3.c > b3.o && Math.abs(a.c - a.o) < Math.abs(b3.c - b3.o) * 0.4 && k.c < k.o && k.c < (b3.o + b3.c) / 2);
      const alta = (inf >= 1.5 * corpo && inf >= 0.45 * rng) || doji
        || (a.c < a.o && k.c > k.o && k.c > a.o && k.o <= a.c)
        || (a.c < a.o && ca > I.atr * 0.6 && Math.max(k.o, k.c) <= a.o && Math.min(k.o, k.c) >= a.c && corpo < ca * 0.5)
        || (b3.c < b3.o && Math.abs(a.c - a.o) < Math.abs(b3.c - b3.o) * 0.4 && k.c > k.o && k.c > (b3.o + b3.c) / 2);
      if (naResist && baixa) return { dir: 'down', ready: true };
      if (noSuporte && alta) return { dir: 'up', ready: true };
      if (naResist) return { dir: 'down', near: true };
      if (noSuporte) return { dir: 'up', near: true };
      return {};
    },
  },
  {
    id: 'leitura2', nome: 'Leitura ampla: reversão em qualquer nível', desc: 'Preço num suporte/resistência que já segurou antes + vela de reversão (pavio, martelo, engolfo, doji, harami, estrela)', imediato: true,
    fn(I, rigor, v) {
      if (v.length < 130) return {};
      const k = I.last, a = v[v.length - 2], b3 = v[v.length - 3];
      const tol = I.atr * 0.35;
      // níveis: topos e fundos de 2 horas (sem as 5 velas mais recentes) que foram tocados pelo menos 2 vezes
      const w = v.slice(-125, -5);
      // níveis: pontos onde o preço virou nas últimas 2 horas (topos e fundos locais), sem as 5 velas mais recentes.
      // um fundo antigo também vale como resistência quando o preço volta nele por baixo (suporte que virou resistência)
      const piv = [];
      for (let i = 3; i < w.length - 3; i++) {
        const x = w[i];
        if ([1, 2, 3].every((d) => x.h >= w[i - d].h && x.h >= w[i + d].h)) piv.push(x.h);
        if ([1, 2, 3].every((d) => x.l <= w[i - d].l && x.l <= w[i + d].l)) piv.push(x.l);
      }
      const forca = (nivel) => piv.filter((p) => Math.abs(p - nivel) <= tol).length;
      // resistência: nível acima do fechamento que a vela encostou; suporte: nível abaixo que a vela encostou
      const resist = piv.filter((p) => k.h >= p - tol && k.c < p && forca(p) >= 2);
      const suporte = piv.filter((p) => k.l <= p + tol && k.c > p && forca(p) >= 2);
      const naResist = resist.length > 0;
      const noSuporte = suporte.length > 0;
      if (!naResist && !noSuporte) return {};
      const corpo = Math.abs(k.c - k.o) || 1e-9, rng = k.h - k.l || 1e-9;
      const sup = k.h - Math.max(k.o, k.c), inf = Math.min(k.o, k.c) - k.l;
      const doji = corpo <= 0.1 * rng;
      const ca = Math.abs(a.c - a.o);
      // padrões de baixa (para a resistência)
      const baixa = (sup >= 1.5 * corpo && sup >= 0.45 * rng) || doji
        || (a.c > a.o && k.c < k.o && k.c < a.o && k.o >= a.c)
        || (a.c > a.o && ca > I.atr * 0.6 && Math.max(k.o, k.c) <= a.c && Math.min(k.o, k.c) >= a.o && corpo < ca * 0.5)
        || (b3.c > b3.o && Math.abs(a.c - a.o) < Math.abs(b3.c - b3.o) * 0.4 && k.c < k.o && k.c < (b3.o + b3.c) / 2);
      const alta = (inf >= 1.5 * corpo && inf >= 0.45 * rng) || doji
        || (a.c < a.o && k.c > k.o && k.c > a.o && k.o <= a.c)
        || (a.c < a.o && ca > I.atr * 0.6 && Math.max(k.o, k.c) <= a.o && Math.min(k.o, k.c) >= a.c && corpo < ca * 0.5)
        || (b3.c < b3.o && Math.abs(a.c - a.o) < Math.abs(b3.c - b3.o) * 0.4 && k.c > k.o && k.c > (b3.o + b3.c) / 2);
      if (naResist && baixa) return { dir: 'down', ready: true };
      if (noSuporte && alta) return { dir: 'up', ready: true };
      if (naResist) return { dir: 'down', near: true };
      if (noSuporte) return { dir: 'up', near: true };
      return {};
    },
  },
];

const MIN = 60000;

function criarMotor() {
  const S = {};
  ESTRATEGIAS.forEach((s) => (S[s.id] = { pre: null, ops: [] }));
  return { velas: [], S, fechadaAte: 0, zero: 0, I: null };
}

// histórico: todas as velas menos a última já fecharam
function carregarHistorico(m, velas, cfg) {
  const novo = criarMotor();
  Object.assign(m, novo);
  velas.forEach((v, i) => {
    m.velas.push(v);
    if (i < velas.length - 1) fechar(m, cfg, null);
  });
}

function atualizar(m, vela, fechada, cfg, aviso) {
  const v = m.velas;
  const last = v[v.length - 1];
  if (last && vela.t < last.t) return;
  if (last && vela.t > last.t) {
    if (last.t > m.fechadaAte) fechar(m, cfg, aviso);
    v.push(vela);
  } else if (last) {
    v[v.length - 1] = vela;
  } else {
    v.push(vela);
  }
  if (v.length > 600) v.splice(0, v.length - 600);
  if (fechada && vela.t > m.fechadaAte) fechar(m, cfg, aviso);
}

function fechar(m, cfg, aviso) {
  const v = m.velas;
  const k = v[v.length - 1];
  m.fechadaAte = k.t;
  const TF = cfg.tf || MIN; // duração da vela (1 min no app; a extensão também usa 5 min)
  const fimT = k.t + TF;
  const preco = k.c;
  for (const id in m.S) {
    for (const o of m.S[id].ops) {
      if (o.res === 'aberta' && o.fimT <= fimT) {
        o.saida = preco;
        o.res = (o.dir === 'up' ? preco > o.entrada : preco < o.entrada) ? 'acerto' : 'erro';
      }
    }
  }
  if (v.length < 35) return;
  const I = indicadores(v);
  m.I = I;
  const sobe = k.c > k.o, desce = k.c < k.o;
  for (const s of ESTRATEGIAS) {
    const S = m.S[s.id];
    // sobrepor: pode abrir um sinal novo mesmo com outro ainda em andamento (a extensão usa)
    let aberta = !cfg.sobrepor && S.ops.some((o) => o.res === 'aberta');
    const R = s.fn(I, cfg.rigor, v) || {};
    if (S.pre) {
      const velaConfirma = S.pre.dir === 'up' ? sobe : desce;
      const ok = (R.ready && R.dir === S.pre.dir) || ((S.pre.ready || (R.near && R.dir === S.pre.dir)) && velaConfirma);
      if (ok && !aberta) {
        S.ops.push({ t: fimT, dir: S.pre.dir, entrada: preco, fimT: fimT + cfg.expira * MIN, res: 'aberta' });
        aberta = true;
        if (aviso) aviso(s.id, 'sinal');
      } else {
        S.ops.push({ t: fimT, dir: S.pre.dir, res: 'cancelado' });
      }
      S.pre = null;
    }
    // estratégias de extremo entram na hora em que o extremo aparece
    if (s.imediato && !S.pre && !aberta && R.ready && R.dir) {
      S.ops.push({ t: fimT, dir: R.dir, entrada: preco, fimT: fimT + cfg.expira * MIN, res: 'aberta' });
      aberta = true;
      if (aviso) aviso(s.id, 'sinal');
    }
    // depois de um cancelamento, a vela atual ainda pode abrir um novo alerta
    if (!S.pre && !aberta && R.dir && (R.ready || R.near)) {
      S.pre = { dir: R.dir, ready: !!R.ready, ateT: fimT + TF };
      if (aviso) aviso(s.id, 'atencao');
    }
    if (S.ops.length > 3000) S.ops.splice(0, 500);
  }
}

// replay: a banca para quando não cobre a próxima entrada
function placar(S, cfg, zero) {
  const v = cfg.valor, p = cfg.retorno / 100;
  let banca = cfg.banca, gain = 0, loss = 0, acertos = 0, erros = 0;
  const pl = new Map();
  for (const o of S.ops) {
    if (o.t <= zero || o.res === 'cancelado' || o.res === 'aberta') continue;
    if (banca < v || v <= 0) { pl.set(o, 'sem banca'); continue; }
    if (o.res === 'acerto') { banca += v * p; gain += v * p; acertos++; pl.set(o, v * p); }
    else { banca -= v; loss += v; erros++; pl.set(o, -v); }
  }
  return { banca, gain, loss, acertos, erros, total: acertos + erros, parada: banca < v, pl };
}
// Robô de Sinais - Piloto (extensão do Chrome para a Olymp Trade)
(() => {
  document.getElementById("rs-painel")?.remove();
  window.__roboSinais = true;

  const MINUTO = 60000;
  const RETORNO = 0.85; // retorno médio da Olymp no acerto, usado nas contas do teste
  const EMPATE = (100 / (1 + RETORNO));
  const PADRAO = {
    ligado: false, autoAtivo: false, sempreLeitura: 1, modo: 'todas', estrategia: 'conf', expira: 1, tfManual: 1,
    valor: 10, modoValor: 'percent', percent: 1, chave: '',
    maxPerdasSeguidas: 3, limitePerda: 100, minAcerto: 56, minOps: 40, rigor: 2.5, maxAbertas: 0,
  };

  // ---------- ativos ----------
  const FOREX = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'EUR/JPY', 'USD/CAD', 'USD/CHF', 'NZD/USD', 'EUR/GBP', 'GBP/JPY', 'AUD/JPY', 'EUR/CHF'];
  const RANKING_ATIVOS = [
    { titulo: 'EUR/USD', fonte: 'forex', simbolo: 'EUR/USD' }, { titulo: 'GBP/USD', fonte: 'forex', simbolo: 'GBP/USD' },
    { titulo: 'USD/JPY', fonte: 'forex', simbolo: 'USD/JPY' }, { titulo: 'AUD/USD', fonte: 'forex', simbolo: 'AUD/USD' },
    { titulo: 'EUR/JPY', fonte: 'forex', simbolo: 'EUR/JPY' }, { titulo: 'Ouro', fonte: 'forex', simbolo: 'XAU/USD', busca: 'Gold' },
    { titulo: 'Bitcoin', fonte: 'cripto', simbolo: 'BTCUSDT' }, { titulo: 'Ethereum', fonte: 'cripto', simbolo: 'ETHUSDT' },
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
    const aprovadas = linhas.filter((r) => r.a.n >= cfg.minOps * 0.6 && r.b.n >= cfg.minOps * 0.4 && r.a.ac >= cfg.minAcerto && r.b.ac >= cfg.minAcerto);
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

  const salvar = () => chrome.storage.local.set({ cfg });
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
  setInterval(coletar, 1000);
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
  let ultimaEscolha = 0;
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
  async function reservar(id, dir, ate) {
    await espera(Math.floor(Math.random() * 400)); // evita duas janelas reservarem no mesmo instante
    const cg = limparVencidas(await lerConta());
    if (cg.parado) return 'robô parado na conta: ' + cg.parado;
    const abertas = Object.values(cg.abertas);
    if (cfg.maxAbertas > 0 && abertas.length >= cfg.maxAbertas) return `já há ${abertas.length} operações abertas na conta`;
    if (cfg.maxAbertas > 0 && ativo.fonte === 'cripto' && abertas.some((a) => a.cripto && a.dir === dir && a.ativo !== ativo.titulo)) return 'já há cripto aberta na mesma direção';
    cg.abertas = { ...cg.abertas, [id]: { ativo: ativo.titulo, cripto: ativo.fonte === 'cripto', dir, ate, aba: ABA } };
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
    const base = { hora: sinal.t, dir: sinal.dir, estrategia: c.nome };
    if (!cfg.ligado) { registrar({ ...base, situacao: 'só sinal (robô desligado)' }); return; }
    // várias operações podem ficar abertas; só espera a anterior terminar de ser digitada na Olymp
    for (let i = 0; i < 40 && operando; i++) await espera(500);
    if (operando) { registrar({ ...base, situacao: 'pulou: a Olymp não liberou a tela a tempo' }); return; }
    operando = true;
    const id = ABA + '-' + sinal.t + '-' + c.est;
    const motivo = await reservar(id, sinal.dir, Date.now() + c.exp * MINUTO + 15000);
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
      reg.saldoAntes = antes;
      setTimeout(() => conferir(reg), c.exp * MINUTO + 8000);
    } catch (e) {
      liberar(id);
      reg.situacao = 'falhou: ' + e.message;
      if (travadas >= 3) { reg.situacao += ' · recarregando a página'; setTimeout(() => location.reload(), 3000); }
    }
    operando = false;
    desenhar();
  }

  // resultado pela cotação (não pelo saldo, que mistura as operações das outras janelas)
  async function conferir(reg) {
    const s = reg.sinal;
    let res = s.res;
    if (res !== 'acerto' && res !== 'erro') {
      const m = Object.values(motores).find((x) => x.velas.length);
      const ult = m ? m.velas[m.velas.length - 1].c : null;
      res = ult == null || ult === s.entrada ? null : (s.dir === 'up' ? ult > s.entrada : ult < s.entrada) ? 'acerto' : 'erro';
    }
    reg.resultado = res === 'acerto' ? Math.round(reg.valor * reg.retorno * 100) / 100 : res === 'erro' ? -reg.valor : null;
    reg.situacao = reg.resultado == null ? 'empate' : reg.resultado > 0 ? 'ganhou' : 'perdeu';
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
      await gravarConta(cg);
      if (cg.parado) parar(cg.parado);
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
      if (cfg.ligado) { sessao.parado = ''; sessao.perdasSeguidas = 0; lerConta().then((cg) => { if (cg.parado) { cg.parado = ''; cg.perdasSeguidas = 0; gravarConta(cg); } }); }
      salvar();
      desenhar(true);
    }
    if (a === 'zerar') { sessao.ops.length = 0; sessao.resultado = 0; sessao.perdasSeguidas = 0; sessao.parado = ''; gravarConta({ abertas: {}, resultado: 0, perdasSeguidas: 0, ganhos: 0, perdas: 0, parado: '' }); desenhar(true); }
    if (a === 'geral') rodarRankingGeral();
  }

  function desenhar(refazerForm) {
    if (!corpo) return;
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
${real ? `<div class="rs-real">CONTA REAL: as operações usam dinheiro de verdade</div>` : `<div class="rs-l">Conta: ${esc(ct || '?')}</div>`}
${comb}
<div class="rs-sinal"><div class="rs-ic" style="background:${sinal.bg};color:#0e141d;font-weight:800;font-size:20px">${sinal.ic}</div><div><div class="rs-t">${esc(sinal.t)}</div><div class="rs-mono" style="color:#8b97a8;font-size:12px">${esc(sinal.s)}</div></div></div>
<button class="rs-b" data-a="ligar" style="background:${cfg.ligado ? '#f0675b' : '#2fc59c'};color:#0e141d">${cfg.ligado ? 'Desligar robô' : 'Ligar robô (operar)'}</button>
${sessao.parado || contaGlobal.parado ? `<div style="color:#f0675b;font-size:12px">Robô parou: ${esc(sessao.parado || contaGlobal.parado)}</div>` : ''}
<div class="rs-row rs-mono" style="font-size:12px"><div>Esta janela: <b style="color:${sessao.resultado >= 0 ? '#2fc59c' : '#f0675b'}">${sessao.resultado >= 0 ? '+' : ''}${sessao.resultado.toFixed(2)}</b></div><div>${ganhos} ganhos · ${perdas} perdas</div></div>
<div class="rs-row rs-mono" style="font-size:12px"><div>Conta toda: <b style="color:${(contaGlobal.resultado || 0) >= 0 ? '#2fc59c' : '#f0675b'}">${(contaGlobal.resultado || 0) >= 0 ? '+' : ''}${(contaGlobal.resultado || 0).toFixed(2)}</b></div><div>${contaGlobal.ganhos || 0} g · ${contaGlobal.perdas || 0} p · ${Object.keys(limparVencidas({ abertas: { ...(contaGlobal.abertas || {}) } }).abertas).length} abertas</div></div>
<div class="rs-ops">${sessao.ops.slice(0, 8).map((o) => `<div class="rs-op"><span class="rs-mono">${hora(o.hora)} ${o.dir === 'up' ? '▲ Compra' : '▼ Venda'}</span><span>${esc(o.situacao)}</span><span class="rs-mono" style="color:${o.resultado > 0 ? '#2fc59c' : o.resultado < 0 ? '#f0675b' : '#8b97a8'}">${o.resultado != null ? (o.resultado > 0 ? '+' : '') + o.resultado.toFixed(2) : ''}</span></div>`).join('') || '<span style="color:#8b97a8">Nenhuma operação ainda</span>'}</div>
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
<label>Parar após perdas seguidas (0 = nunca)<input data-k="maxPerdasSeguidas" value="${cfg.maxPerdasSeguidas}" inputmode="numeric"></label>
<label>Parar se perder na sessão (0 = nunca)<input data-k="limitePerda" value="${cfg.limitePerda}" inputmode="decimal"></label>
<label>Máx. operações abertas na conta (0 = sem limite)<input data-k="maxAbertas" value="${cfg.maxAbertas}" inputmode="numeric"></label>
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

  chrome.storage.local.get('cfg', (r) => { cfg = { ...PADRAO, ...(r.cfg || {}) }; montarPainel(); });

  let rodando = false;
  setInterval(async () => {
    if (!rodando) {
      rodando = true;
      try {
        // escolha automática: ao ligar, a cada hora, ou quando o ativo atual não tem combinação aprovada
        const semComb = ativo && !ativo.juntando && rankingAtivo && !combinacoes().filter((c) => !c.sempre).length;
        if (cfg.autoAtivo && cfg.ligado && !trocando && (Date.now() - ultimaEscolha > 60 * MINUTO || (semComb && Date.now() - ultimaEscolha > 10 * MINUTO))) await escolherAtivo();
        await ciclo();
      } finally { rodando = false; }
    }
    desenhar();
  }, 1000);
})();
