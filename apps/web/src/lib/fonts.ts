import type { FontFamily } from '@microstore/site-schema';
import {
  Inter,
  Lato,
  Merriweather,
  Montserrat,
  Noto_Nastaliq_Urdu,
  Nunito,
  Open_Sans,
  Playfair_Display,
  Poppins,
  Roboto,
} from 'next/font/google';

// Self-hosted via next/font (no request to Google at runtime). Only the font a store uses is
// downloaded by the browser, so nothing is preloaded here.
const inter = Inter({ subsets: ['latin'], display: 'swap', preload: false });
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  display: 'swap',
  preload: false,
});
const roboto = Roboto({ subsets: ['latin'], display: 'swap', preload: false });
const openSans = Open_Sans({ subsets: ['latin'], display: 'swap', preload: false });
const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  display: 'swap',
  preload: false,
});
const montserrat = Montserrat({ subsets: ['latin'], display: 'swap', preload: false });
const nunito = Nunito({ subsets: ['latin'], display: 'swap', preload: false });
const playfair = Playfair_Display({ subsets: ['latin'], display: 'swap', preload: false });
const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  display: 'swap',
  preload: false,
});
const nastaliq = Noto_Nastaliq_Urdu({
  subsets: ['arabic'],
  weight: ['400', '700'],
  display: 'swap',
  preload: false,
});

const FONTS: Record<FontFamily, { style: { fontFamily: string } }> = {
  Inter: inter,
  Poppins: poppins,
  Roboto: roboto,
  'Open Sans': openSans,
  Lato: lato,
  Montserrat: montserrat,
  Nunito: nunito,
  'Playfair Display': playfair,
  Merriweather: merriweather,
  'Noto Nastaliq Urdu': nastaliq,
};

/** CSS font-family value for a whitelisted font, with system fallbacks. */
export function fontFamilyFor(font: FontFamily): string {
  return `${FONTS[font].style.fontFamily}, system-ui, sans-serif`;
}
