import { FONT_WHITELIST, type SiteConfig } from '@microstore/site-schema';
import type { CommandLlm, CommandOutput, LlmRequest, LlmResult } from './llm';

/**
 * Deterministic stand-in for the model (requirements §12: tests use a stub). Understands a fixed
 * set of English / Roman Urdu phrasings. Also usable for local demos without an API key
 * (`COMMAND_LLM=stub`). `raw:<json>` returns that JSON verbatim, to test server-side rejection.
 */
export class StubCommandLlm implements CommandLlm {
  readonly model = 'stub';
  readonly calls: LlmRequest[] = [];

  async propose(request: LlmRequest): Promise<LlmResult> {
    this.calls.push(request);
    const raw = request.command.startsWith('raw:')
      ? safeJson(request.command.slice(4))
      : interpret(request);
    return { raw, model: this.model, promptTokens: 0, completionTokens: 0 };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const COLORS: [RegExp, string][] = [
  [/dark blue|gehra neela|gehra blue/, '#1e3a8a'],
  [/navy/, '#1e3a8a'],
  [/light blue|halka neela/, '#93c5fd'],
  [/\bblue\b|neela|nila/, '#2563eb'],
  [/black|kala|kaala/, '#111111'],
  [/white|safaid|safed/, '#ffffff'],
  [/\bred\b|laal|lal\b/, '#dc2626'],
  [/green|hara\b/, '#16a34a'],
  [/pink|gulabi/, '#db2777'],
  [/yellow|peela|pila\b/, '#eab308'],
  [/purple|jamni/, '#7c3aed'],
  [/orange|narangi/, '#ea580c'],
  [/grey|gray|surmai/, '#6b7280'],
  [/teal/, '#0f766e'],
];

const SECTION_WORDS: [RegExp, string][] = [
  [/testimonial|reviews?/, 'testimonials'],
  [/faq|questions|sawal/, 'faq'],
  [/banner|announcement|elaan/, 'banner'],
  [/hero|top banner|main image/, 'hero'],
  [/about|image with text|hamare bare/, 'imageText'],
  [/featured|products? (grid|section)|trending/, 'productGrid'],
  [/contact (info|details)|rabta/, 'contactInfo'],
];

const UNSUPPORTED =
  /layout|price|qeemat|checkout|cart page|payment|add (a |new )?(section|page)|naya section|logo|link|url|phone|number|address|delete|ignore|system prompt|instructions|<|script|html|css|javascript|admin|product name/;

function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff';
}

function homeSectionIndex(config: SiteConfig, type: string) {
  return config.pages[0]?.sections.findIndex((s) => s.type === type) ?? -1;
}

function quoted(text: string) {
  return /["“](.+?)["”]/.exec(text)?.[1] ?? null;
}

function out(
  status: CommandOutput['status'],
  summary: string,
  patch: CommandOutput['patch'] = [],
  clarification: string | null = null,
): CommandOutput {
  return { status, summary, clarification, patch };
}

function interpret({ config, command, language }: LlmRequest): CommandOutput {
  const c = command.toLowerCase();
  const done = language === 'ur' ? 'تبدیلی تیار ہے۔' : '';
  const say = (en: string) => (language === 'ur' ? done : en);
  const color = COLORS.find(([re]) => re.test(c))?.[1];
  const patch: CommandOutput['patch'] = [];
  const replace = (path: string, value: string | boolean) =>
    patch.push({ op: 'replace', path, from: null, value });

  if (UNSUPPORTED.test(c)) {
    return out(
      'unsupported',
      say(
        "I can't change that yet. I can change colors, fonts, buttons, the navigation bar, the footer, and show, hide or reorder sections.",
      ),
    );
  }

  // Section visibility and order
  const sectionType = SECTION_WORDS.find(([re]) => re.test(c))?.[1];
  const hide = /\bhide\b|chupa|chhupa|hata|remove|band kar/.test(c);
  const show = /\bshow\b|dikha|wapas|bring back/.test(c);
  const toTop = /to (the )?top|upar|sab se pehle|first/.test(c);
  const toBottom = /to (the )?bottom|neeche|last/.test(c);
  if (sectionType && (hide || show || toTop || toBottom)) {
    const idx = homeSectionIndex(config, sectionType);
    if (idx < 0)
      return out(
        'clarify',
        '',
        [],
        say(
          `I couldn't find a ${sectionType} section on the home page. Which section do you mean?`,
        ) || 'کون سا سیکشن؟',
      );
    if (toTop || toBottom) {
      const last = (config.pages[0]?.sections.length ?? 1) - 1;
      patch.push({
        op: 'move',
        from: `/pages/0/sections/${idx}`,
        path: `/pages/0/sections/${toTop ? 0 : last}`,
        value: null,
      });
      return out(
        'ok',
        say(
          `Moves the ${sectionType} section to the ${toTop ? 'top' : 'bottom'} of the home page.`,
        ),
        patch,
      );
    }
    replace(`/pages/0/sections/${idx}/visible`, !hide);
    return out(
      'ok',
      say(`${hide ? 'Hides' : 'Shows'} the ${sectionType} section on the home page.`),
      patch,
    );
  }

  // Text
  const text = quoted(command);
  if (text && /footer/.test(c)) {
    replace('/footer/text', text);
    return out('ok', say(`Sets the footer text to “${text}”.`), patch);
  }
  if (text && /title|heading|headline/.test(c)) {
    const idx = homeSectionIndex(config, 'hero');
    if (idx < 0) return out('unsupported', say('There is no hero section to retitle.'));
    replace(`/pages/0/sections/${idx}/props/title`, text);
    return out('ok', say(`Changes the main heading to “${text}”.`), patch);
  }
  if (text && /button (text|label)/.test(c)) {
    const idx = homeSectionIndex(config, 'hero');
    replace(`/pages/0/sections/${idx}/props/ctaLabel`, text);
    return out('ok', say(`Changes the main button text to “${text}”.`), patch);
  }

  // Font
  const font = FONT_WHITELIST.find((f) => c.includes(f.toLowerCase()));
  if (font && /font/.test(c)) {
    replace('/theme/fontFamily', font);
    return out('ok', say(`Changes the font to ${font}.`), patch);
  }
  if (/font/.test(c))
    return out(
      'unsupported',
      say(`That font isn't available. Choose one of: ${FONT_WHITELIST.join(', ')}.`),
    );

  // Navbar
  if (/navbar|nav bar|header|menu bar/.test(c)) {
    if (color) {
      replace('/navbar/backgroundColor', color);
      replace('/navbar/textColor', onColor(color));
      return out('ok', say(`Makes the navigation bar ${color} with readable text.`), patch);
    }
    if (/not sticky|scroll away|fix(ed)? na/.test(c)) replace('/navbar/sticky', false);
    else if (/sticky|fixed|chipka/.test(c)) replace('/navbar/sticky', true);
    if (/center/.test(c)) replace('/navbar/style', 'centered');
    if (/left/.test(c)) replace('/navbar/style', 'left');
    if (/minimal|simple/.test(c)) replace('/navbar/style', 'minimal');
    if (patch.length) return out('ok', say('Updates the navigation bar.'), patch);
  }
  if (/hide (the )?cart|cart (icon )?(hata|chupa)/.test(c)) {
    replace('/navbar/showCart', false);
    return out('ok', say('Hides the cart icon.'), patch);
  }

  // Buttons and corners
  if (/round(ed)? button|pill|gol button/.test(c)) replace('/theme/buttonStyle', 'pill');
  else if (/square button|seedhe kone/.test(c)) replace('/theme/buttonStyle', 'square');
  if (/sharp corners|no rounding/.test(c)) replace('/theme/borderRadius', 'none');
  if (patch.length) return out('ok', say('Updates the button and corner style.'), patch);

  // Theme colors
  if (color) {
    if (/background|pichla|pas-e-manzar/.test(c)) {
      replace('/theme/backgroundColor', color);
      replace('/theme/textColor', onColor(color));
      return out('ok', say(`Changes the page background to ${color}.`), patch);
    }
    if (/secondary/.test(c)) {
      replace('/theme/secondaryColor', color);
      return out('ok', say(`Changes the secondary color to ${color}.`), patch);
    }
    if (/text|likhai/.test(c)) {
      replace('/theme/textColor', color);
      return out('ok', say(`Changes the text color to ${color}.`), patch);
    }
    replace('/theme/primaryColor', color);
    return out('ok', say(`Changes the main brand color to ${color}.`), patch);
  }

  // Footer style
  if (/footer/.test(c) && /column/.test(c)) {
    replace('/footer/style', 'columns');
    return out('ok', say('Switches the footer to columns.'), patch);
  }

  return out(
    'clarify',
    '',
    [],
    language === 'ur'
      ? 'آپ کیا تبدیل کرنا چاہتے ہیں؟'
      : 'What would you like to change, for example a color, the font or a section?',
  );
}
