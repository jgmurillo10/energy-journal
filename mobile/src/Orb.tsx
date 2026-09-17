import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export type OrbMode = 'idle' | 'speaking' | 'listening' | 'thinking';

const COLORS: Record<OrbMode, [string, string]> = {
  idle: ['#38bdf8', '#6366f1'],
  speaking: ['#34d399', '#22d3ee'],
  listening: ['#f472b6', '#fb7185'],
  thinking: ['#a78bfa', '#38bdf8'],
};

const SIZE = 210;

/** The single control of the app: it breathes on its own and swells with the voice. */
export default function Orb({
  mode,
  level,
  onPress,
  disabled,
}: {
  mode: OrbMode;
  level: number;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const breathe = useRef(new Animated.Value(0)).current;
  const voice = useRef(new Animated.Value(0)).current;
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  useEffect(() => {
    Animated.spring(voice, { toValue: level, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [level, voice]);

  useEffect(() => {
    Animated.spring(grow, {
      toValue: mode === 'listening' ? 1 : 0,
      useNativeDriver: true,
      speed: 10,
      bounciness: 8,
    }).start();
  }, [mode, grow]);

  const scale = Animated.add(
    Animated.add(
      breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }),
      voice.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }),
    ),
    grow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
  );

  return (
    <Pressable onPress={onPress} disabled={disabled || !onPress} hitSlop={20}>
      <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
        <View style={[styles.halo, { shadowColor: COLORS[mode][0] }]} />
        <LinearGradient colors={COLORS[mode]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.orb}>
          <LinearGradient
            colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
            start={{ x: 0.3, y: 0 }}
            end={{ x: 0.7, y: 0.8 }}
            style={styles.sheen}
          />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    shadowOpacity: 0.85,
    shadowRadius: 45,
    shadowOffset: { width: 0, height: 0 },
    elevation: 24,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  orb: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden' },
  sheen: { position: 'absolute', top: 12, left: 20, right: 40, height: SIZE * 0.55, borderRadius: SIZE / 2 },
});
