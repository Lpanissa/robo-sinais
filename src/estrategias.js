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
];
