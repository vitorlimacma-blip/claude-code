// Strict argument checking for tool calls proposed by a model (contract §4):
// exact schema, no extra fields, real calendar dates, safe integer amounts.
// The model's arguments are data to validate, never trusted as-is.

export type FieldSpec =
  | { type: 'string'; description: string; enum?: readonly string[]; maxLength?: number }
  | { type: 'date'; description: string; optional?: boolean }
  | { type: 'integer'; description: string; minimum: number; maximum: number };

export type ArgsSpec = Record<string, FieldSpec>;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in YYYY-MM-DD (2026-02-30 is rejected). */
export function isCalendarDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** JSON Schema for providers' strict modes: every field required; optional dates accept "". */
export function toJsonSchema(spec: ArgsSpec): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [name, f] of Object.entries(spec)) {
    if (f.type === 'integer') properties[name] = { type: 'integer', description: f.description, minimum: f.minimum, maximum: f.maximum };
    else if (f.type === 'date') properties[name] = { type: 'string', description: `${f.description} (AAAA-MM-DD${f.optional ? ', ou "" para hoje' : ''}).` };
    else properties[name] = { type: 'string', description: f.description, ...(f.enum && { enum: f.enum }) };
  }
  return { type: 'object', properties, required: Object.keys(spec), additionalProperties: false };
}

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function validateArgs<T>(spec: ArgsSpec, input: unknown): Validated<T> {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['Os argumentos devem ser um objeto.'] };
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!(key in spec)) errors.push(`Campo não permitido: ${key}.`);
  for (const [name, f] of Object.entries(spec)) {
    const v = record[name];
    if (v === undefined) {
      errors.push(`Campo obrigatório ausente: ${name}.`);
      continue;
    }
    if (f.type === 'integer') {
      if (typeof v !== 'number' || !Number.isSafeInteger(v)) errors.push(`${name} deve ser um número inteiro.`);
      else if (v < f.minimum || v > f.maximum) errors.push(`${name} deve ficar entre ${f.minimum} e ${f.maximum}.`);
    } else if (f.type === 'date') {
      if (typeof v !== 'string' || (!(f.optional && v === '') && !isCalendarDate(v))) errors.push(`${name} deve ser uma data válida AAAA-MM-DD.`);
    } else {
      if (typeof v !== 'string') errors.push(`${name} deve ser texto.`);
      else if (f.enum && !f.enum.includes(v)) errors.push(`${name} deve ser um de: ${f.enum.join(', ')}.`);
      else if (v.length > (f.maxLength ?? 120)) errors.push(`${name} é longo demais.`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: record as T };
}
