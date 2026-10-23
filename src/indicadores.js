export function ema(arr, n) {
  const k = 2 / (n + 1);
  let e = arr[0];
  return arr.map((x) => (e = x * k + e * (1 - k)));
}

export function rsi(cl, n = 14) {
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

export function bollinger(cl, n = 20) {
  const s = cl.slice(-n);
  const m = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / s.length);
  return { m, up: m + 2 * sd, lo: m - 2 * sd };
}

export function atr(v, n = 14) {
  const s = v.slice(-n);
  return s.reduce((a, k) => a + (k.h - k.l), 0) / s.length || 1e-9;
}

export function indicadores(velas) {
  const cl = velas.map((k) => k.c);
  const n = cl.length - 1;
  return { cl, n, e9: ema(cl, 9), e21: ema(cl, 21), r: rsi(cl.slice(-200)), b: bollinger(cl), atr: atr(velas), last: velas[n] };
}
