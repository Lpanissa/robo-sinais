import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Line, Polyline, Polygon, Text as SvgText } from 'react-native-svg';
import { ema } from './indicadores';
import { C } from './tema';

export default function Grafico({ velas, ops, casas, largura, altura = 240 }) {
  if (!largura || velas.length < 3) return <View style={{ height: altura }} />;
  const padR = 66, padT = 8, padB = 8;
  const n = Math.max(20, Math.min(80, Math.floor((largura - padR) / 7)));
  const c = velas.slice(-n);
  const off = velas.length - c.length;
  let hi = -Infinity, lo = Infinity;
  c.forEach((k) => { hi = Math.max(hi, k.h); lo = Math.min(lo, k.l); });
  const rg = hi - lo || hi * 0.001 || 1;
  hi += rg * 0.06; lo -= rg * 0.06;
  const y = (v) => padT + ((hi - v) / (hi - lo)) * (altura - padT - padB);
  const cw = (largura - padR) / c.length;
  const cl = velas.map((k) => k.c);
  const e9 = ema(cl, 9), e21 = ema(cl, 21);
  const linha = (e) => c.map((_, i) => `${(i * cw + cw / 2).toFixed(1)},${y(e[off + i]).toFixed(1)}`).join(' ');
  const t0 = c[0].t;
  const ultimo = c[c.length - 1];
  const grade = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);

  return (
    <Svg width={largura} height={altura}>
      {grade.map((v, i) => (
        <React.Fragment key={'g' + i}>
          <Line x1={0} x2={largura - padR} y1={y(v)} y2={y(v)} stroke={C.grade} strokeWidth={1} />
          <SvgText x={largura - padR + 6} y={y(v) + 4} fill={C.suave} fontSize={10} fontFamily="monospace">{v.toFixed(casas)}</SvgText>
        </React.Fragment>
      ))}
      <Polyline points={linha(e21)} fill="none" stroke={C.suave} strokeWidth={1.3} />
      <Polyline points={linha(e9)} fill="none" stroke={C.destaque} strokeWidth={1.3} />
      {c.map((k, i) => {
        const x = i * cw + cw / 2;
        const cor = k.c >= k.o ? C.alta : C.baixa;
        const topo = y(Math.max(k.o, k.c));
        const corpo = Math.max(1, Math.abs(y(k.o) - y(k.c)));
        return (
          <React.Fragment key={k.t}>
            <Line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} stroke={cor} strokeWidth={1} />
            <Rect x={x - cw * 0.33} y={topo} width={cw * 0.66} height={corpo} fill={cor} />
          </React.Fragment>
        );
      })}
      {ops.filter((o) => o.entrada != null && o.t - 60000 >= t0).map((o) => {
        const i = Math.round((o.t - 60000 - t0) / 60000);
        if (i < 0 || i >= c.length) return null;
        const x = i * cw + cw / 2, yy = y(o.entrada);
        const pts = o.dir === 'up'
          ? `${x},${yy + 6} ${x - 5},${yy + 14} ${x + 5},${yy + 14}`
          : `${x},${yy - 6} ${x - 5},${yy - 14} ${x + 5},${yy - 14}`;
        return <Polygon key={'s' + o.t} points={pts} fill={o.dir === 'up' ? C.alta : C.baixa} />;
      })}
      <Rect x={largura - padR} y={y(ultimo.c) - 9} width={padR} height={18} fill={C.destaque} />
      <SvgText x={largura - padR + 5} y={y(ultimo.c) + 4} fill={C.fundo} fontSize={10} fontWeight="bold" fontFamily="monospace">{ultimo.c.toFixed(casas)}</SvgText>
    </Svg>
  );
}
