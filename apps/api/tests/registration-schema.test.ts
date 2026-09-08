import { describe, expect, it } from 'vitest';
import { registerSchema, updateProfileSchema } from '@meridian/types';

/**
 * The registration and profile contracts, as a browser actually submits them.
 *
 * A form sends every field it holds, and an untouched text input arrives as ''
 * rather than being absent. An optional field that measures the empty string
 * therefore rejects accounts for a value the user never entered — and if the
 * field has no visible input, the account can never be created at all. These
 * cases pin the empty string to "not provided".
 */
describe('registration contract', () => {
  const valid = {
    firstName: 'Gideon',
    lastName: 'Mwangi',
    email: 'gideon@example.com',
    password: 'CorrectHorse1',
    timezone: 'Africa/Nairobi',
    marketingOptIn: false,
  };

  it('accepts a form that submits empty optional fields', () => {
    const result = registerSchema.safeParse({ ...valid, phone: '', company: '' });

    expect(result.success).toBe(true);
    expect(result.data?.phone).toBeUndefined();
    expect(result.data?.company).toBeUndefined();
  });

  it('still measures an optional field the user did fill in', () => {
    expect(registerSchema.safeParse({ ...valid, phone: '1234' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, phone: ' +254700000000 ' }).data?.phone).toBe(
      '+254700000000',
    );
  });

  it('reports a short password against the password, not a hidden field', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'Short1', phone: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['password']);
  });

  it('lets a profile field be cleared, which the API stores as null', () => {
    const result = updateProfileSchema.safeParse({ phone: '', company: '   ', jobTitle: '' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ phone: null, company: null, jobTitle: null });
  });

  it('keeps a profile field that holds a real value', () => {
    expect(updateProfileSchema.safeParse({ phone: '+254711111111' }).data?.phone).toBe(
      '+254711111111',
    );
    expect(updateProfileSchema.safeParse({ phone: '12' }).success).toBe(false);
  });
});
