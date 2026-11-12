import { describe, expect, it } from 'vitest';
import {
  containsHtml,
  facebookUrlSchema,
  imageUrlSchema,
  instagramUrlSchema,
  isSafeLink,
  isValidPkPhone,
  linkSchema,
  normalizePkPhone,
  pkPhoneSchema,
  plainText,
  sanitizePlainText,
  tiktokUrlSchema,
} from '../src';

describe('containsHtml', () => {
  it.each(['<b>x</b>', '</p>', '<!-- c -->', '<?php', '<img src=x onerror=alert(1)>'])(
    'detects %s',
    (v) => expect(containsHtml(v)).toBe(true),
  );
  it.each([
    'a < b',
    '< script>',
    '5 > 3',
    'I <3 you',
    'plain text',
    '\u0627\u0631\u062f\u0648 \u0645\u062a\u0646',
  ])('allows %s', (v) => expect(containsHtml(v)).toBe(false));
});

describe('sanitizePlainText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(
      sanitizePlainText('  <b>Hello</b>\n  <script>alert(1)</script>world ', { maxLength: 100 }),
    ).toBe('Hello alert(1)world');
  });
  it('removes unterminated tags and control characters', () => {
    expect(sanitizePlainText('Hi\u0000 there <img src=x', { maxLength: 100 })).toBe('Hi there');
  });
  it('keeps single paragraphs breaks when multiline', () => {
    expect(sanitizePlainText('a\r\n\r\n\r\n  b \t c\nd', { maxLength: 100, multiline: true })).toBe(
      'a\n\nb c\nd',
    );
  });
  it('truncates by code points without splitting emoji', () => {
    expect(sanitizePlainText('\u{1F600}\u{1F600}\u{1F600}', { maxLength: 2 })).toBe(
      '\u{1F600}\u{1F600}',
    );
  });
});

describe('plainText', () => {
  const s = plainText(10, { min: 1 });
  it('accepts and trims', () => expect(s.parse('  hi  ')).toBe('hi'));
  it('rejects too short / too long', () => {
    expect(s.safeParse('').success).toBe(false);
    expect(s.safeParse('x'.repeat(11)).success).toBe(false);
  });
  it('rejects html, control chars and newlines', () => {
    expect(s.safeParse('<i>x</i>').success).toBe(false);
    expect(s.safeParse('a\u0007b').success).toBe(false);
    expect(s.safeParse('a\nb').success).toBe(false);
  });
  it('allows newlines when multiline', () => {
    expect(plainText(10, { multiline: true }).parse('a\nb')).toBe('a\nb');
  });
  it('counts Urdu text by code points', () => {
    expect(plainText(4).safeParse('\u0627\u0631\u062f\u0648').success).toBe(true);
  });
});

describe('links', () => {
  it.each([
    '/products',
    '/about#team',
    '/products?sort=new',
    'https://example.com/x',
    'http://example.com',
  ])('accepts %s', (v) => expect(isSafeLink(v)).toBe(true));
  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>',
    '//evil.com',
    '/\\evil.com',
    'vbscript:x',
    'ftp://x.com',
    'products',
    '/with space',
    'https://',
  ])('rejects %s', (v) => {
    expect(isSafeLink(v)).toBe(false);
    expect(linkSchema.safeParse(v).success).toBe(false);
  });
  it('requires https for images', () => {
    expect(imageUrlSchema.safeParse('https://cdn.x.com/a.png').success).toBe(true);
    expect(imageUrlSchema.safeParse('/placeholder.png').success).toBe(true);
    expect(imageUrlSchema.safeParse('http://cdn.x.com/a.png').success).toBe(false);
    expect(imageUrlSchema.safeParse('data:image/png;base64,xx').success).toBe(false);
  });
  it('restricts social links to their network', () => {
    expect(facebookUrlSchema.safeParse('https://www.facebook.com/shop').success).toBe(true);
    expect(facebookUrlSchema.safeParse('https://facebook.com.evil.io/shop').success).toBe(false);
    expect(facebookUrlSchema.safeParse('http://facebook.com/shop').success).toBe(false);
    expect(instagramUrlSchema.safeParse('https://instagram.com/shop').success).toBe(true);
    expect(tiktokUrlSchema.safeParse('https://www.tiktok.com/@shop').success).toBe(true);
    expect(tiktokUrlSchema.safeParse('https://instagram.com/shop').success).toBe(false);
  });
});

describe('Pakistani phone numbers', () => {
  it.each([
    ['03001234567', '+923001234567'],
    ['0300-1234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['+923451234567', '+923451234567'],
  ])('normalizes %s', (input, expected) => {
    expect(isValidPkPhone(input)).toBe(true);
    expect(normalizePkPhone(input)).toBe(expected);
    expect(pkPhoneSchema.parse(input)).toBe(expected);
  });
  it.each([
    '0300123456',
    '04212345678',
    '923001234567',
    '+92300123456',
    '+9230012345678',
    'abc',
    '',
  ])('rejects %s', (input) => {
    expect(isValidPkPhone(input)).toBe(false);
    expect(normalizePkPhone(input)).toBeNull();
    expect(pkPhoneSchema.safeParse(input).success).toBe(false);
  });
});
