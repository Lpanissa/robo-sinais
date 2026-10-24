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
