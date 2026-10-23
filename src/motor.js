import { indicadores } from './indicadores';
import { ESTRATEGIAS } from './estrategias';

export const MIN = 60000;

export function criarMotor() {
  const S = {};
  ESTRATEGIAS.forEach((s) => (S[s.id] = { pre: null, ops: [] }));
  return { velas: [], S, fechadaAte: 0, zero: 0, I: null };
}

// histórico: todas as velas menos a última já fecharam
export function carregarHistorico(m, velas, cfg) {
  const novo = criarMotor();
  Object.assign(m, novo);
  velas.forEach((v, i) => {
    m.velas.push(v);
    if (i < velas.length - 1) fechar(m, cfg, null);
  });
}

export function atualizar(m, vela, fechada, cfg, aviso) {
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
export function placar(S, cfg, zero) {
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
