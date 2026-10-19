/**
 * Turns a raw transaction description (typed by the user or coming from a
 * bank statement) into a stable merchant key, so that "IFD*IFOOD 12/03",
 * "Ifood" and "PIX ENVIADO IFOOD" all learn from each other.
 */

// Payment-method noise Brazilian banks put in front of the description.
const PREFIXES = [
  'COMPRA CARTAO DEBITO',
  'COMPRA CARTAO CREDITO',
  'COMPRA CARTAO',
  'COMPRA NO DEBITO',
  'COMPRA NO CREDITO',
  'COMPRA DEBITO',
  'COMPRA CREDITO',
  'COMPRA',
  'PIX ENVIADO',
  'PIX RECEBIDO',
  'PIX QRS',
  'PIX QR CODE',
  'PIX TRANSF',
  'TRANSF PIX',
  'TRANSFERENCIA PIX',
  'TRANSFERENCIA ENVIADA',
  'TRANSFERENCIA RECEBIDA',
  'PIX',
  'PAGAMENTO DE BOLETO',
  'PAGAMENTO BOLETO',
  'PAG BOLETO',
  'PAGTO',
  'PAGAMENTO',
  'DEB AUTOMATICO',
  'DEBITO AUTOMATICO',
  'DEB AUT',
  'TED ENVIADA',
  'TED RECEBIDA',
  'TED',
  'DOC',
];

// Card acquirer / wallet markers ("IFD*IFOOD", "MP*LOJA", "PAYPAL *SPOTIFY"). An explicit
// list, because a real merchant can look the same ("UBER *TRIP").
const ACQUIRERS = ['IFD', 'MP', 'MERCADOPAGO', 'PAG', 'PG', 'PAGSEGURO', 'EC', 'PP', 'PAYPAL', 'SUMUP', 'STONE', 'CIELO', 'GETNET', 'EBANX', 'EBN', 'DL', 'HNA', 'PICPAY'];
const ACQUIRER_PREFIX = new RegExp(`^(?:(?:${ACQUIRERS.join('|')})\\s?\\*\\s?)+`);

const STOPWORDS = new Set([
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'NA', 'NO', 'A', 'O', 'COM', 'PARA', 'POR',
  'LTDA', 'SA', 'S/A', 'ME', 'EIRELI', 'EPP', 'BR', 'BRA', 'BRASIL', 'WWW', 'COM', 'BR.',
]);

function baseNormalize(description: string): string {
  return description
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, ' ') // dates and installments (12/03, 1/3)
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ') // times
    .replace(/\bPARC(?:ELA)?\b/g, ' ')
    .replace(/\d{3,}/g, ' ') // card numbers, document numbers, ids
    .replace(/[^A-Z0-9*\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable merchant key, e.g. "IFD*IFOOD 12/03" -> "IFOOD". Empty string when nothing meaningful is left. */
export function normalizeMerchant(description: string): string {
  let s = baseNormalize(description);
  for (const prefix of PREFIXES) {
    if (s === prefix) return s; // the description is only the method (e.g. "PIX"): keep it
    if (s.startsWith(prefix + ' ')) {
      s = s.slice(prefix.length + 1);
      break;
    }
  }
  s = s.replace(ACQUIRER_PREFIX, '').replace(/\*/g, ' ');
  const words = s.split(' ').filter((w) => w && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  // The first words identify the merchant; trailing ones are usually city/branch.
  return words.slice(0, 3).join(' ');
}

/** Words of a description used by the local classifier. */
export function descriptionTokens(description: string): string[] {
  return baseNormalize(description)
    .replace(/\*/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}
