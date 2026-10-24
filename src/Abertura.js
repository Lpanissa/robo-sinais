// abertura do app: as velas do logo subindo e descendo, no fundo escuro
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { C } from './tema';

function Vela({ cor, altura, base, v }) {
  // corpo e pavio crescem e encolhem juntos (escala vertical a partir da base)
  const escala = v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  return (
    <View style={{ width: 34, height: 170, justifyContent: 'flex-end', alignItems: 'center', marginBottom: base }}>
      <Animated.View style={{ alignItems: 'center', transform: [{ translateY: Animated.multiply(Animated.subtract(1, escala), altura / 2) }, { scaleY: escala }] }}>
        <View style={{ width: 6, height: altura * 0.22, borderRadius: 3, backgroundColor: cor }} />
        <View style={{ width: 34, height: altura * 0.56, borderRadius: 7, backgroundColor: cor }} />
        <View style={{ width: 6, height: altura * 0.22, borderRadius: 3, backgroundColor: cor }} />
      </Animated.View>
    </View>
  );
}

export default function Abertura({ saindo }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(1)).current;
  const c = useRef(new Animated.Value(0)).current;
  const ponto = useRef(new Animated.Value(0)).current;
  const fundo = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const vai = (v, de, para, atraso) => Animated.loop(Animated.sequence([
      Animated.delay(atraso),
      Animated.timing(v, { toValue: para, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: de, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const anims = [vai(a, 0, 1, 0), vai(b, 1, 0, 140), vai(c, 0, 1, 280),
      Animated.loop(Animated.sequence([
        Animated.timing(ponto, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(ponto, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]))];
    anims.forEach((x) => x.start());
    return () => anims.forEach((x) => x.stop());
  }, [a, b, c, ponto]);

  useEffect(() => {
    if (saindo) Animated.timing(fundo, { toValue: 0, duration: 320, useNativeDriver: true }).start();
  }, [saindo, fundo]);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.raiz, { opacity: fundo }]}>
      <View style={s.linha}>
        <Vela cor={C.alta} altura={130} base={0} v={a} />
        <Vela cor={C.baixa} altura={120} base={34} v={b} />
        <View style={{ alignItems: 'center' }}>
          <Animated.View style={[s.ponto, { opacity: ponto.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }), transform: [{ scale: ponto.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }] }]}>
            <View style={s.miolo} />
          </Animated.View>
          <Vela cor={C.alta} altura={160} base={70} v={c} />
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
