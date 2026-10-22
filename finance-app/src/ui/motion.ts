import {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from './tokens';

// Motion helpers on top of the §6 tokens. Every animation passes
// `ReduceMotion.System`, so with "Reduce Motion" on it jumps to its end state.

export const timing = (duration: number) => ({ duration, reduceMotion: ReduceMotion.System });
export const spring = { ...motion.spring, reduceMotion: ReduceMotion.System };

/** Discreet press response for buttons and rows: scales to `pressedScale` in 100 ms. */
export function usePressScale(pressedScale = 0.97) {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return {
    style,
    onPressIn: () => {
      if (!reduced) scale.set(withTiming(pressedScale, timing(motion.press)));
    },
    onPressOut: () => {
      scale.set(withSpring(1, spring));
    },
  };
}
