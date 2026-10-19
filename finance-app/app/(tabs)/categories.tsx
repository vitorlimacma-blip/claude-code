import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buildCategoryTree } from '../../src/domain/categories';
import { formatCents } from '../../src/domain/money';
import type { Category, CategoryKind } from '../../src/domain/types';
import { useQuery } from '../../src/state/useQuery';
import { useToday } from '../../src/state/useToday';
import { Button, Card, IconBubble, MutedText, Screen, SegmentedControl, Title } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

function openCategory(params: { id: string; kind?: CategoryKind; parentId?: string }) {
  router.push({ pathname: '/category/[id]', params });
}

export default function CategoriesScreen() {
  const theme = useTheme();
  const month = useToday().slice(0, 7);
  const [kind, setKind] = useState<CategoryKind>('expense');

  const { data } = useQuery(
    async (r) => {
      const [categories, budgets] = await Promise.all([r.categories.list({ kind }), r.budgets.amountsForMonth(month)]);
      return { categories, budgets };
    },
    ['categories', 'budgets'],
    [kind, month]
  );
  const tree = useMemo(() => buildCategoryTree(data?.categories ?? []), [data]);

  function budgetLabel(category: Category) {
    const budget = data?.budgets.get(category.id);
    return budget !== undefined ? `Orçamento: ${formatCents(budget)}/mês` : null;
  }

  return (
    <Screen>
      <Title>Categorias</Title>
      <SegmentedControl
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: 'Despesas' },
          { value: 'income', label: 'Receitas' },
        ]}
      />

      {tree.map(({ category, children }) => (
        <Card key={category.id} style={{ gap: 10 }}>
          <Pressable style={styles.row} onPress={() => openCategory({ id: category.id })}>
            <IconBubble icon={category.icon} color={category.color} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.parentName, { color: theme.colors.textPrimary }]}>{category.name}</Text>
              {budgetLabel(category) && <MutedText style={{ fontSize: 12 }}>{budgetLabel(category)}</MutedText>}
            </View>
          </Pressable>
          {children.map((child) => (
            <Pressable key={child.id} style={[styles.row, styles.child]} onPress={() => openCategory({ id: child.id })}>
              <View style={[styles.dot, { backgroundColor: child.color }]} />
              <Text style={[styles.childName, { color: theme.colors.textPrimary }]}>{child.name}</Text>
              {budgetLabel(child) && <MutedText style={{ fontSize: 12 }}>{budgetLabel(child)}</MutedText>}
            </Pressable>
          ))}
          <Pressable
            style={[styles.child, styles.row]}
            onPress={() => openCategory({ id: 'new', parentId: category.id })}
            hitSlop={6}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 13 }}>+ Subcategoria</Text>
          </Pressable>
        </Card>
      ))}

      <Button
        label={kind === 'expense' ? 'Nova categoria de despesa' : 'Nova categoria de receita'}
        variant="secondary"
        icon="add"
        onPress={() => openCategory({ id: 'new', kind })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  child: { paddingLeft: 48 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  parentName: { fontSize: 16, fontWeight: '700' },
  childName: { fontSize: 14, flex: 1 },
});
