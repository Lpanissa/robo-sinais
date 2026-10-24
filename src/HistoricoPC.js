// resumo do que o robô fez no PC (extensão da Olymp), lido do Supabase
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { C } from './tema';
import OrdemAoVivo from './OrdemAoVivo';

const SB_URL = 'https://fyxksvydxwvygjebanno.supabase.co/rest/v1/sinais_ordens';
const SB_CHAVE = 'sb_publishable_HA-Ez2aumnGCLZt2rf-bsQ_MqipvpWK';
const CODIGO = 'rJAShHACX2c91d6HpYqypp_1'; // o mesmo da extensão
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Consolas, monospace' });

const dois = (n) => String(n).padStart(2, '0');
const horaDe = (iso) => { const d = new Date(iso); return `${dois(d.getHours())}:${dois(d.getMinutes())}`; };
const inicioDoDia = (desloc) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - desloc); return d; };
const nomeDia = (desloc) => (desloc === 0 ? 'Hoje' : desloc === 1 ? 'Ontem' : (() => { const d = inicioDoDia(desloc); return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`; })());
const din = (v, conta) => {
  const moeda = conta === 'demo' ? 'Đ ' : 'US$ ';
  const s = v > 0 ? '+' : v < 0 ? '-' : '';
  return s + moeda + Math.abs(v).toFixed(2).replace('.', ',');
};

function Chip({ ativo, texto, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, ativo && s.chipAtivo]}>
      <Text style={[s.chipTxt, ativo && s.chipTxtAtivo]}>{texto}</Text>
    </Pressable>
  );
}

export default function HistoricoPC() {
  const [ordens, setOrdens] = useState(null);
  const [erro, setErro] = useState('');
  const [conta, setConta] = useState('real');
  const [dia, setDia] = useState(0);
  const [atualizado, setAtualizado] = useState(null);
  const [aberta, setAberta] = useState(null); // ordem aberta no gráfico ao vivo

  const carregar = useCallback(async () => {
    try {
      const de = inicioDoDia(dia), ate = inicioDoDia(dia - 1);
      const url = `${SB_URL}?select=*&hora=gte.${de.toISOString()}&hora=lt.${ate.toISOString()}&order=hora.desc&limit=500`;
      const r = await fetch(url, { headers: { apikey: SB_CHAVE, Authorization: 'Bearer ' + SB_CHAVE, 'x-codigo': CODIGO } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      setOrdens(await r.json());
      setErro('');
      setAtualizado(new Date());
    } catch (e) {
      setErro('Sem conexão com o histórico. Tentando de novo...');
    }
  }, [dia]);

  useEffect(() => {
    setOrdens(null);
    carregar();
    const id = setInterval(carregar, 20000);
    return () => clearInterval(id);
  }, [carregar]);

  // ordens que o robô perdeu o acompanhamento (sem resultado) não aparecem
  const lista = (ordens || []).filter((o) => (conta === 'todas' || o.conta === conta) && !/^sem resultado/.test(o.situacao || ''));
  const fechadas = lista.filter((o) => o.resultado != null);
  const ganhos = fechadas.filter((o) => o.resultado > 0).length;
  const perdas = fechadas.filter((o) => o.resultado < 0).length;
  const total = fechadas.reduce((t, o) => t + Number(o.resultado), 0);
  const acerto = ganhos + perdas ? Math.round((100 * ganhos) / (ganhos + perdas)) : null;
  const antes = fechadas.filter((o) => o.fechou_antes);
  const abertas = lista.filter((o) => o.resultado == null && /andamento/.test(o.situacao || '')).length;
  const moedaConta = conta === 'demo' ? 'demo' : 'real';
  const corTotal = total > 0 ? C.alta : total < 0 ? C.baixa : C.texto;

  return (
    <View style={{ gap: 12 }}>
      <View style={s.chips}>
        {[2, 1, 0].map((d) => <Chip key={d} texto={nomeDia(d)} ativo={dia === d} onPress={() => setDia(d)} />)}
        <View style={{ width: 10 }} />
        <Chip texto="Real" ativo={conta === 'real'} onPress={() => setConta('real')} />
        <Chip texto="Demo" ativo={conta === 'demo'} onPress={() => setConta('demo')} />
      </View>

      <View style={s.card}>
        <Text style={s.rotulo}>Resultado {dia === 0 ? 'de hoje' : 'do dia'}</Text>
        <Text style={[s.total, { color: corTotal }]}>{din(total, moedaConta)}</Text>
        <Text style={s.sub}>
          {ordens == null ? 'Carregando...' : fechadas.length ? `${fechadas.length} ${fechadas.length === 1 ? 'operação' : 'operações'}${abertas ? ` · ${abertas} em andamento` : ''}` : abertas ? `${abertas} em andamento` : 'Nenhuma operação neste dia'}
        </Text>
      </View>

      <View style={s.grade}>
        <View style={s.stat}><Text style={[s.statV, { color: acerto == null ? C.texto : acerto >= 56 ? C.alta : C.baixa }]}>{acerto == null ? '–' : acerto + '%'}</Text><Text style={s.statR}>Acerto</Text></View>
        <View style={s.stat}><Text style={[s.statV, { color: C.alta }]}>{ganhos}</Text><Text style={s.statR}>Ganhos</Text></View>
        <View style={s.stat}><Text style={[s.statV, { color: C.baixa }]}>{perdas}</Text><Text style={s.statR}>Perdas</Text></View>
        <View style={s.stat}><Text style={s.statV}>{antes.length}</Text><Text style={s.statR}>Fechou antes</Text></View>
      </View>

      {!!erro && <Text style={[s.sub, { color: C.destaque }]}>{erro}</Text>}

      <View style={s.card0}>
        {lista.length === 0 && ordens != null && <Text style={[s.sub, { padding: 14 }]}>As ordens que o robô fizer no PC aparecem aqui.</Text>}
        {lista.map((o, i) => {
          const cor = o.resultado > 0 ? C.alta : o.resultado < 0 ? C.baixa : C.suave;
          const dir = o.dir === 'up' ? 'Compra' : o.dir === 'down' ? 'Venda' : 'Manual';
          return (
            <Pressable key={o.id} onPress={() => setAberta(o)} style={[s.linha, i > 0 && s.borda]}>
              <Text style={s.hora}>{horaDe(o.hora)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.ativo}>{o.ativo || '—'} <Text style={{ color: o.dir === 'up' ? C.alta : o.dir === 'down' ? C.baixa : C.suave }}>{dir}</Text></Text>
                <Text style={s.det} numberOfLines={1}>{o.estrategia}{o.fechou_antes ? ' · fechou antes' : ''}</Text>
              </View>
              <Text style={[s.res, { color: cor }]}>{o.resultado == null ? (/andamento/.test(o.situacao || '') ? 'aberta ›' : o.situacao) : din(Number(o.resultado), o.conta)}</Text>
            </Pressable>
          );
        })}
      </View>
      {aberta && <OrdemAoVivo ordem={aberta} fechar={() => setAberta(null)} />}
      {atualizado && <Text style={s.nota}>Atualiza sozinho a cada 20 segundos · última às {dois(atualizado.getHours())}:{dois(atualizado.getMinutes())}:{dois(atualizado.getSeconds())}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: C.linha, backgroundColor: C.painel, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 11 },
  chipAtivo: { borderColor: C.destaque, backgroundColor: C.grade },
  chipTxt: { color: C.suave, fontSize: 14, fontWeight: '600' },
  chipTxtAtivo: { color: C.destaque },
  card: { backgroundColor: C.painel, borderWidth: 1, borderColor: C.linha, borderRadius: 8, padding: 16 },
  card0: { backgroundColor: C.painel, borderWidth: 1, borderColor: C.linha, borderRadius: 8, overflow: 'hidden' },
  rotulo: { color: C.suave, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  total: { fontSize: 32, fontWeight: '700', fontFamily: MONO, marginTop: 4 },
  sub: { color: C.suave, fontSize: 13, marginTop: 2 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 1, backgroundColor: C.linha, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.linha },
  stat: { backgroundColor: C.painel, paddingVertical: 10, paddingHorizontal: 12, flexGrow: 1, flexBasis: '22%', minWidth: 70 },
  statV: { color: C.texto, fontSize: 18, fontWeight: '700', fontFamily: MONO },
  statR: { color: C.suave, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12 },
  borda: { borderTopWidth: 1, borderTopColor: C.linha },
  hora: { color: C.suave, fontFamily: MONO, fontSize: 13 },
  ativo: { color: C.texto, fontSize: 14, fontWeight: '700' },
  det: { color: C.suave, fontSize: 12, marginTop: 1 },
  res: { fontFamily: MONO, fontSize: 14, fontWeight: '700' },
  nota: { color: C.suave, fontSize: 12 },
});
