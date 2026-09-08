import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFinance } from '../../src/state/FinanceContext';
import { formatCents, parseAmountToCents } from '../../src/utils/currency';

const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];

export default function CategoriesScreen() {
  const { categories, addCategory, removeCategory } = useFinance();
  const [name, setName] = useState('');
  const [budget, setBudget] = useState('');
  const [color, setColor] = useState(PALETTE[0]);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const monthlyBudget = budget.trim() === '' ? null : parseAmountToCents(budget);
    await addCategory({ name: trimmed, color, monthlyBudget });
    setName('');
    setBudget('');
  }

  function handleDelete(id: string, categoryName: string) {
    Alert.alert('Remover categoria', `Remover "${categoryName}"? Os lançamentos associados também serão removidos.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => removeCategory(id) },
    ]);
  }

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.list}
        data={categories}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<Text style={styles.title}>Categorias de despesa</Text>}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhuma categoria cadastrada ainda.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: item.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>
                {item.monthlyBudget !== null ? `Orçamento: ${formatCents(item.monthlyBudget)}/mês` : 'Sem orçamento definido'}
              </Text>
            </View>
            <Pressable onPress={() => handleDelete(item.id, item.name)} hitSlop={8}>
              <Text style={styles.deleteText}>Remover</Text>
            </Pressable>
          </View>
        )}
      />

      <View style={styles.form}>
        <Text style={styles.formTitle}>Nova categoria</Text>
        <TextInput
          style={styles.input}
          placeholder="Nome (ex: Mercado)"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Orçamento mensal (opcional)"
          keyboardType="decimal-pad"
          value={budget}
          onChangeText={setBudget}
        />
        <View style={styles.paletteRow}>
          {PALETTE.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[styles.paletteSwatch, { backgroundColor: c }, c === color && styles.paletteSwatchSelected]}
            />
          ))}
        </View>
        <Pressable style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addButtonText}>Adicionar categoria</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  list: {
    padding: 16,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    color: '#6b7280',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  deleteText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
  },
  form: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
    gap: 10,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  paletteRow: {
    flexDirection: 'row',
    gap: 8,
  },
  paletteSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  paletteSwatchSelected: {
    borderWidth: 3,
    borderColor: '#111827',
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
