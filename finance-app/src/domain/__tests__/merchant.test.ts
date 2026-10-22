import { descriptionTokens, normalizeMerchant } from '../merchant';

describe('normalizeMerchant', () => {
  it.each([
    ['IFD*IFOOD 12/03', 'IFOOD'],
    ['Ifood', 'IFOOD'],
    ['PIX ENVIADO IFOOD', 'IFOOD'],
    ['UBER *TRIP 1234', 'UBER TRIP'],
    ['MP*MERCADOLIVRE', 'MERCADOLIVRE'],
    ['Compra Cartão Débito PADARIA SÃO JOÃO LTDA', 'PADARIA SAO JOAO'],
    ['NETFLIX.COM 08/10', 'NETFLIX'],
    ['PAG*JoseDaSilva', 'JOSEDASILVA'],
    ['SUPERMERCADO DIA 3 PARC 01/03', 'SUPERMERCADO DIA'],
    ['Pix', 'PIX'],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeMerchant(input)).toBe(expected);
  });
});

describe('descriptionTokens', () => {
  it('drops accents, numbers and stopwords', () => {
    expect(descriptionTokens('Almoço no Restaurante da Maria 12/03 - R$ 45')).toEqual(['ALMOCO', 'RESTAURANTE', 'MARIA']);
  });
});
