import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ValidationError } from '../../src/data/context';
import { confirm, notify } from '../../src/platform/dialogs';
import type { Category, CategoryKind } from '../../src/domain/types';
import { useRepositories } from '../../src/state/DataProvider';
import { useQuery } from '../../src/state/useQuery';
import { Button, IconBubble, MutedText, SectionTitle, TextField } from '../../src/ui/components';
import { contrastRatio } from '../../src/ui/contrast';
import { Icon } from '../../src/ui/icons';
import { MoneyInput } from '../../src/ui/MoneyInput';
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
  const [budgetCents, setBudgetCents] = useState(budget ?? 0);

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
        await repos.budgets.set(id, budgetCents > 0 ? budgetCents : null);
      }
      router.back();
    } catch (err) {
      if (err instanceof ValidationError) notify('Verifique os dados', err.message);
      else throw err;
    }
  }

  async function remove() {
    if (!category) return;
    const usage = await repos.categories.usage(category.id);
    if (usage.transactions > 0) {
      // Deleting would leave history without a category: offer archiving instead (merging is in Categorias).
      const archive = await confirm(
        'Categoria em uso',
        `"${category.name}" tem ${usage.transactions} lançamento(s). Para manter o histórico, ela pode ser arquivada: some das ` +
          'opções de novos lançamentos, mas os lançamentos e totais continuam. Para juntar com outra, use Categorias › Juntar.',
        { confirmLabel: 'Arquivar' }
      );
      if (!archive) return;
      await repos.categories.setArchived(category.id, true);
      router.back();
      return;
    }
    const ok = await confirm(
      'Excluir categoria',
      `Excluir "${category.name}"${isSub || usage.subcategories === 0 ? '' : ` e suas ${usage.subcategories} subcategorias`}? Ela não tem lançamentos.`,
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
          <MoneyInput label="Orçamento mensal (opcional, deixe zerado para não ter)" value={budgetCents} onChange={setBudgetCents} size="regular" />
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
                accessibilityRole="radio"
                accessibilityState={{ checked: c === color }}
                accessibilityLabel={`Cor ${PALETTE.indexOf(c) + 1}`}
                style={[styles.swatch, { backgroundColor: c }, c === color && { borderColor: theme.colors.textPrimary, borderWidth: 3 }]}
              >
                {c === color && <Icon name="checkmark" size={18} color={contrastRatio('#FFFFFF', c) >= 3 ? '#FFFFFF' : '#132A26'} />}
              </Pressable>
            ))}
          </View>
          <SectionTitle>Ícone</SectionTitle>
          <View style={styles.grid}>
            {ICONS.map((i) => (
              <Pressable
                key={i}
                onPress={() => setIcon(i)}
                accessibilityRole="radio"
                accessibilityState={{ checked: i === icon }}
                accessibilityLabel={`Ícone ${ICONS.indexOf(i) + 1}`}
                style={[styles.iconCell, i === icon && { borderColor: theme.colors.textPrimary }]}
              >
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
  content: { padding: 20, gap: 14, paddingBottom: 48, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  iconCell: { borderWidth: 2, borderColor: 'transparent', borderRadius: 26, padding: 4 },
});
