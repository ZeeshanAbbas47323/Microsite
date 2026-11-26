import { describe, expect, it } from 'vitest';
import { safeParseSiteConfig, validateCommandPatch, type SiteConfig } from '../src';
import { sampleConfig } from './fixtures';

const withBar = (announcement: Partial<SiteConfig['announcement']>) => {
  const c = sampleConfig();
  return { ...c, announcement: { ...c.announcement, ...announcement } };
};

describe('announcement bar', () => {
  it('new stores get a ready message, switched off', () => {
    const c = sampleConfig();
    expect(c.announcement.enabled).toBe(false);
    expect(c.announcement.messages).toHaveLength(1);
  });

  it('configs saved before the bar existed still parse, with it off', () => {
    const { announcement: _drop, ...old } = sampleConfig();
    const parsed = safeParseSiteConfig(old);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.announcement).toMatchObject({ enabled: false, messages: [], speed: 5 });
    }
  });

  it('accepts up to five messages with store paths or https links', () => {
    const messages = [
      { text: 'Free delivery over Rs 3,000', link: '/products' },
      { text: 'Eid sale is live', link: 'https://example.com/eid' },
      { text: 'Cash on delivery', link: '' },
      { text: 'Four', link: '' },
      { text: 'Five', link: '' },
    ];
    expect(safeParseSiteConfig(withBar({ enabled: true, messages, speed: 3 })).success).toBe(true);
    expect(
      safeParseSiteConfig(withBar({ messages: [...messages, { text: 'Six', link: '' }] })).success,
    ).toBe(false);
  });

  it('rejects unsafe links, empty text and unknown speeds', () => {
    const bad = [
      withBar({ messages: [{ text: 'Hi', link: 'javascript:alert(1)' }] }),
      withBar({ messages: [{ text: '  ', link: '' }] }),
      withBar({ messages: [{ text: 'x'.repeat(101), link: '' }] }),
      { ...sampleConfig(), announcement: { ...sampleConfig().announcement, speed: 4 } },
    ];
    for (const c of bad) expect(safeParseSiteConfig(c).success).toBe(false);
  });

  it('the AI assistant may switch it on and reword a message, with a contrast check', () => {
    const config = withBar({ messages: [{ text: 'Old', link: '' }] });
    const ok = validateCommandPatch(config, [
      { op: 'replace', path: '/announcement/enabled', value: true },
      { op: 'replace', path: '/announcement/messages/0/text', value: 'Eid sale: 20% off' },
    ]);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.config.announcement.messages[0]?.text).toBe('Eid sale: 20% off');

    const low = validateCommandPatch(config, [
      { op: 'replace', path: '/announcement/textColor', value: '#111111' },
    ]);
    expect(low.ok && low.warnings.some((w) => w.code === 'low_contrast')).toBe(true);

    const link = validateCommandPatch(config, [
      { op: 'replace', path: '/announcement/messages/0/link', value: 'https://evil.test' },
    ]);
    expect(link.ok).toBe(false);
  });
});
