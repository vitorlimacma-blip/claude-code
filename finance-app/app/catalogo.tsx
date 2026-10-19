import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { formatCents } from '../src/domain/money';
import { useThemePreference } from '../src/state/useThemePreference';
import { BottomSheet } from '../src/ui/BottomSheet';
import { BudgetProgress } from '../src/ui/BudgetProgress';
import { InsightCard, ProjectionCard } from '../src/ui/cards';
import {
  AlertBadge,
  Button,
  Card,
  Chip,
  ChipRow,
  FinancialAmount,
  IconButton,
  MutedText,
  RemovableChip,
  Section,
  SegmentedControl,
  TextField,
} from '../src/ui/components';
import { contrastRatio, MIN_CONTRAST } from '../src/ui/contrast';
import { CONTENT_MAX_WIDTH } from '../src/ui/layout';
import { MoneyInput } from '../src/ui/MoneyInput';
import { AccountSelector, CategoryChip } from '../src/ui/selectors';
import { EmptyState, ErrorState, SkeletonRows } from '../src/ui/states';
import { useTheme, type ThemePreference } from '../src/ui/theme';
import { TideLine } from '../src/ui/TideLine';
import { useToast } from '../src/ui/Toast';
import { radius, SCREEN_PADDING, space, type TypeRole } from '../src/ui/tokens';
import { TransactionRow } from '../src/ui/TransactionRow';

// Internal screen to review the Maré Clara design system in both themes.
// Every value here is an example, not the user's data.

const TYPE_SAMPLES: [TypeRole, string, string][] = [
  ['amountDisplay', 'Valor de destaque · 36/42', 'R$ 12.480,35'],
  ['screenTitle', 'Título de tela · 28/34', 'Resumo'],
  ['sectionTitle', 'Título de seção · 20/26', 'Contas'],
  ['body', 'Corpo · 16/24', 'Gastos do mês até hoje, sem contar transferências.'],
  ['label', 'Rótulo · 14/20', 'Conta corrente · Itaú'],
  ['caption', 'Auxiliar · 12/16', 'Atualizado há 2 minutos'],
];

const SAMPLE_SERIES = [520000, 512300, 498000, 505500, 470200, 462000, 618000, 601500, 587400, 579900, 566000, 551200];

function Swatch({ name, color, against }: { name: string; color: string; against: { label: string; color: string; min: number }[] }) {
  const theme = useTheme();
  return (
    <View style={styles.swatch}>
      <View style={[styles.swatchColor, { backgroundColor: color, borderColor: theme.colors.border }]} />
      <View style={{ flex: 1 }}>
        <Text style={[theme.type.label, { color: theme.colors.textPrimary }]}>{name}</Text>
        <Text style={[theme.type.caption, { color: theme.colors.textSecondary }]}>
          {color.toUpperCase()}
          {against
            .map((a) => {
              const ratio = contrastRatio(color, a.color);
              return ` · ${ratio.toFixed(1).replace('.', ',')}:1 em ${a.label} ${ratio >= a.min ? '✓' : '✗'}`;
            })
            .join('')}
        </Text>
      </View>
    </View>
  );
}

function Demo({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section title={title}>
      <Card style={{ gap: 14 }}>{children}</Card>
    </Section>
  );
}

