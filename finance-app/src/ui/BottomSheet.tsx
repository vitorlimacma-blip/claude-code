import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './components';
import { useIsWide } from './layout';
import { useTheme } from './theme';
import { motion } from './tokens';

/**
 * Panel that slides up from the bottom (≈300 ms, §6), or a centered dialog on
 * wide screens. Closes on the backdrop, the close button or the back gesture.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pinned below the content, e.g. the main action. */
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, wide && styles.rootWide]}>
        <Animated.View entering={FadeIn.duration(motion.transition)} style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" />
        </Animated.View>
        <Animated.View
          entering={wide ? FadeIn.duration(motion.transition) : SlideInDown.duration(motion.sheet)}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              paddingBottom: wide ? 16 : Math.max(insets.bottom, 16),
            },
            wide && [styles.dialog, { borderRadius: theme.radius.xl }],
            theme.dark && { borderWidth: 1, borderColor: theme.colors.border },
          ]}
        >
          {!wide && <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />}
          <View style={styles.header}>
            <Text accessibilityRole="header" style={[theme.type.sectionTitle, { flex: 1, color: theme.colors.textPrimary }]}>
              {title}
            </Text>
            <IconButton icon="close" accessibilityLabel="Fechar" onPress={onClose} color={theme.colors.textSecondary} />
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>{footer}</View>}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  rootWide: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { maxHeight: '90%', width: '100%' },
  dialog: { maxWidth: 560, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 8 },
  content: { paddingHorizontal: 20, paddingBottom: 16, gap: 16 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
