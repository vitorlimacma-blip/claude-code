import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/** Brief confirmation at the bottom of the screen, also announced to screen readers. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
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
      {children}
      {toast && <ToastView key={toast.id} toast={toast} onClose={() => setToast(null)} />}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const icon = toast.tone === 'success' ? 'checkmark' : toast.tone === 'error' ? 'alert-outline' : 'information-circle-outline';
  // Inverted surface so it stands out on any screen.
  const bg = theme.colors.textPrimary;
  const fg = theme.colors.background;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 72 }]}>
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
