/**
 * Brazilian financial institutions the app knows about. The slug is what is
 * stored in `accounts.institution`, and is also how import presets (CSV/OFX)
 * are matched to an account.
 */
export interface Institution {
  slug: string;
  name: string;
  color: string;
}

export const INSTITUTIONS: Institution[] = [
  { slug: 'itau', name: 'Itaú', color: '#EC7000' },
  { slug: 'santander', name: 'Santander', color: '#EC0000' },
  { slug: 'xp', name: 'XP Investimentos', color: '#1A1A1A' },
  { slug: 'mercado_pago', name: 'Mercado Pago', color: '#00B1EA' },
  { slug: 'nubank', name: 'Nubank', color: '#820AD1' },
  { slug: 'inter', name: 'Banco Inter', color: '#FF7A00' },
  { slug: 'bb', name: 'Banco do Brasil', color: '#F8D117' },
  { slug: 'bradesco', name: 'Bradesco', color: '#CC092F' },
  { slug: 'caixa', name: 'Caixa', color: '#005CA9' },
  { slug: 'c6', name: 'C6 Bank', color: '#242424' },
  { slug: 'btg', name: 'BTG Pactual', color: '#0A2240' },
  { slug: 'picpay', name: 'PicPay', color: '#11C76F' },
  { slug: 'other', name: 'Outro', color: '#6B7280' },
];

export function findInstitution(slug: string | null): Institution | undefined {
  return slug ? INSTITUTIONS.find((i) => i.slug === slug) : undefined;
}
