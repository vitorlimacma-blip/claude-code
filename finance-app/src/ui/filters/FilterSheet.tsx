import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsWide } from '../layout';
import { useTheme } from '../theme';

/**
 * Container for filter options: a bottom sheet on phones and a side panel on
 * wide screens. Content scrolls; `footer` stays pinned at the bottom.
 */
export function FilterSheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const wide = useIsWide();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={[styles.overlay, wide ? styles.overlayWide : styles.overlayPhone]}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Fechar filtros" />
        <View
          accessibilityViewIsModal
          style={[
            styles.panel,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            wide ? styles.panelWide : [styles.panelPhone, { paddingBottom: insets.bottom }],
          ]}
        >
          {!wide && <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  overlayPhone: { justifyContent: 'flex-end' },
  overlayWide: { flexDirection: 'row', justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  panelPhone: { maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  panelWide: { width: 400, height: '100%' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  title: { fontSize: 18, fontWeight: '700' },
  content: { padding: 16, gap: 12 },
  footer: { padding: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
