'use client';

import type { SiteConfig } from '@microstore/site-schema';
import { useEffect, useState } from 'react';
import { Button, Card, Field, Input, Notice, Textarea, Toggle } from '@/components/ui';
import { ImageUpload } from '@/components/ui/ImageUpload';
import { api, ApiError, type Store, type StoreSettings } from './api';
import { useT } from './i18n';
import { useDashboard } from './session';
import { useStoreActions } from './useStoreActions';

type Business = SiteConfig['business'];

function errorText(e: unknown) {
  if (e instanceof ApiError && Array.isArray(e.details) && e.details.length) {
    return (e.details as { path: string; message: string }[])
      .map((d) => `${d.path.split(/[./]/).pop()}: ${d.message}`)
      .join(' · ');
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

/** FR-6.6: store settings (applied immediately) and business details (saved to the draft). */
export function SettingsForm({ rootDomain }: { rootDomain: string }) {
  const { store, setStore, refreshStore, session } = useDashboard();
  const t = useT();
  const [confirmName, setConfirmName] = useState('');
  const [settings, setSettings] = useState<StoreSettings | null>(store?.settings ?? null);
  const [freeShipping, setFreeShipping] = useState(store?.settings.freeShippingThreshold !== null);
  const [subdomain, setSubdomain] = useState(store?.subdomain ?? '');
  const [business, setBusiness] = useState<Business | null>(null);
  const [msg, setMsg] = useState<Record<string, { tone: 'error' | 'success'; text: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const actions = useStoreActions();

  const storeId = store?.id;
  useEffect(() => {
    if (!storeId) return;
    api<{ config: SiteConfig }>(`/stores/${storeId}/config/draft`).then((r) =>
      setBusiness(r.config.business),
    );
  }, [storeId]);

  if (!store || !settings) return null;

  async function patchSettings(key: string, body: Record<string, unknown>) {
    if (!store) return;
    setBusy(key);
    setMsg((m) => ({ ...m, [key]: undefined as never }));
    try {
      const res = await api<{ store: Store }>(`/stores/${store.id}/settings`, {
        method: 'PATCH',
        body,
      });
      setStore(res.store);
      setSettings(res.store.settings);
      setSubdomain(res.store.subdomain ?? '');
      setMsg((m) => ({ ...m, [key]: { tone: 'success', text: 'Saved.' } }));
    } catch (e) {
      setMsg((m) => ({ ...m, [key]: { tone: 'error', text: errorText(e) } }));
    } finally {
      setBusy(null);
    }
  }

  async function saveBusiness() {
    if (!store || !business) return;
    setBusy('business');
    try {
      await api(`/stores/${store.id}/config/draft`, {
        method: 'PATCH',
        body: { patch: [{ op: 'replace', path: '/business', value: business }] },
      });
      await refreshStore();
      setMsg((m) => ({
        ...m,
        business: {
          tone: 'success',
          text: 'Saved. These details go live on your store when you publish.',
        },
      }));
    } catch (e) {
      setMsg((m) => ({ ...m, business: { tone: 'error', text: errorText(e) } }));
    } finally {
      setBusy(null);
    }
  }

  const note = (key: string) =>
    msg[key] ? <Notice tone={msg[key].tone}>{t(msg[key].text)}</Notice> : null;
  const setB = (patch: Partial<Business>) => setBusiness((b) => (b ? { ...b, ...patch } : b));
  const setContact = (patch: Partial<Business['contact']>) =>
    setBusiness((b) => (b ? { ...b, contact: { ...b.contact, ...patch } } : b));
  const setSocial = (patch: Partial<Business['social']>) =>
    setBusiness((b) => (b ? { ...b, social: { ...b.social, ...patch } } : b));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{t('Settings')}</h1>

      <Card title={t('Store address')}>
        <div className="space-y-4">
          <Field
            label="Subdomain"
            hint={`Changing it keeps the old address redirecting for 30 days.`}
          >
            {(p) => (
              <div className="flex items-center gap-2">
                <Input
                  {...p}
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
                  spellCheck={false}
                />
                <span className="shrink-0 text-sm text-neutral-500">.{rootDomain}</span>
              </div>
            )}
          </Field>
          {note('subdomain')}
          <Button
            variant="secondary"
            disabled={subdomain === store.subdomain}
            loading={busy === 'subdomain'}
            onClick={() => patchSettings('subdomain', { subdomain })}
          >
            Change address
          </Button>
        </div>
      </Card>

      <Card title={t('Delivery charges')}>
        <div className="space-y-4">
          <Field label={`Flat delivery fee (${store.currency})`}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={settings.shippingFlatFee}
                onChange={(e) => setSettings({ ...settings, shippingFlatFee: e.target.value })}
              />
            )}
          </Field>
          <Toggle
            label="Free delivery above an order amount"
            checked={freeShipping}
            onChange={setFreeShipping}
          />
          {freeShipping ? (
            <Field label={`Free delivery from (${store.currency})`}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={settings.freeShippingThreshold ?? ''}
                  onChange={(e) =>
                    setSettings({ ...settings, freeShippingThreshold: e.target.value })
                  }
                />
              )}
            </Field>
          ) : null}
          <CityRates
            currency={store.currency}
            rates={settings.cityShippingRates ?? []}
            onChange={(cityShippingRates) => setSettings({ ...settings, cityShippingRates })}
          />
          {note('shipping')}
          <Button
            variant="secondary"
            loading={busy === 'shipping'}
            onClick={() =>
              patchSettings('shipping', {
                shippingFlatFee: settings.shippingFlatFee.trim(),
                freeShippingThreshold: freeShipping
                  ? (settings.freeShippingThreshold ?? '').trim()
                  : null,
                cityShippingRates: (settings.cityShippingRates ?? []).map((r) => ({
                  city: r.city.trim(),
                  fee: r.fee.trim(),
                })),
              })
            }
          >
            Save delivery charges
          </Button>
        </div>
      </Card>

      <Card title={t('Storefront options')}>
        <div className="space-y-4">
          <Toggle
            label="WhatsApp chat button"
            description="Shows a floating WhatsApp button when you have a WhatsApp number."
            checked={settings.whatsappButton}
            disabled={busy === 'options'}
            onChange={(v) => patchSettings('options', { whatsappButton: v })}
          />
          <Toggle
            label="Right-to-left layout"
            description="For stores written in Urdu."
            checked={settings.rtl}
            disabled={busy === 'options'}
            onChange={(v) => patchSettings('options', { rtl: v })}
          />
          <Toggle
            label="Email order confirmations"
            description="Sent when the customer gives an email address."
            checked={settings.notifications.customerEmail}
            disabled={busy === 'options'}
            onChange={(v) => patchSettings('options', { notifications: { customerEmail: v } })}
          />
          {note('options')}
        </div>
      </Card>

      <Card title={t('Business details')}>
        {!business ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            <Field label="Store name">
              {(p) => (
                <Input
                  {...p}
                  value={business.name}
                  maxLength={80}
                  onChange={(e) => setB({ name: e.target.value })}
                />
              )}
            </Field>
            <Field label="Tagline" optional>
              {(p) => (
                <Input
                  {...p}
                  value={business.tagline}
                  maxLength={120}
                  onChange={(e) => setB({ tagline: e.target.value })}
                />
              )}
            </Field>
            <Field label="Description" optional>
              {(p) => (
                <Textarea
                  {...p}
                  value={business.description}
                  maxLength={500}
                  onChange={(e) => setB({ description: e.target.value })}
                />
              )}
            </Field>
            <ImageUpload
              storeId={store.id}
              purpose="logo"
              label="Logo"
              value={business.logoUrl}
              onChange={(url) => setB({ logoUrl: url })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    value={business.contact.phone}
                    onChange={(e) => setContact({ phone: e.target.value })}
                  />
                )}
              </Field>
              <Field label="WhatsApp" optional>
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    value={business.contact.whatsapp}
                    onChange={(e) => setContact({ whatsapp: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Email" optional>
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    value={business.contact.email}
                    onChange={(e) => setContact({ email: e.target.value })}
                  />
                )}
              </Field>
              <Field label="City">
                {(p) => (
                  <Input
                    {...p}
                    value={business.contact.city}
                    onChange={(e) => setContact({ city: e.target.value })}
                  />
                )}
              </Field>
            </div>
            <Field label="Address" optional>
              {(p) => (
                <Input
                  {...p}
                  value={business.contact.address}
                  onChange={(e) => setContact({ address: e.target.value })}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Facebook" optional>
                {(p) => (
                  <Input
                    {...p}
                    type="url"
                    value={business.social.facebook}
                    onChange={(e) => setSocial({ facebook: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Instagram" optional>
                {(p) => (
                  <Input
                    {...p}
                    type="url"
                    value={business.social.instagram}
                    onChange={(e) => setSocial({ instagram: e.target.value })}
                  />
                )}
              </Field>
              <Field label="TikTok" optional>
                {(p) => (
                  <Input
                    {...p}
                    type="url"
                    value={business.social.tiktok}
                    onChange={(e) => setSocial({ tiktok: e.target.value })}
                  />
                )}
              </Field>
            </div>
            {note('business')}
            {store.hasUnpublishedChanges ? (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset"
              >
                <span>
                  {store.status === 'published'
                    ? 'Your store still shows the old details. Publish to make the saved changes live (this also publishes any other unpublished design changes).'
                    : 'Your store is not published yet. Publish it to go live with these details.'}
                </span>
                <Button
                  variant="secondary"
                  className="h-9"
                  loading={actions.busy === 'publish'}
                  onClick={async () => {
                    const published = await actions.publish();
                    if (published)
                      setMsg((m) => ({
                        ...m,
                        business: {
                          tone: 'success',
                          text: 'Published. Your store now shows these details.',
                        },
                      }));
                  }}
                >
                  Publish now
                </Button>
              </div>
            ) : null}
            {actions.error ? <Notice tone="error">{actions.error}</Notice> : null}
            <Button onClick={saveBusiness} loading={busy === 'business'}>
              Save business details
            </Button>
          </div>
        )}
      </Card>

      {session.merchant.role === 'owner' ? (
        <Card title={t('Delete store')}>
          <div className="space-y-4">
            <p className="text-sm text-neutral-700">
              This permanently deletes the store, its pages, images and all Microstore orders with
              customer details. Orders already in Getorio stay there. This cannot be undone.
            </p>
            <Field label={`Type “${store.name}” to confirm`}>
              {(p) => (
                <Input
                  {...p}
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  autoComplete="off"
                />
              )}
            </Field>
            {note('delete')}
            <Button
              variant="danger"
              disabled={confirmName.trim() !== store.name}
              loading={busy === 'delete'}
              onClick={async () => {
                setBusy('delete');
                try {
                  await api(`/stores/${store.id}`, {
                    method: 'DELETE',
                    body: { confirmName: confirmName.trim() },
                  });
                  setStore(null);
                } catch (e) {
                  setMsg((m) => ({ ...m, delete: { tone: 'error', text: errorText(e) } }));
                } finally {
                  setBusy(null);
                }
              }}
            >
              Delete store permanently
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/** Phase 3: delivery fee per city. A listed city replaces the flat fee at checkout. */
function CityRates({
  currency,
  rates,
  onChange,
}: {
  currency: string;
  rates: { city: string; fee: string }[];
  onChange: (rates: { city: string; fee: string }[]) => void;
}) {
  const t = useT();
  const set = (i: number, patch: Partial<{ city: string; fee: string }>) =>
    onChange(rates.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-neutral-800">{t('Delivery fee by city')}</legend>
      <p className="text-sm text-neutral-600">
        {t('Cities not listed here pay the flat fee. Free delivery still applies.')}
      </p>
      {rates.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input
            aria-label={t('City {n}', { n: i + 1 })}
            placeholder="Karachi"
            maxLength={60}
            value={r.city}
            onChange={(e) => set(i, { city: e.target.value })}
          />
          <Input
            aria-label={t('Fee for city {n} ({currency})', { n: i + 1, currency })}
            inputMode="decimal"
            placeholder="250"
            className="w-32"
            value={r.fee}
            onChange={(e) => set(i, { fee: e.target.value })}
          />
          <Button
            variant="secondary"
            aria-label={t('Remove city {n}', { n: i + 1 })}
            onClick={() => onChange(rates.filter((_, j) => j !== i))}
          >
            ✕
          </Button>
        </div>
      ))}
      {rates.length < 50 ? (
        <Button variant="secondary" onClick={() => onChange([...rates, { city: '', fee: '' }])}>
          {t('Add city')}
        </Button>
      ) : null}
    </fieldset>
  );
}
