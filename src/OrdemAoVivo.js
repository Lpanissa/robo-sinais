// gráfico ao vivo de uma ordem aberta: velas de 1 min do ativo, linha de entrada, tempo que falta e se está ganhando
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { C } from './tema';

const BASE = 'https://fyxksvydxwvygjebanno.supabase.co/rest/v1/';
const SB_CHAVE = 'sb_publishable_HA-Ez2aumnGCLZt2rf-bsQ_MqipvpWK';
const CODIGO = 'rJAShHACX2c91d6HpYqypp_1';
const H = { apikey: SB_CHAVE, Authorization: 'Bearer ' + SB_CHAVE, 'x-codigo': CODIGO };
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Consolas, monospace' });
const casasDe = (p) => (p >= 1000 ? 2 : p >= 10 ? 3 : 5);

function Grafico({ velas, preco, entrada, dir, largura, altura }) {
  const padR = 70, padT = 10, padB = 10;
  let c = velas.slice(-40);
  if (preco != null && c.length) {
    // a última vela acompanha o preço do momento
    const u = { ...c[c.length - 1] };
    u.c = preco; u.h = Math.max(u.h, preco); u.l = Math.min(u.l, preco);
    c = [...c.slice(0, -1), u];
  }
  if (c.length < 2) return <View style={{ height: altura, alignItems: 'center', justifyContent: 'center' }}><Text style={s.sub}>Esperando as velas do robô...</Text></View>;
  let hi = -Infinity, lo = Infinity;
  c.forEach((k) => { hi = Math.max(hi, k.h); lo = Math.min(lo, k.l); });
  if (entrada != null) { hi = Math.max(hi, entrada); lo = Math.min(lo, entrada); }
  const rg = hi - lo || hi * 0.001 || 1;
  hi += rg * 0.08; lo -= rg * 0.08;
  const y = (v) => padT + ((hi - v) / (hi - lo)) * (altura - padT - padB);
  const cw = (largura - padR) / c.length;
  const casas = casasDe(c[c.length - 1].c);
  const ultimo = c[c.length - 1].c;
  const corEntrada = dir === 'up' ? C.alta : C.baixa;
  return (
    <Svg width={largura} height={altura}>
      {[0, 1, 2, 3].map((i) => { const v = lo + ((hi - lo) * i) / 3; return <Line key={i} x1={0} x2={largura - padR} y1={y(v)} y2={y(v)} stroke={C.grade} strokeWidth={1} />; })}
      {c.map((k, i) => {
        const x = i * cw + cw / 2, cor = k.c >= k.o ? C.alta : C.baixa;
        return (
          <React.Fragment key={k.t}>
            <Line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} stroke={cor} strokeWidth={1} />
            <Rect x={x - cw * 0.33} y={y(Math.max(k.o, k.c))} width={cw * 0.66} height={Math.max(1, Math.abs(y(k.o) - y(k.c)))} fill={cor} />
          </React.Fragment>
        );
      })}
      {entrada != null && (
        <>
          <Line x1={0} x2={largura - padR} y1={y(entrada)} y2={y(entrada)} stroke={corEntrada} strokeWidth={1.5} strokeDasharray="6,4" />
          <Rect x={largura - padR} y={y(entrada) - 9} width={padR} height={18} fill={corEntrada} />
          <SvgText x={largura - padR + 5} y={y(entrada) + 4} fill={C.fundo} fontSize={10} fontWeight="bold" fontFamily="monospace">{entrada.toFixed(casas)}</SvgText>
        </>
      )}
      <Rect x={largura - padR} y={y(ultimo) - 9} width={padR} height={18} fill={C.destaque} />
      <SvgText x={largura - padR + 5} y={y(ultimo) + 4} fill={C.fundo} fontSize={10} fontWeight="bold" fontFamily="monospace">{ultimo.toFixed(casas)}</SvgText>
    </Svg>
  );
}

