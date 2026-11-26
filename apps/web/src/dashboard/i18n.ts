import { useCallback } from 'react';
import { useDashboard, type Locale } from './session';

/**
 * Dashboard UI strings in Urdu (§9: English and Urdu merchant UI). The English text is the key, so
 * anything not translated yet simply stays in English. `{name}` placeholders are filled by `t`.
 */
const UR: Record<string, string> = {
  // Shell
  Overview: 'جائزہ',
  Domains: 'ڈومینز',
  Customers: 'کسٹمرز',
  Discounts: 'ڈسکاؤنٹس',
  Design: 'ڈیزائن',
  Products: 'پروڈکٹس',
  Orders: 'آرڈرز',
  Settings: 'سیٹنگز',
  Admin: 'ایڈمن',
  Dashboard: 'ڈیش بورڈ',
  'View store ↗': 'اسٹور دیکھیں ↗',
  'Sign out': 'سائن آؤٹ',
  Export: 'ایکسپورٹ',
  'Needs attention': 'توجہ درکار',
  filtered: 'فلٹر شدہ',
  'On store': 'اسٹور پر',
  Hidden: 'چھپی ہوئی',
  Featured: 'نمایاں',
  'Out of stock': 'اسٹاک ختم',
  'Sales channels': 'سیلز چینلز',
  'Online store': 'آن لائن اسٹور',
  '(opens in a new tab)': '(نئے ٹیب میں کھلتا ہے)',
  Language: 'زبان',
  Live: 'لائیو',
  Suspended: 'معطل',
  'Not published': 'شائع نہیں ہوا',

  // Overview
  'Last published {date}': 'آخری بار شائع ہوا {date}',
  'Customers can’t see your store until you publish it.':
    'جب تک آپ اسٹور شائع نہیں کرتے، کسٹمرز اسے نہیں دیکھ سکتے۔',
  'You have changes that customers can’t see yet.':
    'آپ کی کچھ تبدیلیاں ابھی کسٹمرز کو نظر نہیں آ رہیں۔',
  'This store is suspended. Contact Getorio support.':
    'یہ اسٹور معطل ہے۔ Getorio سپورٹ سے رابطہ کریں۔',
  'Edit design': 'ڈیزائن تبدیل کریں',
  Unpublish: 'شائع کرنا بند کریں',
  'Publish changes': 'تبدیلیاں شائع کریں',
  'Publish store': 'اسٹور شائع کریں',
  'Choose products': 'پروڈکٹس منتخب کریں',
  'Pick which Getorio products appear.': 'منتخب کریں کہ کون سی Getorio پروڈکٹس نظر آئیں۔',
  'See orders and their Getorio status.': 'آرڈرز اور ان کا Getorio اسٹیٹس دیکھیں۔',
  'Shipping, contact details, address.': 'شپنگ، رابطے کی تفصیل، پتہ۔',
  'Recent orders': 'حالیہ آرڈرز',
  'View all': 'سب دیکھیں',
  'Loading…': 'لوڈ ہو رہا ہے…',
  'No orders yet. Share your store link to get your first order.':
    'ابھی کوئی آرڈر نہیں۔ پہلا آرڈر پانے کے لیے اپنے اسٹور کا لنک شیئر کریں۔',

  // Command box
  'Design assistant': 'ڈیزائن اسسٹنٹ',
  'The design assistant is not available right now. You can still change everything with the settings below.':
    'ڈیزائن اسسٹنٹ ابھی دستیاب نہیں۔ آپ نیچے دی گئی سیٹنگز سے سب کچھ تبدیل کر سکتے ہیں۔',
  'Ask the assistant': 'اسسٹنٹ سے کہیں',
  '{n} left today': 'آج {n} باقی',
  'Describe a design change': 'ڈیزائن کی تبدیلی لکھیں',
  'e.g. Make the navbar dark blue': 'مثلاً navbar ka color dark blue kardo',
  Suggest: 'تجویز کریں',
  Examples: 'مثالیں',
  'Working on it…': 'کام ہو رہا ہے…',
  'Suggested:': 'تجویز:',
  'Design change ready.': 'ڈیزائن کی تبدیلی تیار ہے۔',
  'The preview shows this change. It is not saved yet.':
    'پری ویو میں یہ تبدیلی نظر آ رہی ہے۔ یہ ابھی محفوظ نہیں ہوئی۔',
  Apply: 'لاگو کریں',
  Discard: 'رد کریں',
  'I can:': 'میں یہ کر سکتا ہوں:',
  'Change applied to your draft.': 'تبدیلی آپ کے ڈرافٹ میں لاگو ہو گئی۔',
  Undo: 'واپس کریں',
  'Something went wrong': 'کچھ غلط ہو گیا',
  'Could not apply the change': 'تبدیلی لاگو نہیں ہو سکی',
  'Could not undo': 'واپس نہیں ہو سکا',
  'In Getorio': 'Getorio میں',
  'Sync failed': 'سنک ناکام',
  Cancelled: 'منسوخ',
  'Sending to Getorio': 'Getorio کو بھیجا جا رہا ہے',

  // Design editor
  'Save draft': 'ڈرافٹ محفوظ کریں',
  'Saving…': 'محفوظ ہو رہا ہے…',
  Preview: 'پری ویو',
  Theme: 'تھیم',
  Navbar: 'نیوبار',
  Footer: 'فوٹر',
  Pages: 'صفحات',
  Sections: 'سیکشنز',
  History: 'ہسٹری',
  Layout: 'لے آؤٹ',
  Restore: 'بحال کریں',
  'Draft saved. Publish to make it live.': 'ڈرافٹ محفوظ ہو گیا۔ لائیو کرنے کے لیے شائع کریں۔',

  // Orders / products / settings
  Save: 'محفوظ کریں',
  Cancel: 'منسوخ کریں',
  Search: 'تلاش',
  Status: 'اسٹیٹس',
  Total: 'کل',
  Customer: 'کسٹمر',
  Date: 'تاریخ',
  Order: 'آرڈر',
  'No orders yet.': 'ابھی کوئی آرڈر نہیں۔',
  'Settings saved.': 'سیٹنگز محفوظ ہو گئیں۔',
  Refresh: 'ریفریش',
  'Filter orders': 'آرڈرز فلٹر کریں',
  All: 'سب',
  Sending: 'بھیجے جا رہے',
  Failed: 'ناکام',
  'Products, prices and stock come from Getorio. Choose what shows on your store; changes go live right away.':
    'پروڈکٹس، قیمتیں اور اسٹاک Getorio سے آتے ہیں۔ منتخب کریں کہ اسٹور پر کیا دکھے؛ تبدیلیاں فوراً لائیو ہو جاتی ہیں۔',
  'Saved.': 'محفوظ ہو گیا۔',
  'Saved to your draft. Publish to show it on the store.':
    'ڈرافٹ میں محفوظ ہو گیا۔ اسٹور پر دکھانے کے لیے شائع کریں۔',
  'Store address': 'اسٹور کا پتہ',
  'Delivery charges': 'ڈیلیوری چارجز',
  'Storefront options': 'اسٹور کے آپشنز',
  'Business details': 'کاروبار کی تفصیل',
  'Delete store': 'اسٹور ڈیلیٹ کریں',
  'Delivery fee by city': 'شہر کے حساب سے ڈیلیوری فیس',
  'Cities not listed here pay the flat fee. Free delivery still applies.':
    'جو شہر یہاں درج نہیں، وہاں فلیٹ فیس لگے گی۔ مفت ڈیلیوری پھر بھی لاگو ہوگی۔',
  'City {n}': 'شہر {n}',
  'Fee for city {n} ({currency})': 'شہر {n} کی فیس ({currency})',
  'Remove city {n}': 'شہر {n} ہٹائیں',
  'Add city': 'شہر شامل کریں',
  'Store performance': 'اسٹور کی کارکردگی',
  'Time range': 'مدت',
  '{n} days': '{n} دن',
  'Could not load the numbers.': 'اعداد و شمار لوڈ نہیں ہو سکے۔',
  Visits: 'وزٹس',
  Sales: 'سیلز',
  Conversion: 'کنورژن',
  'Visits per day': 'روزانہ وزٹس',
  'Show as table': 'ٹیبل میں دیکھیں',
  'Hide table': 'ٹیبل چھپائیں',
  'Visits count browser sessions on your store. Bots and previews are not counted.':
    'وزٹس آپ کے اسٹور پر براؤزر سیشنز کی گنتی ہیں۔ بوٹس اور پری ویو شامل نہیں۔',
  Publish: 'شائع کریں',
  'Unsaved changes': 'غیر محفوظ تبدیلیاں',
  'Draft not published': 'ڈرافٹ شائع نہیں ہوا',
  'Up to date': 'اپ ٹو ڈیٹ',
  'Your store is ready as a draft. Adjust the design, then press Publish when you are happy.':
    'آپ کا اسٹور ڈرافٹ کے طور پر تیار ہے۔ ڈیزائن ٹھیک کریں، پھر مطمئن ہو کر شائع کریں دبائیں۔',
  'Save or discard your manual changes first, then ask the assistant.':
    'پہلے اپنی تبدیلیاں محفوظ یا رد کریں، پھر اسسٹنٹ سے کہیں۔',
  'Design settings': 'ڈیزائن سیٹنگز',
  'Header & footer': 'ہیڈر اور فوٹر',
  'Published. Your store is live with these changes.':
    'شائع ہو گیا۔ آپ کا اسٹور ان تبدیلیوں کے ساتھ لائیو ہے۔',
  'Change undone.': 'تبدیلی واپس ہو گئی۔',
  Exit: 'باہر نکلیں',
  'Try one of these:': 'ان میں سے کوئی آزمائیں:',
  Redo: 'دوبارہ کریں',
  'AI assistant': 'AI اسسٹنٹ',
  'Version history': 'ورژن ہسٹری',
  'Add page': 'صفحہ شامل کریں',
  'Add a page': 'صفحہ شامل کریں',
  'Preview size': 'پری ویو کا سائز',
  'Theme settings': 'تھیم سیٹنگز',
  Back: 'واپس',
  Close: 'بند کریں',
  Dismiss: 'ہٹائیں',
  Page: 'صفحہ',
  Editor: 'ایڈیٹر',
  Add: 'شامل کریں',
  'Version restored into your draft.': 'ورژن آپ کے ڈرافٹ میں بحال ہو گیا۔',
  'Preview shows your unsaved changes. Save to keep them.':
    'پری ویو میں آپ کی غیر محفوظ تبدیلیاں نظر آ رہی ہیں۔ رکھنے کے لیے محفوظ کریں۔',
  'Preview includes the suggested change (not saved yet)':
    'پری ویو میں تجویز کردہ تبدیلی شامل ہے (ابھی محفوظ نہیں)',
  'Live preview of your draft': 'آپ کے ڈرافٹ کا لائیو پری ویو',
};

const DICTIONARIES: Record<Locale, Record<string, string>> = { en: {}, ur: UR };

export function translate(
  locale: Locale,
  text: string,
  vars?: Record<string, string | number>,
): string {
  let out = DICTIONARIES[locale][text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

/** `const t = useT(); t('Overview')` — falls back to the English text. */
export function useT() {
  const { locale } = useDashboard();
  return useCallback(
    (text: string, vars?: Record<string, string | number>) => translate(locale, text, vars),
    [locale],
  );
}
