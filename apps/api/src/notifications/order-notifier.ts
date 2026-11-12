import type { Db } from '../db';
import { storeSettingsSchema } from '../stores/settings';
import { maskContact, type EmailSender, type MessageSender } from './senders';

type Log = (msg: string, meta?: Record<string, unknown>) => void;

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function money(amount: { toFixed(n: number): string }, currency: string) {
  const value = Number(amount.toFixed(2));
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

/**
 * Customer notifications after checkout (FR-5.8): an email when the customer gave one and the
 * store has emails on, and an SMS/WhatsApp message through the optional hook. Never throws:
 * a failed notification must not affect the order.
 */
export class OrderNotifier {
  constructor(
    private readonly db: Db,
    private readonly email: EmailSender | null,
    private readonly message: MessageSender | null,
    private readonly log: Log = () => {},
  ) {}

  async orderPlaced(orderId: string): Promise<{ email: boolean; message: boolean }> {
    const result = { email: false, message: false };
    try {
      const order = await this.db.order.findUnique({
        where: { id: orderId },
        include: { items: true, store: true },
      });
      if (!order) return result;
      const settings = storeSettingsSchema.parse(order.store.settings);
      const store = order.store.name;
      const lines = order.items.map(
        (i) => `${i.nameSnapshot} × ${i.qty}: ${money(i.lineTotal, order.currency)}`,
      );
      const total = money(order.total, order.currency);

      if (this.email && order.customerEmail && settings.notifications.customerEmail) {
        const text = [
          `Hi ${order.customerName},`,
          '',
          `Thank you for your order from ${store}. Your order number is ${order.orderRef}.`,
          '',
          ...lines,
          `Delivery: ${Number(order.shippingFee) === 0 ? 'Free' : money(order.shippingFee, order.currency)}`,
          `Total (cash on delivery): ${total}`,
          '',
          `Delivery to: ${order.address}, ${order.city}`,
          'We will call you to confirm delivery. Please keep cash ready when it arrives.',
        ].join('\n');
        const html = `<p>Hi ${escapeHtml(order.customerName)},</p><p>Thank you for your order from <strong>${escapeHtml(store)}</strong>. Your order number is <strong>${escapeHtml(order.orderRef)}</strong>.</p><ul>${lines
          .map((l) => `<li>${escapeHtml(l)}</li>`)
          .join(
            '',
          )}</ul><p><strong>Total (cash on delivery): ${escapeHtml(total)}</strong></p><p>Delivery to: ${escapeHtml(order.address)}, ${escapeHtml(order.city)}</p><p>We will call you to confirm delivery. Please keep cash ready when it arrives.</p>`;
        try {
          await this.email.send({
            to: order.customerEmail,
            subject: `Order ${order.orderRef} received – ${store}`,
            text,
            html,
          });
          result.email = true;
        } catch (error) {
          this.log('order email failed', {
            orderId,
            to: maskContact(order.customerEmail),
            err: String(error),
          });
        }
      }

      if (this.message && settings.notifications.customerMessage) {
        try {
          await this.message.send({
            toPhone: order.customerPhone,
            text: `${store}: order ${order.orderRef} received. Total ${total}, cash on delivery. We will call to confirm.`,
          });
          result.message = true;
        } catch (error) {
          this.log('order message failed', {
            orderId,
            to: maskContact(order.customerPhone),
            err: String(error),
          });
        }
      }
    } catch (error) {
      this.log('order notification failed', { orderId, err: String(error) });
    }
    return result;
  }
}
