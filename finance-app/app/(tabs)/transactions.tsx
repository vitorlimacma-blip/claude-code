import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFinance } from '../../src/state/FinanceContext';
import type { TransactionType } from '../../src/domain/types';
import { formatCents, parseAmountToCents } from '../../src/utils/currency';
import { toDateKey } from '../../src/utils/date';

export default function TransactionsScreen() {
  const { categories, transactions, addTransaction, removeTransaction } = useFinance();
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => toDateKey(new Date()));

  const activeCategoryId = categoryId ?? categories[0]?.id ?? null;

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  async function handleAdd() {
    if (!activeCategoryId) {
      Alert.alert('Crie uma categoria primeiro', 'Vá até a aba Categorias para cadastrar ao menos uma categoria.');
      return;
    }
    const cents = parseAmountToCents(amount);
    if (cents <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }
    await addTransaction({ categoryId: activeCategoryId, type, amount: cents, date, note: note.trim() });
    setAmount('');
    setNote('');
  }

  function handleDelete(id: string) {
    Alert.alert('Remover lançamento', 'Deseja remover este lançamento?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => removeTransaction(id) },
    ]);
  }

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.list}
        data={transactions}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<Text style={styles.title}>Lançamentos</Text>}
        ListEmptyComponent={<Text style={styles.emptyText}>Nenhum lançamento ainda.</Text>}
        renderItem={({ item }) => {
          const category = categoryById.get(item.categoryId);
          const isExpense = item.type === 'expense';
          return (
            <View style={styles.row}>
              <View style={[styles.swatch, { backgroundColor: category?.color ?? '#9ca3af' }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{category?.name ?? 'Categoria removida'}</Text>
                <Text style={styles.rowSubtitle}>
                  {item.date}
                  {item.note ? ` · ${item.note}` : ''}
                </Text>
              </View>
              <Text style={[styles.amount, isExpense ? styles.amountExpense : styles.amountIncome]}>
                {isExpense ? '-' : '+'}
                {formatCents(item.amount)}
              </Text>
              <Pressable onPress={() => handleDelete(item.id)} hitSlop={8} style={styles.deleteButton}>
                <Text style={styles.deleteText}>✕</Text>
              </Pressable>
            </View>
          );
        }}
      />

      <View style={styles.form}>
        <Text style={styles.formTitle}>Novo lançamento</Text>

        <View style={styles.typeRow}>
          <Pressable
            style={[styles.typeButton, type === 'expense' && styles.typeButtonActiveExpense]}
            onPress={() => setType('expense')}
          >
            <Text style={[styles.typeButtonText, type === 'expense' && styles.typeButtonTextActive]}>Despesa</Text>
          </Pressable>
          <Pressable
            style={[styles.typeButton, type === 'income' && styles.typeButtonActiveIncome]}
            onPress={() => setType('income')}
          >
            <Text style={[styles.typeButtonText, type === 'income' && styles.typeButtonTextActive]}>Receita</Text>
          </Pressable>
        </View>

        <View style={styles.categoryRow}>
          {categories.length === 0 && <Text style={styles.emptyText}>Cadastre uma categoria na aba Categorias.</Text>}
          {categories.map((c) => (
            <Pressable
              key={c.id}
              style={[
                styles.categoryChip,
                { borderColor: c.color },
                activeCategoryId === c.id && { backgroundColor: c.color },
              ]}
              onPress={() => setCategoryId(c.id)}
            >
              <Text style={[styles.categoryChipText, activeCategoryId === c.id && { color: '#fff' }]}>{c.name}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput style={styles.input} placeholder="Valor (ex: 45,90)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <TextInput style={styles.input} placeholder="Data (AAAA-MM-DD)" value={date} onChangeText={setDate} />
        <TextInput style={styles.input} placeholder="Observação (opcional)" value={note} onChangeText={setNote} />

        <Pressable style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addButtonText}>Adicionar lançamento</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  list: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 8 },
  emptyText: { color: '#6b7280' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowSubtitle: { fontSize: 12, color: '#6b7280' },
  amount: { fontSize: 14, fontWeight: '700' },
  amountExpense: { color: '#991b1b' },
  amountIncome: { color: '#166534' },
  deleteButton: { paddingHorizontal: 4 },
  deleteText: { color: '#9ca3af', fontSize: 16 },
  form: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
    gap: 10,
  },
  formTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  typeButtonActiveExpense: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  typeButtonActiveIncome: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  typeButtonText: { fontWeight: '600', color: '#374151' },
  typeButtonTextActive: { color: '#fff' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '700' },
});
