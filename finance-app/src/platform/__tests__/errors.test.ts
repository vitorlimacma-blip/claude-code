import { ValidationError } from '../../data/context';
import { sanitizeErrorForLog, userFacingError } from '../errors';

describe('error sanitizing (briefing §12: no financial data in logs)', () => {
  it('drops query parameters, quoted values and numbers', () => {
    const err = new Error(
      'Failed query: insert into "transactions" ("id", "amount", "description") values (?, ?, ?)\nparams: abc,123456,SALARIO EMPRESA'
    );
    const logged = sanitizeErrorForLog(err);
    expect(logged).not.toMatch(/123456|SALARIO|params/);
    expect(logged).toMatch(/^Error: Failed query/);
    expect(sanitizeErrorForLog(new Error("UNIQUE constraint failed: value 'R$ 1.234,56' on 2026-03-01"))).not.toMatch(
      /1\.234|2026|R\$ 1/
    );
  });

  it('shows our own validation messages, and a generic one for anything else', () => {
    expect(userFacingError(new ValidationError('Informe um valor maior que zero.'), 'x')).toBe('Informe um valor maior que zero.');
    expect(userFacingError(new Error('SQLITE_FULL params: 9999'), 'Falhou.')).toBe('Falhou.');
  });
});
