import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Platform, Vibration, SafeAreaView, PermissionsAndroid } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ATIVOS, conectar } from './src/dados';
import { ESTRATEGIAS } from './src/estrategias';
import { criarMotor, carregarHistorico, atualizar, placar } from './src/motor';
import Grafico from './src/Grafico';
import HistoricoPC from './src/HistoricoPC';
import Atualizacao from './src/Atualizacao';
import Abertura from './src/Abertura';
import ControleRobo from './src/ControleRobo';
import { C } from './src/tema';

// avisos de lucro: pede a permissão de notificação e liga o vigia (continua rodando com o app fechado)
const NATIVO = Platform.OS === 'android' ? requireOptionalNativeModule('RoboNative') : null;
async function ligarAvisosDeLucro() {
  if (!NATIVO || !NATIVO.ligarAvisos) return;
  try {
    if (Platform.Version >= 33) await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS');
    NATIVO.ligarAvisos();
  } catch (e) { /* tenta na próxima abertura */ }
}

const PADRAO = { ativo: 'BTCUSDT', expira: 3, rigor: 2.5, painel: 'conf', banca: 500, valor: 10, retorno: 85, chave: '' };
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Consolas, monospace' });

const dois = (n) => String(n).padStart(2, '0');
const hora = (t) => { const d = new Date(t); return `${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`; };
const brl = (v) => 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d),)/g, '.');
const sinal = (v) => (v > 0 ? '+' : v < 0 ? '-' : '') + brl(Math.abs(v));
const numero = (s) => { const x = parseFloat(String(s).replace(',', '.')); return isFinite(x) && x >= 0 ? x : 0; };

let audio = null;
function avisar(tipo, somWeb) {
  if (Platform.OS !== 'web') {
    Vibration.vibrate(tipo === 'sinal' ? [0, 300, 150, 300, 150, 300] : 400);
    return;
  }
  if (!somWeb || !audio) return;
  const n = tipo === 'sinal' ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.22;
    o.frequency.value = n > 1 ? 980 : 660;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(audio.destination);
    o.start(t); o.stop(t + 0.2);
  }
}

function Chip({ ativo, texto, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, ativo && s.chipAtivo]}>
      <Text style={[s.chipTxt, ativo && s.chipTxtAtivo]}>{texto}</Text>
    </Pressable>
  );
}

function Seta({ dir }) {
  if (dir === 'atencao') {
    return (
      <View style={{ alignItems: 'center', gap: 5 }}>
        <View style={{ width: 7, height: 24, borderRadius: 3, backgroundColor: C.painel }} />
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.painel }} />
      </View>
    );
  }
  if (!dir) return <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 4, borderColor: C.suave }} />;
  return (
    <View style={{
      width: 0, height: 0, borderLeftWidth: 16, borderRightWidth: 16, borderLeftColor: 'transparent', borderRightColor: 'transparent',
      ...(dir === 'up' ? { borderBottomWidth: 24, borderBottomColor: C.painel } : { borderTopWidth: 24, borderTopColor: C.painel }),
    }} />
  );
}