export default function OrdemAoVivo({ ordem, fechar }) {
  const { width } = useWindowDimensions();
  const [vivo, setVivo] = useState(null);
  const [o, setO] = useState(ordem);
  const [, setTick] = useState(0);

  const carregar = useCallback(async () => {
    try {
      const [rv, ro] = await Promise.all([
        fetch(`${BASE}sinais_ao_vivo?select=*&ativo=eq.${encodeURIComponent(ordem.ativo)}`, { headers: H }).then((r) => r.json()),
        fetch(`${BASE}sinais_ordens?select=*&id=eq.${encodeURIComponent(ordem.id)}`, { headers: H }).then((r) => r.json()),
      ]);
      if (Array.isArray(rv) && rv[0]) setVivo(rv[0]);
      if (Array.isArray(ro) && ro[0]) setO(ro[0]);
    } catch (e) { /* tenta de novo */ }
  }, [ordem.ativo, ordem.id]);

  useEffect(() => {
    carregar();
    const a = setInterval(carregar, 3000);
    const b = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [carregar]);

  const entrada = o.entrada != null ? Number(o.entrada) : null;
  const preco = vivo && vivo.preco != null ? Number(vivo.preco) : null;
  const velas = (vivo && vivo.velas) || [];
  const terminou = o.resultado != null || !/andamento/.test(o.situacao || '');
  const resta = o.fim ? Math.max(0, Math.round((new Date(o.fim).getTime() - Date.now()) / 1000)) : null;
  const ganhando = entrada != null && preco != null && preco !== entrada ? (o.dir === 'up' ? preco > entrada : preco < entrada) : null;
  const atraso = vivo ? Math.round((Date.now() - new Date(vivo.atualizado_em).getTime()) / 1000) : null;
  const moeda = o.conta === 'demo' ? 'Đ ' : 'US$ ';

  let situacao, cor;
  if (terminou) {
    const r = o.resultado != null ? Number(o.resultado) : null;
    situacao = r == null ? (o.situacao || 'terminou') : r > 0 ? `Ganhou ${moeda}${r.toFixed(2).replace('.', ',')}` : `Perdeu ${moeda}${Math.abs(r).toFixed(2).replace('.', ',')}`;
    cor = r == null ? C.suave : r > 0 ? C.alta : C.baixa;
  } else {
    situacao = ganhando == null ? 'Acompanhando...' : ganhando ? 'Ganhando agora' : 'Perdendo agora';
    cor = ganhando == null ? C.suave : ganhando ? C.alta : C.baixa;
  }

  return (
    <Modal visible animationType="slide" onRequestClose={fechar}>
      <View style={s.raiz}>
        <View style={s.topo}>
          <View style={{ flex: 1 }}>
            <Text style={s.titulo}>{o.ativo} <Text style={{ color: o.dir === 'up' ? C.alta : C.baixa }}>{o.dir === 'up' ? 'Compra' : 'Venda'}</Text></Text>
            <Text style={s.sub}>{o.estrategia}</Text>
          </View>
          <Pressable onPress={fechar} style={s.botao}><Text style={s.botaoTxt}>Fechar</Text></Pressable>
        </View>
        <View style={s.card}>
          <Grafico velas={velas} preco={terminou ? null : preco} entrada={entrada} dir={o.dir} largura={Math.min(width, 760) - 34} altura={300} />
        </View>
        <View style={s.grade}>
          <View style={s.stat}><Text style={[s.statV, { color: cor }]}>{situacao}</Text><Text style={s.statR}>Situação</Text></View>
          <View style={s.stat}><Text style={s.statV}>{terminou ? '—' : resta == null ? '?' : `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}`}</Text><Text style={s.statR}>Falta</Text></View>
        </View>
        <Text style={s.nota}>
          Linha tracejada: preço em que o robô entrou. Amarelo: preço agora.
          {atraso != null && !terminou ? ` Dados do robô de ${atraso} s atrás.` : ''}
        </Text>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: C.fundo, padding: 16, paddingTop: 40, gap: 12 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titulo: { color: C.texto, fontSize: 20, fontWeight: '700' },
  sub: { color: C.suave, fontSize: 13, marginTop: 2 },
  botao: { borderWidth: 1, borderColor: C.linha, backgroundColor: C.painel, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
  botaoTxt: { color: C.texto, fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: C.painel, borderWidth: 1, borderColor: C.linha, borderRadius: 8, padding: 8 },
  grade: { flexDirection: 'row', gap: 1, backgroundColor: C.linha, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.linha },
  stat: { backgroundColor: C.painel, paddingVertical: 12, paddingHorizontal: 12, flex: 1 },
  statV: { color: C.texto, fontSize: 17, fontWeight: '700', fontFamily: MONO },
  statR: { color: C.suave, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 },
  nota: { color: C.suave, fontSize: 12, lineHeight: 18 },
});
