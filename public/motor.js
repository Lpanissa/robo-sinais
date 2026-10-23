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

function indicadores(velas) {
  const cl = velas.map((k) => k.c);
  const n = cl.length - 1;
  return { cl, n, e9: ema(cl, 9), e21: ema(cl, 21), r: rsi(cl.slice(-200)), b: bollinger(cl), atr: atr(velas), last: velas[n] };
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
  const fimT = k.t + MIN;
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
    let aberta = S.ops.some((o) => o.res === 'aberta');
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
    // depois de um cancelamento, a vela atual ainda pode abrir um novo alerta
    if (!S.pre && !aberta && R.dir && (R.ready || R.near)) {
      S.pre = { dir: R.dir, ready: !!R.ready, ateT: fimT + MIN };
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
