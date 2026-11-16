import { describe, expect, it } from 'vitest';
import { translate } from '../src/dashboard/i18n';

describe('dashboard translations', () => {
  it('returns English text unchanged', () => {
    expect(translate('en', 'Overview')).toBe('Overview');
  });

  it('translates to Urdu and fills placeholders', () => {
    expect(translate('ur', 'Overview')).toBe('جائزہ');
    expect(translate('ur', '{n} left today', { n: 3 })).toBe('آج 3 باقی');
  });

  it('falls back to English for strings without a translation', () => {
    expect(translate('ur', 'Not translated yet')).toBe('Not translated yet');
  });
});
