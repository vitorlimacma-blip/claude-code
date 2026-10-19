import type { CategoryKind } from './types';

export interface DefaultCategory {
  /** Stable id, identical on every install, so seeded categories line up across devices once sync exists. */
  id: string;
  name: string;
  icon: string; // Ionicons glyph
  color: string;
  children?: { id: string; name: string; icon?: string }[];
}

/**
 * Categories shipped with the app, tuned for Brazilian personal finances.
 * Subcategories inherit the parent's color (and icon when not given).
 * Bump `DEFAULT_CATEGORIES_VERSION` when adding entries, so existing installs
 * receive the new ones (seeding never overwrites or re-creates user edits).
 */
export const DEFAULT_CATEGORIES_VERSION = 1;

export const DEFAULT_EXPENSE_CATEGORIES: DefaultCategory[] = [
  {
    id: 'sys-alimentacao',
    name: 'Alimentação',
    icon: 'restaurant-outline',
    color: '#EA580C',
    children: [
      { id: 'sys-alimentacao-mercado', name: 'Mercado', icon: 'cart-outline' },
      { id: 'sys-alimentacao-restaurantes', name: 'Restaurantes' },
      { id: 'sys-alimentacao-delivery', name: 'Delivery', icon: 'bicycle-outline' },
      { id: 'sys-alimentacao-padaria', name: 'Padaria e café', icon: 'cafe-outline' },
    ],
  },
  {
    id: 'sys-moradia',
    name: 'Moradia',
    icon: 'home-outline',
    color: '#2563EB',
    children: [
      { id: 'sys-moradia-aluguel', name: 'Aluguel ou financiamento' },
      { id: 'sys-moradia-condominio', name: 'Condomínio' },
      { id: 'sys-moradia-energia', name: 'Energia elétrica', icon: 'flash-outline' },
      { id: 'sys-moradia-agua', name: 'Água e esgoto', icon: 'water-outline' },
      { id: 'sys-moradia-gas', name: 'Gás', icon: 'flame-outline' },
      { id: 'sys-moradia-internet', name: 'Internet e TV', icon: 'wifi-outline' },
      { id: 'sys-moradia-manutencao', name: 'Manutenção e reparos', icon: 'construct-outline' },
      { id: 'sys-moradia-iptu', name: 'IPTU', icon: 'document-text-outline' },
    ],
  },
  {
    id: 'sys-transporte',
    name: 'Transporte',
    icon: 'car-outline',
    color: '#0891B2',
    children: [
      { id: 'sys-transporte-combustivel', name: 'Combustível', icon: 'speedometer-outline' },
      { id: 'sys-transporte-apps', name: 'Uber, 99 e táxi' },
      { id: 'sys-transporte-publico', name: 'Transporte público', icon: 'bus-outline' },
      { id: 'sys-transporte-estacionamento', name: 'Estacionamento e pedágio' },
      { id: 'sys-transporte-manutencao', name: 'Manutenção do veículo', icon: 'construct-outline' },
      { id: 'sys-transporte-ipva', name: 'IPVA, licenciamento e multas', icon: 'document-text-outline' },
      { id: 'sys-transporte-seguro', name: 'Seguro do veículo', icon: 'shield-checkmark-outline' },
    ],
  },
  {
    id: 'sys-saude',
    name: 'Saúde',
    icon: 'medkit-outline',
    color: '#DC2626',
    children: [
      { id: 'sys-saude-plano', name: 'Plano de saúde', icon: 'shield-checkmark-outline' },
      { id: 'sys-saude-farmacia', name: 'Farmácia' },
      { id: 'sys-saude-consultas', name: 'Consultas e exames' },
      { id: 'sys-saude-odonto', name: 'Dentista' },
      { id: 'sys-saude-academia', name: 'Academia e esportes', icon: 'barbell-outline' },
    ],
  },
  {
    id: 'sys-educacao',
    name: 'Educação',
    icon: 'school-outline',
    color: '#7C3AED',
    children: [
      { id: 'sys-educacao-mensalidade', name: 'Mensalidade escolar ou faculdade' },
      { id: 'sys-educacao-cursos', name: 'Cursos' },
      { id: 'sys-educacao-livros', name: 'Livros e material', icon: 'book-outline' },
    ],
  },
  {
    id: 'sys-lazer',
    name: 'Lazer',
    icon: 'game-controller-outline',
    color: '#DB2777',
    children: [
      { id: 'sys-lazer-viagens', name: 'Viagens', icon: 'airplane-outline' },
      { id: 'sys-lazer-eventos', name: 'Cinema, shows e eventos', icon: 'film-outline' },
      { id: 'sys-lazer-bares', name: 'Bares e saídas', icon: 'beer-outline' },
      { id: 'sys-lazer-hobbies', name: 'Hobbies' },
    ],
  },
  {
    id: 'sys-assinaturas',
    name: 'Assinaturas e serviços',
    icon: 'repeat-outline',
    color: '#4F46E5',
    children: [
      { id: 'sys-assinaturas-streaming', name: 'Streaming', icon: 'tv-outline' },
      { id: 'sys-assinaturas-celular', name: 'Celular', icon: 'phone-portrait-outline' },
      { id: 'sys-assinaturas-apps', name: 'Apps e software', icon: 'apps-outline' },
    ],
  },
  {
    id: 'sys-compras',
    name: 'Compras',
    icon: 'bag-handle-outline',
    color: '#CA8A04',
    children: [
      { id: 'sys-compras-roupas', name: 'Roupas e calçados', icon: 'shirt-outline' },
      { id: 'sys-compras-eletronicos', name: 'Eletrônicos', icon: 'laptop-outline' },
      { id: 'sys-compras-casa', name: 'Casa e decoração' },
      { id: 'sys-compras-presentes', name: 'Presentes', icon: 'gift-outline' },
    ],
  },
  {
    id: 'sys-cuidados',
    name: 'Cuidados pessoais',
    icon: 'cut-outline',
    color: '#C026D3',
  },
  {
    id: 'sys-familia',
    name: 'Família e filhos',
    icon: 'people-outline',
    color: '#0D9488',
  },
  {
    id: 'sys-pets',
    name: 'Pets',
    icon: 'paw-outline',
    color: '#92400E',
  },
  {
    id: 'sys-financeiro',
    name: 'Tarifas, juros e impostos',
    icon: 'receipt-outline',
    color: '#475569',
    children: [
      { id: 'sys-financeiro-tarifas', name: 'Tarifas bancárias e anuidade' },
      { id: 'sys-financeiro-juros', name: 'Juros, multas e IOF' },
      { id: 'sys-financeiro-impostos', name: 'Imposto de renda e outros impostos', icon: 'document-text-outline' },
    ],
  },
  {
    id: 'sys-doacoes',
    name: 'Doações',
    icon: 'heart-outline',
    color: '#E11D48',
  },
  {
    id: 'sys-outros',
    name: 'Outras despesas',
    icon: 'ellipsis-horizontal-circle-outline',
    color: '#6B7280',
  },
];

export const DEFAULT_INCOME_CATEGORIES: DefaultCategory[] = [
  { id: 'sys-receita-salario', name: 'Salário', icon: 'briefcase-outline', color: '#16A34A' },
  { id: 'sys-receita-extras', name: '13º, férias e bônus', icon: 'star-outline', color: '#15803D' },
  { id: 'sys-receita-freelance', name: 'Freelance e serviços', icon: 'hammer-outline', color: '#059669' },
  { id: 'sys-receita-rendimentos', name: 'Rendimentos e dividendos', icon: 'trending-up-outline', color: '#0F766E' },
  { id: 'sys-receita-reembolsos', name: 'Reembolsos e estornos', icon: 'return-down-back-outline', color: '#65A30D' },
  { id: 'sys-receita-vendas', name: 'Vendas', icon: 'pricetag-outline', color: '#4D7C0F' },
  { id: 'sys-receita-outras', name: 'Outras receitas', icon: 'ellipsis-horizontal-circle-outline', color: '#6B7280' },
];

export const DEFAULT_CATEGORIES: Record<CategoryKind, DefaultCategory[]> = {
  expense: DEFAULT_EXPENSE_CATEGORIES,
  income: DEFAULT_INCOME_CATEGORIES,
};