export default function CatalogScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [preference, setPreference] = useThemePreference();
  const [chip, setChip] = useState(true);
  const [segment, setSegment] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState(4590);
  const [account, setAccount] = useState('itau');
  const [sheet, setSheet] = useState(false);
  const c = theme.colors;
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH) - 2 * SCREEN_PADDING - 32;

  const text = MIN_CONTRAST.text;
  const graphic = MIN_CONTRAST.graphic;
  const onBg = (min: number) => [
    { label: 'fundo', color: c.background, min },
    { label: 'superfície', color: c.surface, min },
  ];

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <MutedText>
        Tela interna para revisar os componentes da direção Maré Clara. Todos os valores são exemplos. Troque o tema
        aqui para comparar claro e escuro; a escolha vale para o app todo.
      </MutedText>
      <SegmentedControl<ThemePreference>
        value={preference}
        onChange={setPreference}
        options={[
          { value: 'system', label: 'Sistema' },
          { value: 'light', label: 'Claro' },
          { value: 'dark', label: 'Escuro' },
        ]}
      />

      <Demo title="Cores">
        <Swatch name="textPrimary" color={c.textPrimary} against={onBg(text)} />
        <Swatch name="textSecondary" color={c.textSecondary} against={onBg(text)} />
        <Swatch name="primary" color={c.primary} against={onBg(text)} />
        <Swatch name="onPrimary" color={c.onPrimary} against={[{ label: 'primary', color: c.primary, min: text }]} />
        <Swatch name="onPrimarySoft" color={c.onPrimarySoft} against={[{ label: 'primarySoft', color: c.primarySoft, min: text }]} />
        <Swatch name="info" color={c.info} against={[{ label: 'infoSurface', color: c.infoSurface, min: text }]} />
        <Swatch name="warning" color={c.warning} against={[{ label: 'warningSurface', color: c.warningSurface, min: text }]} />
        <Swatch name="danger" color={c.danger} against={[{ label: 'dangerSurface', color: c.dangerSurface, min: text }]} />
        <Swatch name="borderStrong" color={c.borderStrong} against={onBg(graphic)} />
        <Swatch name="focus" color={c.focus} against={onBg(graphic)} />
        {c.chart.map((color, i) => (
          <Swatch key={i} name={`chart[${i}]`} color={color} against={onBg(graphic)} />
        ))}
        <MutedText style={{ fontSize: 12 }}>
          Mínimos de referência: 4,5:1 para texto e 3:1 para bordas de campos, foco e gráficos. O teste automático
          confere também as combinações com opacidade (pressionado, fundos translúcidos).
        </MutedText>
      </Demo>

      <Demo title="Tipografia">
        {TYPE_SAMPLES.map(([role, label, sample]) => (
          <View key={role} style={{ gap: 2 }}>
            <Text style={[theme.type.caption, { color: c.textSecondary }]}>{label}</Text>
            <Text style={[theme.type[role], { color: c.textPrimary }]}>{sample}</Text>
          </View>
        ))}
        <View style={{ gap: 2 }}>
          <Text style={[theme.type.caption, { color: c.textSecondary }]}>Numerais tabulares: os valores alinham em coluna</Text>
          {[111111, 4590, 98765432].map((v) => (
            <Text key={v} style={[theme.type.amount, { color: c.textPrimary, textAlign: 'right' }]}>
              {formatCents(v)}
            </Text>
          ))}
        </View>
      </Demo>

      <Demo title="Espaçamentos e raios">
        <View style={{ gap: 6 }}>
          {Object.entries(space).map(([key, value]) => (
            <View key={key} style={styles.inline}>
              <Text style={[theme.type.caption, styles.scaleLabel, { color: c.textSecondary }]}>{value}</Text>
              <View style={{ width: value * 3, height: 10, borderRadius: 3, backgroundColor: c.primary }} />
            </View>
          ))}
        </View>
        <View style={[styles.inline, { flexWrap: 'wrap' }]}>
          {Object.entries(radius).map(([key, value]) => (
            <View key={key} style={{ alignItems: 'center', gap: 4 }}>
              <View style={{ width: 56, height: 56, borderRadius: value, backgroundColor: c.primarySoft, borderWidth: 1, borderColor: c.primary }} />
              <Text style={[theme.type.caption, { color: c.textSecondary }]}>
                {key} · {value}
              </Text>
            </View>
          ))}
        </View>
      </Demo>

      <Demo title="Botões">
        <Button label="Salvar lançamento" icon="checkmark" onPress={() => toast({ message: 'Lançamento salvo', tone: 'success' })} haptic />
        <Button label="Secundário" variant="secondary" onPress={() => undefined} />
        <Button label="Discreto" variant="ghost" onPress={() => undefined} />
        <Button label="Excluir" icon="trash-outline" variant="danger" onPress={() => undefined} />
        <Button label="Indisponível" onPress={() => undefined} disabled />
        <View style={styles.inline}>
          <IconButton icon="filter" accessibilityLabel="Filtros" onPress={() => undefined} />
          <IconButton icon="calendar-outline" accessibilityLabel="Escolher período" onPress={() => undefined} />
          <IconButton icon="create-outline" accessibilityLabel="Editar" onPress={() => undefined} color={c.primary} />
        </View>
      </Demo>

      <Demo title="Valores">
        <FinancialAmount cents={1248035} size="display" />
        <FinancialAmount cents={980000} tone="positive" />
        <FinancialAmount cents={15078} tone="negative" />
        <FinancialAmount cents={-580645} tone="neutral" />
        <FinancialAmount cents={100000} tone="negative" muted />
        <FinancialAmount cents={123456789012} size="display" />
        <MutedText style={{ fontSize: 12 }}>
          Entradas com “+” e na cor principal; saídas com “−” e em cor neutra; transferências em cor secundária. O sinal
          sempre aparece, então a cor nunca é a única pista.
        </MutedText>
      </Demo>

      <Demo title="Chips e seletores">
        <ChipRow>
          <Chip label="Crédito" selected={chip} onPress={() => setChip((v) => !v)} />
          <Chip label="Pix" selected={!chip} onPress={() => setChip((v) => !v)} />
          <CategoryChip name="Mercado" icon="cart-outline" color="#EA580C" />
          <CategoryChip name="Transporte" icon="car-outline" color="#0891B2" selected onPress={() => undefined} />
          <RemovableChip label="Itaú" icon="business-outline" color="#EC7000" onRemove={() => undefined} />
        </ChipRow>
        <SegmentedControl
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'expense', label: 'Despesa' },
            { value: 'income', label: 'Receita' },
          ]}
        />
        <View style={[styles.inline, { flexWrap: 'wrap' }]}>
          <AlertBadge level="ok" />
          <AlertBadge level="warning" />
          <AlertBadge level="projected_overrun" />
          <AlertBadge level="exceeded" />
        </View>
      </Demo>

      <Demo title="Campos">
        <MoneyInput value={amount} onChange={setAmount} sign={segment === 'expense' ? '−' : '+'} />
        <TextField label="Descrição" placeholder="Ex.: Padaria" />
        <AccountSelector
          value={account}
          onChange={setAccount}
          accounts={[
            { id: 'itau', name: 'Itaú', icon: 'business-outline', color: '#EC7000', detail: 'Conta corrente' },
            { id: 'santander', name: 'Santander', icon: 'card-outline', color: '#EC0000', detail: 'Cartão · fecha dia 10' },
            { id: 'mp', name: 'Mercado Pago', icon: 'business-outline', color: '#00B1EA', detail: 'Conta digital' },
          ]}
        />
      </Demo>

      <Demo title="Lançamentos">
        <TransactionRow title="SUPERMERCADOS EPA" subtitle="Mercado · Itaú · Débito" amount={15078} direction="out" icon="cart-outline" color="#EA580C" onPress={() => undefined} />
        <TransactionRow title="Salário" subtitle="Itaú" amount={980000} direction="in" icon="briefcase-outline" color="#16A34A" onPress={() => undefined} />
        <TransactionRow title="Pagamento da fatura" subtitle="Itaú → Santander" badge="Fatura" counts={false} amount={580645} direction="out" icon="card-outline" color="#475569" onPress={() => undefined} />
        <TransactionRow title="Estorno: LOJA X" subtitle="Compras · Santander" badge="Estorno" amount={20000} direction="in" icon="return-down-back-outline" color="#7C3AED" onPress={() => undefined} />
        <TransactionRow title="GELADEIRA" subtitle="Casa · Santander" badge="Parcela 2/3" amount={33333} direction="out" icon="home-outline" color="#2563EB" pending onPress={() => undefined} />
      </Demo>

      <Demo title="Orçamento">
        <BudgetProgress label="Alimentação" spent={126770} budget={180000} projected={206835} />
        <BudgetProgress label="Lazer" spent={18000} budget={50000} />
        <BudgetProgress label="Delivery" spent={35000} budget={30000} />
        <BudgetProgress label="Pets" spent={8000} budget={0} />
      </Demo>

      <Section title="Cartões de explicação">
        <InsightCard
          title="Delivery acima do seu ritmo"
          body="Em outubro você gastou R$ 350,00 com delivery até o dia 19, contra R$ 210,00 no mesmo período de setembro."
          basis="Base: 14 lançamentos de 1 a 19 de outubro e 9 de 1 a 19 de setembro (exemplo)."
          action={{ label: 'Ver lançamentos', onPress: () => undefined }}
        />
        <ProjectionCard
          title="Saldo previsto"
          period="até 31 de outubro"
          value={412050}
          basis="Saldo atual das contas, contas a pagar cadastradas e média dos gastos variáveis (exemplo)."
          steps={[
            { label: 'Saldo disponível hoje', cents: 903938, op: '+' },
            { label: 'Contas fixas ainda não pagas', cents: 215000, op: '−' },
            { label: 'Gastos variáveis estimados (12 dias)', cents: 276888, op: '−' },
            { label: 'Saldo previsto', cents: 412050, op: '=' },
          ]}
          limitations={['Gastos variáveis estimados pela média dos últimos 3 meses.', 'Não inclui receitas sem data confirmada.']}
        />
        <ProjectionCard
          title="Gasto previsto no ano"
          period="2026"
          value={null}
          basis="Precisa de pelo menos 2 meses completos de lançamentos."
          unavailableReason="Há lançamentos só desde 3 de outubro; uma projeção anual agora seria um chute."
        />
      </Section>

      <Demo title="Linha da maré">
        <TideLine
          values={SAMPLE_SERIES}
          width={contentWidth}
          height={64}
          accessibilityLabel="Exemplo: saldo diário de 1 a 12 de outubro, de R$ 5.200,00 a R$ 5.512,00, com o salário no dia 7."
        />
        <MutedText style={{ fontSize: 12 }}>
          O motivo visual só desenha dados reais (aqui, um exemplo) e sempre tem a descrição em texto.
        </MutedText>
      </Demo>

      <Demo title="Estados">
        <EmptyState
          icon="receipt-outline"
          title="Nenhum lançamento em outubro"
          message="Registre um gasto ou uma receita e ele aparece aqui, agrupado por dia."
          action={{ label: 'Novo lançamento', icon: 'add', onPress: () => undefined }}
        />
        <ErrorState
          title="Não foi possível carregar"
          message="Seus dados estão salvos neste aparelho. Tente de novo em instantes."
          onRetry={() => undefined}
        />
        <SkeletonRows count={3} />
      </Demo>

      <Demo title="Folha e aviso">
        <Button label="Abrir folha" variant="secondary" onPress={() => setSheet(true)} />
        <Button
          label="Mostrar aviso com Desfazer"
          variant="secondary"
          onPress={() =>
            toast({ message: 'Lançamento excluído', action: { label: 'Desfazer', onPress: () => toast({ message: 'Exclusão desfeita', tone: 'success' }) } })
          }
        />
      </Demo>

      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Filtros"
        footer={<Button label="Aplicar" onPress={() => setSheet(false)} />}
      >
        <MutedText>Conteúdo de exemplo dentro da folha.</MutedText>
        <ChipRow>
          <Chip label="Mercado" selected onPress={() => undefined} />
          <Chip label="Transporte" selected={false} onPress={() => undefined} />
        </ChipRow>
      </BottomSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: SCREEN_PADDING, gap: 16, paddingBottom: 96, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatchColor: { width: 36, height: 36, borderRadius: 10, borderWidth: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scaleLabel: { width: 24, textAlign: 'right' },
});
