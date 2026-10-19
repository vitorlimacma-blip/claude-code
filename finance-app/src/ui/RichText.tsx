import { Fragment } from 'react';
import { Text, View, type TextStyle } from 'react-native';
import { useTheme } from './theme';

/** Renders `**bold**` spans inside one line. */
function Inline({ text, style }: { text: string; style: TextStyle }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <Text key={i} style={{ fontWeight: '700' }}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </Text>
  );
}

/**
 * Minimal Markdown for assistant answers: headings, bullet/numbered lists,
 * bold, and tables (shown as aligned rows). Anything else renders as text.
 */
export function RichText({ text, color }: { text: string; color?: string }) {
  const theme = useTheme();
  const base: TextStyle = { color: color ?? theme.colors.text, fontSize: 15, lineHeight: 21 };
  const lines = text.split('\n');

  return (
    <View style={{ gap: 4 }}>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={{ height: 4 }} />;
        if (/^\s*\|?\s*:?-{3,}/.test(line)) return null; // table separator row
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        if (heading) return <Inline key={i} text={heading[1]} style={{ ...base, fontWeight: '700', fontSize: 16 }} />;
        const bullet = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 6, paddingLeft: 4 }}>
              <Text style={base}>{bullet[1] ? `${bullet[1]}.` : '•'}</Text>
              <View style={{ flex: 1 }}>
                <Inline text={bullet[2]} style={base} />
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
                  <Inline text={cell} style={{ ...base, fontSize: 13 }} />
                </View>
              ))}
            </View>
          );
        }
        return <Inline key={i} text={line} style={base} />;
      })}
    </View>
  );
}
