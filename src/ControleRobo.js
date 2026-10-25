// controle remoto do robô do PC: mostra se ele está online e muda as configurações dele
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from 'react-native';
import { ESTRATEGIAS } from './estrategias';
import { C } from './tema';

const URL_CTRL = 'https://fyxksvydxwvygjebanno.supabase.co/rest/v1/sinais_controle';
const SB_CHAVE = 'sb_publishable_HA-Ez2aumnGCLZt2rf-bsQ_MqipvpWK';
const CODIGO = 'rJAShHACX2c91d6HpYqypp_1'; // o mesmo da extensão
const H = { apikey: SB_CHAVE, Authorization: 'Bearer ' + SB_CHAVE, 'Content-Type': 'application/json', 'x-codigo': CODIGO };
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Consolas, monospace' });

async function ler() {
  const r = await fetch(`${URL_CTRL}?select=*&codigo=eq.${CODIGO}`, { headers: H });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json())[0] || null;
}
async function gravar(cfg, rev) {
  const r = await fetch(`${URL_CTRL}?on_conflict=codigo`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ codigo: CODIGO, cfg, rev, origem: 'app', atualizado_em: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}

function Chip({ ativo, texto, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, ativo && s.chipAtivo]}>
      <Text style={[s.chipTxt, ativo && s.chipTxtAtivo]}>{texto}</Text>
    </Pressable>
  );
}
function Opcoes({ titulo, valor, opcoes, mudar }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.rotulo}>{titulo}</Text>
      <View style={s.chips}>{opcoes.map(([v, t]) => <Chip key={String(v)} texto={t} ativo={valor === v || (typeof v === 'number' && Number(valor) === v)} onPress={() => mudar(v)} />)}</View>
    </View>
  );
}
function Numero({ titulo, valor, mudar }) {
  const [txt, setTxt] = useState(null);
  const salvar = () => { if (txt == null) return; const n = parseFloat(String(txt).replace(',', '.')); mudar(isFinite(n) && n >= 0 ? n : 0); setTxt(null); };
  return (
    <View style={s.campo}>
      <Text style={s.rotulo}>{titulo}</Text>
      <TextInput style={s.input} value={txt != null ? txt : String(valor ?? 0)} onChangeText={setTxt} onEndEditing={salvar} onBlur={salvar} keyboardType="decimal-pad" />
    </View>
  );
}

