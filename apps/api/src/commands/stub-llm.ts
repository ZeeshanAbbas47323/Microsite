import { FONT_WHITELIST, type SiteConfig } from '@microstore/site-schema';
import { COMMAND_SCOPE } from './command-service';
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
  [/\bfeatures?\b|khoobiyan/, 'features'],
  [/categor/, 'categoryGrid'],
  [/faq|questions|sawal/, 'faq'],
  [/banner|announcement|elaan/, 'banner'],
  [/hero|top banner|main image/, 'hero'],
  [/about|image with text|hamare bare/, 'imageText'],
  [/featured|products? (grid|section)|trending/, 'productGrid'],
  [/contact (info|details)|rabta/, 'contactInfo'],
];

const UNSUPPORTED =
  /price|qeemat|checkout|cart page|payment|add (a |new )?page|naya page|logo|url|phone|number|address|ignore|system prompt|instructions|<|script|html|css|javascript|admin|product name/;

/** Links to other websites are never set by commands. */
const EXTERNAL = /https?:|www\.|\.(com|pk|net|org)\b/;

const PAGE_WORDS: [RegExp, string, string][] = [
  [/about/, 'about', '/about'],
  [/contact|rabta/, 'contact', '/contact'],
  [/products?|shop|dukaan/, 'products', '/products'],
  [/home/, 'home', '/'],
];

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

function allQuoted(text: string) {
  return [...text.matchAll(/["“](.+?)["”]/g)].map((m) => m[1] as string);
}

function out(
  status: CommandOutput['status'],
  summary: string,
  patch: CommandOutput['patch'] = [],
  clarification: string | null = null,
  suggestions: string[] = [],
): CommandOutput {
  return { status, summary, clarification, suggestions, patch };
}

