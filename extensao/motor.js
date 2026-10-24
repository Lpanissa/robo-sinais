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
      if (a.c < a.o && b.c > b.o && b.c > a.o && b.o < a.c) return { dir: 'up', ready: true };
      if (a.c > a.o && b.c < b.o && b.c < a.o && b.o > a.c) return { dir: 'down', ready: true };
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
      const dentro = Math.max(b.o, b.c) < Math.max(a.o, a.c) && Math.min(b.o, b.c) > Math.min(a.o, a.c);
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
