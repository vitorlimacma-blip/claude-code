import { Fragment } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import { Icon } from './icons';
import { useTheme } from './theme';

/** Opens the evidence behind a reference such as "[E2]" in an assistant answer. */
type OnRef = (ref: string) => void;

/** Renders `**bold**` spans and `[E1]` evidence references inside one line. */
function Inline({ text, style, onRef }: { text: string; style: TextStyle; onRef?: OnRef }) {
  const theme = useTheme();
  const parts = text.split(/(\*\*[^*]+\*\*|\[E\d+\])/g);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={{ fontWeight: '700' }}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        const ref = part.match(/^\[(E\d+)\]$/);
        if (ref && onRef) {
          return (
            <Text
              key={i}
              onPress={() => onRef(ref[1])}
              accessibilityRole="link"
              accessibilityLabel={`Ver a base do cálculo ${ref[1]}`}
              style={{ color: theme.colors.onPrimarySoft, backgroundColor: theme.colors.primarySoft, fontSize: 12, fontWeight: '700' }}
            >
              {`\u00a0${ref[1]}\u00a0`}
            </Text>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </Text>
  );
}

/**
 * Minimal Markdown for assistant answers: headings, bullet/numbered lists,
 * bold, and tables (shown as aligned rows). Anything else renders as text.
 * Evidence references ("[E1]") become links when `onRef` is given, and lines
 * starting with "Sugestão:" are set apart from facts and estimates (§11).
 */
export function RichText({ text, color, onRef }: { text: string; color?: string; onRef?: OnRef }) {
  const theme = useTheme();
  const base: TextStyle = { color: color ?? theme.colors.textPrimary, fontSize: 15, lineHeight: 21 };
  const lines = text.split('\n');

  return (
    <View style={{ gap: 4 }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={{ height: 4 }} />;
        if (/^\s*\|?\s*:?-{3,}/.test(line)) return null; // table separator row
        const suggestion = line.match(/^\s*(?:[-*•]\s+)?(?:\*\*)?Sugest[ãa]o:(?:\*\*)?\s*(.*)$/i);
        if (suggestion) {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceMuted }}>
              <Icon name="bulb-outline" size={18} color={theme.colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Inline text={`**Sugestão:** ${suggestion[1]}`} style={base} onRef={onRef} />
              </View>
            </View>
          );
        }
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        if (heading) return <Inline key={i} text={heading[1]} style={{ ...base, fontWeight: '700', fontSize: 16 }} onRef={onRef} />;
        const bullet = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 6, paddingLeft: 4 }}>
              <Text style={base}>{bullet[1] ? `${bullet[1]}.` : '•'}</Text>
              <View style={{ flex: 1 }}>
                <Inline text={bullet[2]} style={base} onRef={onRef} />
              </View>
            </View>
          );
        }
        if (line.trim().startsWith('|')) {
          const cells = line.split('|').slice(1, -1).map((c) => c.trim());
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              {cells.map((cell, j) => (
                <View key={j} style={{ flex: 1 }}>
                  <Inline text={cell} style={{ ...base, fontSize: 13 }} onRef={onRef} />
                </View>
              ))}
            </View>
          );
        }
        return <Inline key={i} text={line} style={base} onRef={onRef} />;
      })}
    </View>
  );
}