export default function ControleRobo() {
  const [linha, setLinha] = useState(null);
  const [erro, setErro] = useState('');
  const [abrirAjustes, setAbrirAjustes] = useState(false);
  const [verTestados, setVerTestados] = useState(false); // lista de ativos testados fechada: mostra só o ativo atual
  const [salvando, setSalvando] = useState(false);
  const local = useRef(null); // mudança feita aqui, esperando o PC confirmar

  const carregar = useCallback(async () => {
    try {
      const l = await ler();
      // enquanto o PC não confirmou a mudança feita aqui, mostra a nossa versão
      if (local.current && l && (l.rev || 0) < local.current.rev) l.cfg = local.current.cfg;
      else local.current = null;
      setLinha(l); setErro('');
    } catch (e) { setErro('Sem conexão com o robô agora.'); }
  }, []);

  useEffect(() => { carregar(); const id = setInterval(carregar, 15000); return () => clearInterval(id); }, [carregar]);

  const cfg = (linha && linha.cfg) || {};
  const mudar = async (patch) => {
    if (!linha) return;
    const novo = { ...cfg, ...patch };
    const rev = (linha.rev || 0) + 1;
    local.current = { cfg: novo, rev };
    setLinha({ ...linha, cfg: novo, rev });
    setSalvando(true);
    try { await gravar(novo, rev); setErro(''); } catch (e) { setErro('Não deu para mandar para o robô. Tente de novo.'); }
    setSalvando(false);
  };

  // janelas do robô que mandaram notícia nos últimos 2 minutos
  const janelas = Object.values((linha && linha.estado) || {}).filter((e) => e && Date.now() - (e.ts || 0) < 2 * 60000);
  const online = janelas.length > 0;
  const principal = janelas[0] || {};
  const ligado = !!cfg.ligado;

  return (
    <View style={{ gap: 12 }}>
      <View style={s.card}>
        <View style={s.linha}>
          <View style={[s.luz, { backgroundColor: !online ? C.suave : ligado ? C.alta : C.baixa }]} />
          <Text style={s.titulo}>{!linha ? 'Procurando o robô...' : !online ? 'Robô do PC offline' : ligado ? 'Robô ligado' : 'Robô desligado'}</Text>
        </View>
        <Text style={s.sub}>
          {online ? `${janelas.length} ${janelas.length === 1 ? 'janela' : 'janelas'} · ${janelas.map((j) => j.ativo || '?').join(', ')} · versão ${principal.versao || '?'}` : linha ? 'A Olymp precisa estar aberta no PC com o robô.' : ''}
        </Text>
        {online && principal.saldo != null && (
          <View style={s.saldoBox}>
            <Text style={s.saldoRot}>Saldo na Olymp {principal.conta === 'demo' ? '(demo)' : '(real)'}</Text>
            <Text style={s.saldoV}>{principal.conta === 'demo' ? 'Đ ' : 'US$ '}{Number(principal.saldo).toFixed(2).replace('.', ',')}</Text>
          </View>
        )}
        {online && !!principal.parado &&<Text style={[s.sub, { color: C.destaque }]}>Parado: {principal.parado}</Text>}
        {online && !principal.parado && !!principal.status && <Text style={s.sub} numberOfLines={2}>{principal.status}</Text>}
        <Pressable disabled={!linha || salvando} onPress={() => mudar({ ligado: !ligado })} style={[s.botaoGrande, { backgroundColor: ligado ? C.baixa : C.alta, opacity: !linha ? 0.5 : 1 }]}>
          <Text style={s.botaoGrandeTxt}>{ligado ? 'Desligar o robô' : 'Ligar o robô'}</Text>
        </Pressable>
        {!!erro && <Text style={[s.sub, { color: C.destaque }]}>{erro}</Text>}
      </View>

      {online && Array.isArray(principal.ranking) && principal.ranking.length > 0 && (
        <View style={s.card}>
          <Pressable onPress={() => setVerTestados(!verTestados)} style={[s.linha, { justifyContent: 'space-between' }]}>
            <Text style={s.titulo}>Ativos testados <Text style={[s.sub, { fontWeight: '400' }]}>({principal.ranking.length})</Text></Text>
            <Text style={{ color: C.suave, fontSize: 18, fontWeight: '700', paddingHorizontal: 6 }}>{verTestados ? '▴' : '▾'}</Text>
          </Pressable>
          {verTestados && <Text style={s.sub}>Acerto da melhor estratégia de cada ativo no teste. Só opera o que passa de {principal.minAcerto ?? cfg.minAcerto}%.</Text>}
          {(verTestados ? principal.ranking : [principal.ranking.find((r) => r.t === principal.ativo) || principal.ranking[0]]).map((r) => (
            <View key={r.t} style={[s.linha, { justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.linha }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.texto, fontSize: 14, fontWeight: '700' }}>{r.t}</Text>
                <Text style={s.sub} numberOfLines={1}>{r.erro ? r.erro : r.nome ? `${r.nome}${r.exp ? ` · ${r.exp} min` : ''} · ${r.n} sinais` : 'poucos sinais para testar'}</Text>
              </View>
              <Text style={{ fontFamily: MONO, fontSize: 15, fontWeight: '700', color: r.ok ? C.alta : C.suave }}>{r.ac == null ? '–' : `${r.ac}%`}{r.ok ? '' : r.ac == null ? '' : ' ✕'}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={() => setAbrirAjustes(!abrirAjustes)} style={[s.card, s.linha, { justifyContent: 'space-between' }]}>
        <Text style={s.titulo}>Configurações do robô</Text>
        <Text style={[s.titulo, { color: C.suave }]}>{abrirAjustes ? '–' : '+'}</Text>
      </Pressable>

      {abrirAjustes && linha && (
        <View style={[s.card, { gap: 14 }]}>
          <Pressable onPress={() => mudar({ minAcerto: 60, minOps: 60, sempreLeitura: 0, modo: 'todas', autoAtivo: 1 })} style={[s.botaoGrande, { backgroundColor: C.destaque, marginTop: 0 }]}>
            <Text style={s.botaoGrandeTxt}>Modo mais assertivo (só acima de 60% no teste)</Text>
          </Pressable>
          <Opcoes titulo="Ativo" valor={cfg.autoAtivo ? 1 : 0} opcoes={[[0, 'O que estiver aberto'], [1, 'O robô escolhe o melhor']]} mudar={(v) => mudar({ autoAtivo: v })} />
          <Opcoes titulo="Leitura de vela + suporte/resistência" valor={cfg.sempreLeitura ? 1 : 0} opcoes={[[1, 'Sempre operar'], [0, 'Só se passar no teste']]} mudar={(v) => mudar({ sempreLeitura: v })} />
          <Opcoes titulo="Como escolher" valor={cfg.modo} opcoes={[['todas', 'Todas aprovadas'], ['melhor', 'Só a melhor'], ['manual', 'Eu escolho']]} mudar={(v) => mudar({ modo: v })} />
          {cfg.modo === 'manual' && (
            <>
              <Opcoes titulo="Estratégia" valor={cfg.estrategia} opcoes={ESTRATEGIAS.map((e) => [e.id, e.nome])} mudar={(v) => mudar({ estrategia: v })} />
              <Opcoes titulo="Velas" valor={cfg.tfManual} opcoes={[[1, '1 min'], [5, '5 min']]} mudar={(v) => mudar({ tfManual: v })} />
              <Opcoes titulo="Expiração" valor={cfg.expira} opcoes={[1, 2, 3, 5, 10, 15].map((m) => [m, m + ' min'])} mudar={(v) => mudar({ expira: v })} />
            </>
          )}
          <Opcoes titulo="Tipo de entrada" valor={cfg.modoValor} opcoes={[['percent', '% da banca'], ['fixo', 'Valor fixo']]} mudar={(v) => mudar({ modoValor: v })} />
          <View style={s.duas}>
            {cfg.modoValor === 'percent'
              ? <Numero titulo="% da banca por operação" valor={cfg.percent} mudar={(n) => mudar({ percent: n })} />
              : <Numero titulo="Valor por operação" valor={cfg.valor} mudar={(n) => mudar({ valor: n })} />}
            <Numero titulo="Máx. operações abertas (0 = sem limite)" valor={cfg.maxAbertas} mudar={(n) => mudar({ maxAbertas: n })} />
          </View>
          <Opcoes titulo="Fechar antes no lucro" valor={cfg.fecharModo} opcoes={[['auto', 'Automático (o robô decide)'], ['percent', '% do lucro cheio'], ['valor', 'Valor (US$)']]} mudar={(v) => mudar({ fecharModo: v })} />
          {cfg.fecharModo !== 'auto' && <Numero titulo="Alvo do fechar antes (0 = nunca)" valor={cfg.fecharAlvo} mudar={(n) => mudar({ fecharAlvo: n })} />}
          <Opcoes titulo="Fechar antes também nas minhas ordens manuais" valor={cfg.fecharManuais ? 1 : 0} opcoes={[[0, 'Não, só nas do robô'], [1, 'Sim, nas minhas também']]} mudar={(v) => mudar({ fecharManuais: v })} />
          <View style={s.duas}>
            <Numero titulo="Meta de ganho por dia (0 = sem meta)" valor={cfg.metaGanhoDia} mudar={(n) => mudar({ metaGanhoDia: n })} />
            <Numero titulo="Limite de perda por dia (0 = sem limite)" valor={cfg.limitePerdaDia} mudar={(n) => mudar({ limitePerdaDia: n })} />
            <Numero titulo="Parar após perdas seguidas (0 = nunca)" valor={cfg.maxPerdasSeguidas} mudar={(n) => mudar({ maxPerdasSeguidas: n })} />
            <Numero titulo="Parar se perder na sessão (0 = nunca)" valor={cfg.limitePerda} mudar={(n) => mudar({ limitePerda: n })} />
            <Numero titulo="Acerto mínimo no teste (%)" valor={cfg.minAcerto} mudar={(n) => mudar({ minAcerto: n })} />
            <Numero titulo="Sinais mínimos no teste" valor={cfg.minOps} mudar={(n) => mudar({ minOps: n })} />
          </View>
          <Text style={s.nota}>As mudanças chegam no robô do PC em até 15 segundos.</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.painel, borderWidth: 1, borderColor: C.linha, borderRadius: 8, padding: 14, gap: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  luz: { width: 10, height: 10, borderRadius: 5 },
  saldoBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', backgroundColor: C.fundo, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, marginTop: 2 },
  saldoRot: { color: C.suave, fontSize: 13 },
  saldoV: { color: C.texto, fontSize: 18, fontWeight: '700', fontFamily: MONO },
  titulo: { color: C.texto, fontSize: 16, fontWeight: '700' },
  sub: { color: C.suave, fontSize: 13 },
  botaoGrande: { borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  botaoGrandeTxt: { color: C.fundo, fontSize: 15, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: C.linha, backgroundColor: C.fundo, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10 },
  chipAtivo: { borderColor: C.destaque, backgroundColor: C.grade },
  chipTxt: { color: C.suave, fontSize: 13, fontWeight: '600' },
  chipTxtAtivo: { color: C.destaque },
  rotulo: { color: C.suave, fontSize: 12 },
  duas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  campo: { flexGrow: 1, flexBasis: '45%', minWidth: 140, gap: 4 },
  input: { color: C.texto, backgroundColor: C.fundo, borderWidth: 1, borderColor: C.linha, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 10, fontSize: 15, fontFamily: MONO },
  nota: { color: C.suave, fontSize: 12 },
});
