export const ESTRATEGIAS = [
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
];