function interpret({ config, command, language }: LlmRequest): CommandOutput {
  const c = command.toLowerCase();
  const done = language === 'ur' ? 'تبدیلی تیار ہے۔' : '';
  const say = (en: string) => (language === 'ur' ? done : en);
  const color = COLORS.find(([re]) => re.test(c))?.[1];
  const patch: CommandOutput['patch'] = [];
  const replace = (path: string, value: string | boolean) =>
    patch.push({ op: 'replace', path, from: null, value });

  if (EXTERNAL.test(c)) {
    return out(
      'unsupported',
      say("I can't link buttons to other websites, only to your store's pages."),
    );
  }
  const text = quoted(command);
  const sectionAt = (
    type: string,
    where?: (s: SiteConfig['pages'][number]['sections'][number]) => boolean,
  ) => config.pages[0]?.sections.findIndex((s) => s.type === type && (!where || where(s))) ?? -1;

  // Level 3: advice, no fake reviews, styles, copy, Urdu
  if (/kaisa lag|how does .* look|mashwara|kya behtar|any (ideas|suggestions)/.test(c)) {
    return out(
      'advice',
      say(
        'Your store is clean and easy to shop. A few changes could help customers trust it more.',
      ),
      [],
      null,
      [
        'FAQ mein sawal add karo: "Kya exchange hota hai?" jawab: "Haan, 7 din ke andar."',
        'About section ke liye achi si kahani likho',
        'home page ka Google title behtar likho',
      ],
    );
  }
  if (/testimonial|review/.test(c) && /likh|write/.test(c)) {
    return out(
      'unsupported',
      say("I can't write customer reviews. Please add real quotes in the editor."),
    );
  }
  if (/luxury|premium|elegant/.test(c)) {
    replace('/theme/primaryColor', '#1c1917');
    replace('/theme/secondaryColor', '#d6c7a1');
    replace('/theme/backgroundColor', '#fafaf9');
    replace('/theme/textColor', '#1c1917');
    replace('/theme/fontFamily', 'Playfair Display');
    replace('/theme/buttonStyle', 'square');
    replace('/theme/borderRadius', 'none');
    return out(
      'ok',
      say('Gives the store a luxury look: deep black, soft gold, a serif font and sharp buttons.'),
      patch,
    );
  }
  if (/\beid\b/.test(c) && /theme|lagao|rang/.test(c)) {
    replace('/theme/primaryColor', '#15803d');
    const banner = sectionAt('banner');
    if (text && banner >= 0) replace(`/pages/0/sections/${banner}/props/title`, text);
    return out('ok', say('Eid theme: green brand color and an Eid message in the banner.'), patch);
  }
  if (/kahani|story/.test(c) && /likh|write/.test(c)) {
    const story = sectionAt('imageText');
    if (story >= 0) {
      const { name, contact } = config.business;
      replace(
        `/pages/0/sections/${story}/props/body`,
        `${name} started${contact.city ? ` in ${contact.city}` : ''} with a simple idea: carefully chosen products, fair prices and friendly service. Every order is packed with care, and we are always happy to help on the phone or WhatsApp.`,
      );
      return out('ok', say('Writes a short story for your About section.'), patch);
    }
  }
  if (/urdu/.test(c) && /heading|title|headline/.test(c)) {
    const hero = sectionAt('hero');
    if (hero >= 0) {
      replace(`/pages/0/sections/${hero}/props/title`, 'ہمارے اسٹور میں خوش آمدید');
      replace('/theme/fontFamily', 'Noto Nastaliq Urdu');
      return out(
        'ok',
        say('Writes the main heading in Urdu. Turn on right-to-left in Settings.'),
        patch,
      );
    }
  }

  // Level 2: FAQ / feature items, grids, search engines
  const quotes = allQuoted(command);
  if (/faq/.test(c) && /sawal|question/.test(c) && /add/.test(c) && quotes.length >= 2) {
    const faq = sectionAt('faq');
    if (faq >= 0) {
      const count = (config.pages[0]?.sections[faq]?.props as { items: unknown[] }).items.length;
      patch.push({
        op: 'add',
        path: `/pages/0/sections/${faq}/props/items/-`,
        from: null,
        value: quotes[0] as string,
      });
      replace(`/pages/0/sections/${faq}/props/items/${count}/answer`, quotes[1] as string);
      return out('ok', say('Adds a question and answer to the FAQ.'), patch);
    }
  }
  if (/features?\b/.test(c) && /\badd\b/.test(c) && text && !/section/.test(c)) {
    const features = sectionAt('features');
    if (features >= 0) {
      patch.push({
        op: 'add',
        path: `/pages/0/sections/${features}/props/items/-`,
        from: null,
        value: text,
      });
      return out('ok', say(`Adds “${text}” to the features.`), patch);
    }
  }
  const howMany = /(\d{1,2})\s*products/.exec(c);
  if (howMany) {
    const source = /featured/.test(c) ? 'featured' : /naye|new|latest/.test(c) ? 'latest' : null;
    const grid = sectionAt(
      'productGrid',
      (s) => !source || (s.props as { source: string }).source === source,
    );
    if (grid >= 0) {
      patch.push({
        op: 'replace',
        path: `/pages/0/sections/${grid}/props/limit`,
        from: null,
        value: Number(howMany[1]),
      });
      return out('ok', say(`Shows ${howMany[1]} products in that section.`), patch);
    }
  }
  if (text && /google|seo|search/.test(c)) {
    replace('/pages/0/seo/title', text);
    return out('ok', say(`Sets the home page title in Google to “${text}”.`), patch);
  }

  // Layout switch
  const layout = COMMAND_SCOPE.layouts?.find((l) => c.includes(l.name.toLowerCase()));
  if (/layout|design badal/.test(c) && layout) {
    replace('/layoutId', layout.id);
    return out('ok', say(`Switches to the ${layout.name} layout.`), patch);
  }

  // Add or delete a section on the home page
  const typeWord = SECTION_WORDS.find(([re]) => re.test(c))?.[1];
  if (typeWord && /\badd\b|naya|daal|laga/.test(c) && /section/.test(c)) {
    patch.push({ op: 'add', path: '/pages/0/sections/-', from: null, value: typeWord });
    return out('ok', say(`Adds a ${typeWord} section at the end of the home page.`), patch);
  }
  if (typeWord && /delete|mita/.test(c)) {
    const idx = homeSectionIndex(config, typeWord);
    if (idx >= 0) {
      patch.push({ op: 'remove', path: `/pages/0/sections/${idx}`, from: null, value: null });
      return out('ok', say(`Deletes the ${typeWord} section from the home page.`), patch);
    }
  }

  // Hero extras, page names and button links
  const hero = homeSectionIndex(config, 'hero');
  if (text && hero >= 0 && /chhoti line|small line|eyebrow|upar (wali |chhoti )?line/.test(c)) {
    replace(`/pages/0/sections/${hero}/props/eyebrow`, text);
    return out('ok', say(`Adds “${text}” above the main heading.`), patch);
  }
  const pageWord = PAGE_WORDS.find(([re]) => re.test(c));
  if (text && pageWord && /naam|name|rename|menu/.test(c)) {
    const idx = config.pages.findIndex((p) => p.slug === pageWord[1]);
    if (idx >= 0) {
      replace(`/pages/${idx}/title`, text);
      return out('ok', say(`Renames the ${pageWord[1]} page to “${text}” in the menu.`), patch);
    }
  }
  if (hero >= 0 && /button/.test(c) && /le jao|link|point|bhejo/.test(c)) {
    // The button's own label ("Shop now") is not the destination; look after it.
    const target = PAGE_WORDS.filter(([, slug]) => slug !== 'products').find(([re]) => re.test(c));
    if (target) {
      replace(`/pages/0/sections/${hero}/props/ctaLink`, target[2]);
      return out('ok', say(`Points the main button to ${target[2]}.`), patch);
    }
  }

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
  if (text && /footer/.test(c) && /about|brand|description|bare/.test(c)) {
    replace('/footer/about', text);
    return out('ok', say(`Sets the footer brand description to “${text}”.`), patch);
  }
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

  // Footer bottom line alignment
  if (/footer/.test(c)) {
    const align = /cent(er|re)|beech|darmiyan/.test(c)
      ? 'center'
      : /\bleft\b|baen|bayen/.test(c)
        ? 'left'
        : /\bright\b|daen|dayen/.test(c)
          ? 'right'
          : null;
    if (align) {
      replace('/footer/bottomAlign', align);
      return out('ok', say(`Aligns the footer bottom line to the ${align}.`), patch);
    }
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
