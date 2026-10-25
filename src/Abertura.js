// abertura do app: as velas do logo entram uma de cada vez, no fundo escuro
// verde sobe, vermelha desce, verde sobe (movimento firme, sem efeito de mola)
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { C } from './tema';

const CURSO = 46; // quanto cada vela anda até o lugar dela

function Vela({ cor, altura, base, v, sobe }) {
  const y = v.interpolate({ inputRange: [0, 1], outputRange: [sobe ? CURSO : -CURSO, 0] });
  const op = v.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });
  return (
    <View style={{ width: 34, height: altura * 0.56 + CURSO, justifyContent: 'flex-end', alignItems: 'center', marginBottom: base }}>
      <Animated.View style={{ alignItems: 'center', opacity: op, transform: [{ translateY: y }] }}>
        {/* só o corpo da vela, sem pavio */}
        <View style={{ width: 34, height: altura * 0.56, borderRadius: 7, backgroundColor: cor }} />
      </Animated.View>
    </View>
  );
}

export default function Abertura({ saindo }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;
  const ponto = useRef(new Animated.Value(0)).current;
  const fundo = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const entra = (v) => Animated.timing(v, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    const some = (v) => Animated.timing(v, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true });
    // verde sobe, vermelha desce, verde sobe; segura um pouco; somem juntas e recomeça
    const velas = Animated.loop(Animated.sequence([
      entra(a), entra(b), entra(c),
      Animated.delay(700),
      Animated.parallel([some(a), some(b), some(c)]),
      Animated.delay(120),
    ]));
    const pisca = Animated.loop(Animated.sequence([
      Animated.timing(ponto, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(ponto, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]));
    velas.start();
    pisca.start();
    return () => { velas.stop(); pisca.stop(); };
  }, [a, b, c, ponto]);

  useEffect(() => {
    if (saindo) Animated.timing(fundo, { toValue: 0, duration: 320, useNativeDriver: true }).start();
  }, [saindo, fundo]);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.raiz, { opacity: fundo }]}>
      <View style={s.linha}>
        <Vela cor={C.alta} altura={130} base={0} v={a} sobe />
        <Vela cor={C.baixa} altura={120} base={34} v={b} sobe={false} />
        <View style={{ alignItems: 'center' }}>
          <Animated.View style={[s.ponto, { opacity: ponto.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }), transform: [{ scale: ponto.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }] }]}>
            <View style={s.miolo} />
          </Animated.View>
          <Vela cor={C.alta} altura={160} base={70} v={c} sobe />
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  raiz: { backgroundColor: C.fundo, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  linha: { flexDirection: 'row', alignItems: 'flex-end', gap: 22 },
  ponto: { width: 40, height: 40, borderRadius: 20, borderWidth: 5, borderColor: C.destaque, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  miolo: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.destaque },
});
