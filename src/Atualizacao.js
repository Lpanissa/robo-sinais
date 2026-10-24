// atualização do app sozinho: procura versão nova, baixa e abre o instalador; depois avisa o que mudou
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import build from '../build.json';
import { C } from './tema';

const N = Platform.OS === 'android' ? requireOptionalNativeModule('RoboNative') : null;
const ler = (txt) => { try { return JSON.parse(txt) || {}; } catch (e) { return {}; } };

export default function Atualizacao() {
  const [aviso, setAviso] = useState(null); // { tipo: 'nova'|'baixando'|'feito'|'erro', texto }
  const tentado = useRef('');

  const instalar = useCallback(async (sha) => {
    tentado.current = sha;
    setAviso({ tipo: 'baixando', texto: 'Baixando a versão nova do app...' });
    const r = await N.instalarAtualizacao().catch(() => 'erro');
    if (r === 'ok') setAviso({ tipo: 'nova', texto: 'Toque em Atualizar na tela do Android para terminar.', sha });
    else if (r === 'permissao') setAviso({ tipo: 'nova', texto: 'Permita instalar apps do Robô de Sinais e toque em Atualizar agora.', sha });
    else setAviso({ tipo: 'nova', texto: 'Não deu para baixar agora. Tente de novo.', sha });
  }, []);

  const verificar = useCallback(async () => {
    if (!N) return;
    const r = ler(await N.verAtualizacao().catch(() => ''));
    if (r.sha && r.sha !== tentado.current) instalar(r.sha); // versão nova: já baixa e abre o instalador
    return r;
  }, [instalar]);

  useEffect(() => {
    if (!N || !build.sha || build.sha === 'dev') return undefined;
    N.definirVersao(build.sha);
    (async () => {
      // acabou de atualizar: mostra o que mudou (uma vez)
      const antes = await AsyncStorage.getItem('rs_versao').catch(() => null);
      await AsyncStorage.setItem('rs_versao', build.sha).catch(() => {});
      const r = await verificar();
      if (antes && antes !== build.sha) setAviso({ tipo: 'feito', texto: (r && r.notas) || 'App atualizado.' });
    })();
    const id = setInterval(verificar, 30 * 60000);
    return () => clearInterval(id);
  }, [verificar]);

  if (!aviso) return null;
  const cor = aviso.tipo === 'feito' ? C.alta : C.destaque;
  return (
    <View style={{ backgroundColor: C.painel, borderWidth: 1, borderColor: cor, borderRadius: 8, padding: 12, gap: 6 }}>
      <Text style={{ color: cor, fontSize: 13, fontWeight: '700' }}>{aviso.tipo === 'feito' ? 'App atualizado' : 'Versão nova do app'}</Text>
      <Text style={{ color: C.texto, fontSize: 13, lineHeight: 19 }}>{aviso.texto}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {aviso.tipo === 'nova' && (
          <Pressable onPress={() => instalar(aviso.sha)} style={{ borderWidth: 1, borderColor: C.destaque, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 12 }}>
            <Text style={{ color: C.destaque, fontSize: 13, fontWeight: '700' }}>Atualizar agora</Text>
          </Pressable>
        )}
        {aviso.tipo !== 'baixando' && (
          <Pressable onPress={() => setAviso(null)} style={{ borderWidth: 1, borderColor: C.linha, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 12 }}>
            <Text style={{ color: C.suave, fontSize: 13, fontWeight: '600' }}>Fechar</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
