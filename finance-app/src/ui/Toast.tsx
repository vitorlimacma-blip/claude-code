import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Icon } from './icons';
import { useTheme } from './theme';
import { motion } from './tokens';

export interface ToastOptions {
  message: string;
  tone?: 'neutral' | 'success' | 'error';
  /** E.g. "Desfazer". */
  action?: { label: string; onPress: () => void };
  /** ms; longer when there is an action, so it can be reached. */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => undefined);
const ToastOffsetContext = createContext<(offset: number) => void>(() => undefined);

/** Brief confirmation at the bottom of the screen, also announced to screen readers. */
export function useToast() {
  return useContext(ToastContext);
}

/**
 * Lifts toasts by `offset` while the calling screen is focused, for screens
 * with their own bar at the bottom (the Assistente's message box).
 */
export function useToastOffset(offset: number) {
  const setOffset = useContext(ToastOffsetContext);
  useFocusEffect(
    useCallback(() => {
      setOffset(offset);
      return () => setOffset(0);
    }, [offset, setOffset])
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [offset, setOffset] = useState(0);
  const counter = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    counter.current += 1;
    setToast({ ...options, id: counter.current });
    AccessibilityInfo.announceForAccessibility(options.message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.duration ?? (toast.action ? 6000 : 3500));
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      <ToastOffsetContext.Provider value={setOffset}>
        {children}
        {toast && <ToastView key={toast.id} toast={toast} offset={offset} onClose={() => setToast(null)} />}
      </ToastOffsetContext.Provider>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, offset, onClose }: { toast: ToastState; offset: number; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const icon = toast.tone === 'success' ? 'checkmark' : toast.tone === 'error' ? 'alert-outline' : 'information-circle-outline';
  // Inverted surface so it stands out on any screen.
  const bg = theme.colors.textPrimary;
  const fg = theme.colors.background;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 72 + offset }]}>
      <Animated.View
        entering={FadeInDown.duration(motion.feedback)}
        exiting={FadeOutDown.duration(motion.feedback)}
        accessibilityLiveRegion="polite"
        style={[styles.toast, { backgroundColor: bg, borderRadius: theme.radius.md }]}
      >
        <Icon name={icon} size={20} color={fg} />
        <Text style={[theme.type.label, styles.message, { color: fg }]}>{toast.message}</Text>
        {toast.action && (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              toast.action!.onPress();
              onClose();
            }}
            style={styles.action}
          >
            <Text style={[theme.type.bodyStrong, { color: fg, textDecorationLine: 'underline' }]}>{toast.action.label}</Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    minHeight: 48,
    paddingVertical: 10,
    maxWidth: 520,
    width: '100%',
  },
  message: { flex: 1 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
});
