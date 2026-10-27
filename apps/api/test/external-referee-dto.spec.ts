import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateExternalRefereeDto } from '../src/external-referees/dto/create-external-referee.dto';

const valid = {
  name: 'Asha Menon',
  email: 'asha@example.com',
  phone: '+91 98765 43210',
  state: 'Kerala',
  district: 'Kozhikode',
};

const errorsFor = (body: Record<string, unknown>) =>
  validateSync(plainToInstance(CreateExternalRefereeDto, body)).map((e) => e.property);

describe('CreateExternalRefereeDto', () => {
  it('accepts a complete referee', () => {
    expect(errorsFor(valid)).toEqual([]);
  });

  it.each(['name', 'email', 'phone', 'state', 'district'])('requires %s', (key) => {
    expect(errorsFor({ ...valid, [key]: '' })).toContain(key);
    expect(errorsFor({ ...valid, [key]: '   ' })).toContain(key);
  });

  it('rejects a malformed email', () => {
    expect(errorsFor({ ...valid, email: 'not-an-email' })).toContain('email');
  });

  it('rejects a phone with fewer than 7 digits', () => {
    expect(errorsFor({ ...valid, phone: '12-34' })).toContain('phone');
  });

  it('accepts a phone with exactly 7 digits and punctuation', () => {
    expect(errorsFor({ ...valid, phone: '(123) 456-7' })).toEqual([]);
  });

  it('trims surrounding whitespace', () => {
    const dto = plainToInstance(CreateExternalRefereeDto, { ...valid, name: '  Asha  ' });
    expect(dto.name).toBe('Asha');
  });
});
