import { contrastRatio, type SiteConfig } from '@microstore/site-schema';
import type { CSSProperties } from 'react';

const RADIUS = { none: '0px', sm: '4px', md: '8px', lg: '14px', xl: '22px' } as const;

/** Black or white, whichever reads better on `background`. */
export function onColor(background: string): string {
  return contrastRatio('#ffffff', background) >= contrastRatio('#111111', background)
    ? '#ffffff'
    : '#111111';
}

/** The whole theme as CSS custom properties, so every layout honours every setting (FR-3.3). */
export function themeStyle(config: SiteConfig, fontFamily?: string): CSSProperties {
  const { theme, navbar } = config;
  const radius = RADIUS[theme.borderRadius];
  const buttonRadius =
    theme.buttonStyle === 'pill' ? '999px' : theme.buttonStyle === 'square' ? '0px' : radius;
  return {
    '--ms-primary': theme.primaryColor,
    '--ms-on-primary': onColor(theme.primaryColor),
    '--ms-secondary': theme.secondaryColor,
    '--ms-on-secondary': onColor(theme.secondaryColor),
    '--ms-bg': theme.backgroundColor,
    '--ms-text': theme.textColor,
    '--ms-muted': `color-mix(in srgb, ${theme.textColor} 68%, ${theme.backgroundColor})`,
    '--ms-border': `color-mix(in srgb, ${theme.textColor} 14%, ${theme.backgroundColor})`,
    '--ms-surface': `color-mix(in srgb, ${theme.textColor} 4%, ${theme.backgroundColor})`,
    '--ms-nav-bg': navbar.backgroundColor,
    '--ms-nav-text': navbar.textColor,
    '--ms-radius': radius,
    '--ms-btn-radius': buttonRadius,
    fontFamily: fontFamily ?? `'${theme.fontFamily}', system-ui, sans-serif`,
    backgroundColor: theme.backgroundColor,
    color: theme.textColor,
  } as CSSProperties;
}

export function formatMoney(amount: string, currency: string, locale = 'en-PK'): string {
  const value = Number(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    // Whole amounts show no decimals (Rs 3,400); others always two (Rs 99.50).
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}