export default function App() {
  const [cfg, setCfg] = useState(PADRAO);
  const [pronto, setPronto] = useState(false);
  const [status, setStatus] = useState({ texto: 'Conectando...', tipo: 'aviso' });
  const [, setTick] = useState(0);
  const [largura, setLargura] = useState(0);
  const [som, setSom] = useState(false);
  const [rascunho, setRascunho] = useState({});
  const [tela, setTela] = useState('pc');
  const [intro, setIntro] = useState(2); // 2 = mostrando, 1 = sumindo, 0 = fora
  useEffect(() => { ligarAvisosDeLucro(); }, []);
  useEffect(() => { const a = setTimeout(() => setIntro(1), 1700); const b = setTimeout(() => setIntro(0), 2050); return () => { clearTimeout(a); clearTimeout(b); }; }, []);
  const motor = useRef(criarMotor());
  const cfgRef = useRef(cfg);
  const somRef = useRef(false);
  cfgRef.current = cfg;
  somRef.current = som;

  const redesenhar = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    AsyncStorage.getItem('rs_cfg').then((v) => {
      if (v) { try { setCfg({ ...PADRAO, ...JSON.parse(v) }); } catch (_) {} }
      setPronto(true);
    }).catch(() => setPronto(true));
  }, []);

  const mudar = (patch) => {
    setCfg((c) => {
      const n = { ...c, ...patch };
      AsyncStorage.setItem('rs_cfg', JSON.stringify(n)).catch(() => {});
      return n;
    });
  };

  const ativo = ATIVOS.find((a) => a.id === cfg.ativo) || ATIVOS[0];

  useEffect(() => {
    if (!pronto) return;
    motor.current = criarMotor();
    redesenhar();
    const fim = conectar(ativo, cfg.chave, {
      historico: (velas) => { carregarHistorico(motor.current, velas, cfgRef.current); redesenhar(); },
      vela: (v, fechada) => {
        atualizar(motor.current, v, fechada, cfgRef.current, (id, tipo) => {
          if (id === cfgRef.current.painel) avisar(tipo, somRef.current);
        });
        redesenhar();
      },
      status: (texto, tipo) => setStatus({ texto, tipo }),
    });
    return fim;
  }, [pronto, cfg.ativo, cfg.chave, cfg.expira, cfg.rigor]);

  useEffect(() => {
    const id = setInterval(redesenhar, 1000);
    return () => clearInterval(id);
  }, []);

  const ligarSom = () => {
    try {
      if (!audio) { const AC = window.AudioContext || window.webkitAudioContext; audio = new AC(); }
      audio.resume();
    } catch (_) {}
    const n = !som;
    setSom(n);
    somRef.current = n;
    avisar('atencao', n);
  };

  const m = motor.current;
  const velas = m.velas;
  const ultima = velas[velas.length - 1];
  const S = m.S[cfg.painel];
  const est = ESTRATEGIAS.find((e) => e.id === cfg.painel);
  const P = placar(S, cfg, m.zero);
  const aberta = S.ops.find((o) => o.res === 'aberta');
  const agora = Date.now();
  const seg = (t) => Math.max(0, Math.ceil((t - agora) / 1000));
  const casas = ativo.casas;
  const variacao = velas.length > 31 ? ((ultima.c - velas[velas.length - 31].c) / velas[velas.length - 31].c) * 100 : 0;

  let painel;
  if (aberta) {
    painel = {
      fundo: aberta.dir === 'up' ? C.alta : C.baixa, seta: aberta.dir, etapa: 'Sinal confirmado',
      titulo: aberta.dir === 'up' ? 'COMPRA' : 'VENDA', cor: aberta.dir === 'up' ? C.alta : C.baixa,
      sub: `Preço de entrada ${aberta.entrada.toFixed(casas)} · expiração ${cfg.expira} min`,
      hora: hora(aberta.t), cd: `hora da entrada · termina às ${hora(aberta.fimT)} (${seg(aberta.fimT)} s)`,
    };
  } else if (S.pre) {
    painel = {
      fundo: C.destaque, seta: 'atencao', etapa: 'Atenção',
      titulo: 'Prepare-se: possível ' + (S.pre.dir === 'up' ? 'COMPRA' : 'VENDA'), cor: C.texto,
      sub: 'O robô confirma ou cancela quando a vela fechar', hora: hora(S.pre.ateT), cd: `confirmação em ${seg(S.pre.ateT)} s`,
    };
  } else {
    painel = { fundo: C.grade, seta: null, etapa: 'Monitorando', titulo: 'Aguardando', cor: C.texto, sub: 'Sem sinal por perto agora', hora: null };
  }

  const linhas = ESTRATEGIAS.map((e) => ({ e, p: placar(m.S[e.id], cfg, m.zero) })).sort((a, b) => b.p.banca - a.p.banca);
  const I = m.I;
  const rotulo = { acerto: 'Acerto', erro: 'Erro', aberta: 'Em aberto', cancelado: 'Alerta cancelado' };
  const corRes = { acerto: C.alta, erro: C.baixa, aberta: C.destaque, cancelado: C.suave };
  const corStatus = { ok: C.alta, aviso: C.destaque, erro: C.baixa }[status.tipo];

  const campo = (k, rotuloTxt, extra = {}) => (
    <View style={s.campo}>
      <Text style={s.rotulo}>{rotuloTxt}</Text>
      <TextInput
        style={s.input}
        value={rascunho[k] != null ? rascunho[k] : String(cfg[k])}
        // texto (a chave) é salvo na hora: no Android o app pode fechar antes do campo perder o foco
        onChangeText={(t) => (extra.texto ? mudar({ [k]: t.trim() }) : setRascunho((r) => ({ ...r, [k]: t })))}
        onEndEditing={() => { if (rascunho[k] != null) { mudar({ [k]: extra.texto ? rascunho[k].trim() : numero(rascunho[k]) }); setRascunho((r) => { const n = { ...r }; delete n[k]; return n; }); } }}
        onBlur={() => { if (rascunho[k] != null) { mudar({ [k]: extra.texto ? rascunho[k].trim() : numero(rascunho[k]) }); setRascunho((r) => { const n = { ...r }; delete n[k]; return n; }); } }}
        keyboardType={extra.texto ? 'default' : 'decimal-pad'}
        secureTextEntry={!!extra.secreto}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={extra.placeholder}
        placeholderTextColor={C.suave}
      />
    </View>
  );

  return (
    <SafeAreaView style={s.raiz}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.wrap}>
          <View style={s.topo}>
            <Text style={s.h1}>Robô de Sinais</Text>
            <View style={s.linhaCentro}>
              {Platform.OS === 'web' && (
                <Pressable onPress={ligarSom} style={[s.botao, som && { borderColor: C.destaque }]}>
                  <Text style={[s.botaoTxt, som && { color: C.destaque }]}>{som ? 'Som ligado' : 'Ativar som'}</Text>
                </Pressable>
              )}
            </View>
          </View>
          <Atualizacao />
          <View style={s.chips}>
            <Chip texto="Robô no PC" ativo={tela === 'pc'} onPress={() => setTela('pc')} />
            <Chip texto="Sinais ao vivo" ativo={tela === 'sinais'} onPress={() => setTela('sinais')} />
          </View>
          {tela === 'pc' ? <View style={{ gap: 12 }}><ControleRobo /><HistoricoPC /></View> : (<>
          <View style={s.linhaCentro}>
            <View style={[s.ponto, { backgroundColor: corStatus }]} />
            <Text style={[s.status, { color: corStatus }]}>{status.texto}</Text>
          </View>

          <Text style={s.h2}>Ativo</Text>
          <View style={s.chips}>
            {ATIVOS.map((a) => <Chip key={a.id} texto={a.nome} ativo={a.id === cfg.ativo} onPress={() => mudar({ ativo: a.id })} />)}
          </View>
          <View style={s.duasCol}>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Text style={s.h2}>Expiração</Text>
              <View style={s.chips}>
                {[1, 2, 3, 5].map((x) => <Chip key={x} texto={x + ' min'} ativo={cfg.expira === x} onPress={() => mudar({ expira: x })} />)}
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Text style={s.h2}>Rigor (Confluência)</Text>
              <View style={s.chips}>
                <Chip texto="Normal" ativo={cfg.rigor === 2.5} onPress={() => mudar({ rigor: 2.5 })} />
                <Chip texto="Forte" ativo={cfg.rigor === 3} onPress={() => mudar({ rigor: 3 })} />
              </View>
            </View>
          </View>

          <View style={[s.card, { padding: 10 }]} onLayout={(e) => setLargura(e.nativeEvent.layout.width - 20)}>
            <View style={s.precoLinha}>
              <Text style={s.preco}>{ultima ? ultima.c.toFixed(casas) : '—'}</Text>
              <Text style={[s.mono, { color: variacao >= 0 ? C.alta : C.baixa }]}>
                {ultima ? `${variacao >= 0 ? '+' : ''}${variacao.toFixed(2)}% (30 min)` : ''}
              </Text>
            </View>
            <Grafico velas={velas} ops={S.ops} casas={casas} largura={largura} />
            <Text style={s.legenda}>Velas de 1 minuto · linha amarela: média 9 · linha cinza: média 21</Text>
          </View>

          <Text style={s.h2}>Sinal agora · estratégia</Text>
          <View style={s.chips}>
            {ESTRATEGIAS.map((e) => <Chip key={e.id} texto={e.nome} ativo={cfg.painel === e.id} onPress={() => mudar({ painel: e.id })} />)}
          </View>

          <View style={[s.card, s.sinal]}>
            <View style={[s.seta, { backgroundColor: painel.fundo }]}><Seta dir={painel.seta} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.etapa}>{painel.etapa}</Text>
              <Text style={[s.titulo, { color: painel.cor }]}>{painel.titulo}</Text>
              <Text style={s.sub}>{painel.sub}</Text>
              {painel.hora && (
                <View style={s.relogio}>
                  <Text style={s.horaGrande}>{painel.hora}</Text>
                  <Text style={s.cd}>{painel.cd}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={s.chips}>
            <Text style={s.tag}>{est.desc}</Text>
            {I && <Text style={[s.tag, { color: I.r < 35 ? C.alta : I.r > 65 ? C.baixa : C.suave }]}>RSI {I.r.toFixed(0)}</Text>}
            {I && <Text style={[s.tag, { color: I.e9[I.n] > I.e21[I.n] ? C.alta : C.baixa }]}>{I.e9[I.n] > I.e21[I.n] ? 'Médias em alta' : 'Médias em baixa'}</Text>}
          </View>

          <Text style={s.h2}>Operações virtuais · {est.nome}</Text>
          <View style={s.grade4}>
            {[
              ['Banca atual', brl(P.banca), C.texto],
              ['Gain', '+' + brl(P.gain), C.alta],
              ['Loss', '-' + brl(P.loss), C.baixa],
              ['Resultado', sinal(P.gain - P.loss), P.gain - P.loss >= 0 ? C.alta : C.baixa],
              ['Operações', String(P.total), C.texto],
              ['Acerto', P.total ? Math.round((P.acertos / P.total) * 100) + '%' : '—', P.total && P.acertos / P.total > 0.5405 ? C.alta : C.texto],
            ].map(([r, v, cor]) => (
              <View key={r} style={s.stat}>
                <Text style={[s.statV, { color: cor }]}>{v}</Text>
                <Text style={s.statR}>{r}</Text>
              </View>
            ))}
          </View>
          {P.parada && <Text style={[s.nota, { color: C.baixa }]}>Banca zerada nesta estratégia: as operações virtuais pararam. Os sinais continuam aparecendo.</Text>}

          <Text style={s.h2}>Comparação de estratégias</Text>
          <View style={s.card}>
            {linhas.map(({ e, p }, i) => {
              const ac = p.total ? (p.acertos / p.total) * 100 : null;
              const r = p.banca - cfg.banca;
              return (
                <Pressable key={e.id} onPress={() => mudar({ painel: e.id })} style={[s.cmp, i > 0 && s.borda, cfg.painel === e.id && { backgroundColor: C.grade }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={s.linhaCentro}>
                      <Text style={s.cmpNome}>{e.nome}</Text>
                      {i === 0 && p.total > 0 && <Text style={s.melhor}>MELHOR</Text>}
                    </View>
                    <Text style={s.cmpSub}>{p.total} ops · acerto {ac == null ? '—' : ac.toFixed(0) + '%'}{p.parada ? ' · banca zerada' : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.mono, { color: C.texto }]}>{brl(p.banca)}</Text>
                    <Text style={[s.mono, { color: r >= 0 ? C.alta : C.baixa, fontSize: 12 }]}>{sinal(r)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.nota}>Todas operam o mesmo ativo ao mesmo tempo, com a mesma banca e o mesmo valor. O placar começa com as últimas 500 velas reais e continua ao vivo. Com retorno de {cfg.retorno}% é preciso acertar mais de {(100 / (1 + cfg.retorno / 100)).toFixed(1)}% para empatar.</Text>

          <Text style={s.h2}>Últimos sinais · {est.nome}</Text>
          <View style={s.card}>
            {S.ops.slice(-12).reverse().map((o, i) => {
              const v = P.pl.get(o);
              return (
                <View key={o.t + o.res} style={[s.hist, i > 0 && s.borda]}>
                  <Text style={[s.mono, { color: C.suave, width: 64 }]}>{hora(o.t)}</Text>
                  <Text style={[s.mono, { color: o.dir === 'up' ? C.alta : C.baixa, width: 72 }]}>{o.dir === 'up' ? '▲ Compra' : '▼ Venda'}</Text>
                  <Text style={[s.histRes, { color: corRes[o.res] }]}>{rotulo[o.res]}</Text>
                  <Text style={[s.mono, { color: corRes[o.res], marginLeft: 'auto' }]}>{v === 'sem banca' ? 'Sem banca' : v == null ? '—' : sinal(v)}</Text>
                </View>
              );
            })}
            {S.ops.length === 0 && <Text style={[s.nota, { padding: 12 }]}>Nenhum sinal ainda</Text>}
          </View>

          <Text style={s.h2}>Ajustes</Text>
          <View style={s.duasCol}>
            {campo('banca', 'Banca inicial (R$)')}
            {campo('valor', 'Valor por operação (R$)')}
            {campo('retorno', 'Retorno no acerto (%)')}
          </View>
          {campo('chave', 'Chave das cotações de forex (Twelve Data)', { texto: true, secreto: true, placeholder: 'Cole a chave aqui' })}
          <Pressable onPress={() => { m.zero = m.fechadaAte + 60000; redesenhar(); }} style={[s.botao, { alignSelf: 'flex-start' }]}>
            <Text style={s.botaoTxt}>Zerar contagem a partir de agora</Text>
          </Pressable>
          <Text style={s.nota}>Bitcoin e Ethereum vêm da Binance, ao vivo. Os pares de forex e o ouro precisam da chave e atualizam a cada minuto, só em dia útil (no fim de semana o forex fica fechado). As operações são só para análise: nada é enviado para a corretora. Resultado passado não garante resultado futuro.</Text>
          </>)}
        </View>
      </ScrollView>
      {intro > 0 && <Abertura saindo={intro === 1} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: C.fundo },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  wrap: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 12 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  h1: { color: C.texto, fontSize: 24, fontWeight: '700' },
  h2: { color: C.suave, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 },
  linhaCentro: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  status: { fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: C.linha, backgroundColor: C.painel, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 11 },
  chipAtivo: { borderColor: C.destaque, backgroundColor: C.grade },
  chipTxt: { color: C.suave, fontSize: 14, fontWeight: '600' },
  chipTxtAtivo: { color: C.destaque },
  duasCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { backgroundColor: C.painel, borderWidth: 1, borderColor: C.linha, borderRadius: 8, overflow: 'hidden' },
  precoLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, paddingBottom: 8 },
  preco: { color: C.texto, fontSize: 24, fontWeight: '700', fontFamily: MONO },
  mono: { fontFamily: MONO, fontSize: 13 },
  legenda: { color: C.suave, fontSize: 11, paddingTop: 6, paddingHorizontal: 4 },
  sinal: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 16 },
  seta: { width: 64, height: 64, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  etapa: { color: C.suave, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontFamily: MONO },
  titulo: { fontSize: 21, fontWeight: '700', marginTop: 2 },
  sub: { color: C.suave, fontSize: 14, marginTop: 2 },
  relogio: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 6 },
  horaGrande: { color: C.texto, fontSize: 24, fontWeight: '700', fontFamily: MONO },
  cd: { color: C.suave, fontSize: 13, fontFamily: MONO },
  tag: { color: C.suave, fontSize: 12, fontFamily: MONO, borderWidth: 1, borderColor: C.linha, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 7 },
  grade4: { flexDirection: 'row', flexWrap: 'wrap', gap: 1, backgroundColor: C.linha, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.linha },
  stat: { backgroundColor: C.painel, paddingVertical: 10, paddingHorizontal: 12, flexGrow: 1, flexBasis: '32%' },
  statV: { fontSize: 17, fontWeight: '700', fontFamily: MONO },
  statR: { color: C.suave, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 },
  nota: { color: C.suave, fontSize: 13, lineHeight: 19 },
  cmp: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12 },
  borda: { borderTopWidth: 1, borderTopColor: C.linha },
  cmpNome: { color: C.texto, fontSize: 15, fontWeight: '700' },
  cmpSub: { color: C.suave, fontSize: 12, marginTop: 2 },
  melhor: { color: C.fundo, backgroundColor: C.destaque, fontSize: 10, fontWeight: '800', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3, overflow: 'hidden' },
  hist: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 12 },
  histRes: { fontSize: 13, fontWeight: '600' },
  campo: { flex: 1, minWidth: 150, gap: 4 },
  rotulo: { color: C.suave, fontSize: 12 },
  input: { color: C.texto, backgroundColor: C.painel, borderWidth: 1, borderColor: C.linha, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 10, fontSize: 15, fontFamily: MONO },
  botao: { borderWidth: 1, borderColor: C.linha, backgroundColor: C.painel, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12 },
  botaoTxt: { color: C.texto, fontSize: 14, fontWeight: '600' },
});
