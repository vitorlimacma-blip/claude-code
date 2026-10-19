import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ValidationError } from '../../src/data/context';
import { centsToInput, parseAmountToCents } from '../../src/domain/money';
import { confirm, notify } from '../../src/platform/dialogs';
import type { Category, CategoryKind } from '../../src/domain/types';
import { useRepositories } from '../../src/state/DataProvider';
import { useQuery } from '../../src/state/useQuery';
import { Button, IconBubble, MutedText, SectionTitle, TextField } from '../../src/ui/components';
import { CONTENT_MAX_WIDTH } from '../../src/ui/layout';
import { useTheme } from '../../src/ui/theme';

const PALETTE = ['#EA580C', '#2563EB', '#0891B2', '#DC2626', '#7C3AED', '#DB2777', '#4F46E5', '#CA8A04', '#16A34A', '#475569'];
const ICONS = [
  'pricetag-outline', 'cart-outline', 'restaurant-outline', 'home-outline', 'car-outline', 'medkit-outline',
  'school-outline', 'game-controller-outline', 'airplane-outline', 'paw-outline', 'gift-outline', 'heart-outline',
  'barbell-outline', 'shirt-outline', 'construct-outline', 'briefcase-outline', 'cash-outline', 'trending-up-outline',
];

export default function CategoryScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: CategoryKind; parentId?: string }>();
  const isNew = params.id === 'new';
  const { data } = useQuery(
    async (r) => {
      const category = isNew ? undefined : await r.categories.get(params.id);
      const parentId = category?.parentId ?? params.parentId;
      const parent = parentId ? await r.categories.get(parentId) : undefined;
      const budget = category ? (await r.budgets.list()).find((b) => b.categoryId === category.id && b.month === null) : undefined;
      return { category, parent, budget: budget?.amount ?? null };
    },
    [],
    [params.id, params.parentId]
  );

  if (!data) return null;
  const title = isNew ? (data.parent ? `Nova subcategoria de ${data.parent.name}` : 'Nova categoria') : 'Editar categoria';
  return (
    <>
      <Stack.Screen options={{ title }} />
      <CategoryForm {...data} kind={data.category?.kind ?? data.parent?.kind ?? params.kind ?? 'expense'} />
    </>
  );
}

function CategoryForm({
  category,
  parent,
  budget,
  kind,
}: {
  category?: Category;
  parent?: Category;
  budget: number | null;
  kind: CategoryKind;
}) {
  const theme = useTheme();
  const repos = useRepositories();
  const isSub = !!parent;
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? parent?.color ?? PALETTE[0]);
  const [icon, setIcon] = useState(category?.icon ?? parent?.icon ?? ICONS[0]);
  const [budgetInput, setBudgetInput] = useState(budget !== null ? centsToInput(budget) : '');

  async function save() {
    try {
      const style = isSub ? {} : { color, icon };
      let id = category?.id;
      if (category) {
        await repos.categories.update(category.id, { name, ...style });
      } else {
        id = (await repos.categories.create({ name, kind, parentId: parent?.id ?? null, ...style })).id;
      }
      if (kind === 'expense' && id) {
        const amount = budgetInput.trim() === '' ? null : parseAmountToCents(budgetInput);
        await repos.budgets.set(id, amount);
      }
      router.back();
    } catch (err) {
      if (err instanceof ValidationError) notify('Verifique os dados', err.message);
      else throw err;
    }
  }

  async function remove() {
    if (!category) return;
    const ok = await confirm(
      'Excluir categoria',
      `Excluir "${category.name}"${isSub ? '' : ' e suas subcategorias'}? Os lançamentos serão mantidos, mas ficarão sem categoria.`,
      { confirmLabel: 'Excluir', destructive: true }
    );
    if (!ok) return;
    await repos.categories.remove(category.id);
    router.back();
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <TextField label="Nome" placeholder="Ex.: Feira" value={name} onChangeText={setName} autoFocus={!category} />

      {kind === 'expense' && (
        <>
          <TextField
            label="Orçamento mensal (opcional)"
            placeholder="Ex.: 800,00"
            keyboardType="decimal-pad"
            value={budgetInput}
            onChangeText={setBudgetInput}
          />
          <MutedText>
            {isSub
              ? 'O orçamento de uma subcategoria é acompanhado separadamente; os gastos dela também contam para a categoria-mãe.'
              : 'Inclui os gastos de todas as subcategorias.'}
          </MutedText>
        </>
      )}

      {!isSub && (
        <>
          <SectionTitle>Cor</SectionTitle>
          <View style={styles.grid}>
            {PALETTE.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityLabel={`Cor ${c}`}
                style={[styles.swatch, { backgroundColor: c }, c === color && { borderColor: theme.colors.textPrimary, borderWidth: 3 }]}
              />
            ))}
          </View>
          <SectionTitle>Ícone</SectionTitle>
          <View style={styles.grid}>
            {ICONS.map((i) => (
              <Pressable key={i} onPress={() => setIcon(i)} style={[styles.iconCell, i === icon && { borderColor: color }]}>
                <IconBubble icon={i} color={color} size={36} />
              </Pressable>
            ))}
          </View>
        </>
      )}

      <View style={{ gap: 10, marginTop: 8 }}>
        <Button label="Salvar" icon="checkmark" onPress={save} />
        {category && <Button label="Excluir" variant="danger" icon="trash-outline" onPress={remove} />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  iconCell: { borderWidth: 2, borderColor: 'transparent', borderRadius: 22, padding: 2 },
});
