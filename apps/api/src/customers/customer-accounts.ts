import { createHash } from 'node:crypto';
import { emailSchema, normalizePkPhone, pkPhoneSchema, plainText } from '@microstore/site-schema';
import { z } from 'zod';
import type { Db } from '../db';
import {
  Prisma,
  type Customer,
  type CustomerAddress,
  type Store,
} from '../generated/prisma/client';
import type { KeyValueCache } from '../lib/cache';
import { AppError, conflict, notFound } from '../lib/errors';
import { newId, randomToken } from '../lib/ids';
import { toSummary } from '../orders/checkout-service';
import { DUMMY_HASH, hashPassword, verifyPassword } from './passwords';

export const CUSTOMER_SESSION_DAYS = 30;
export const MAX_ADDRESSES = 10;

const name = plainText(120, { min: 2 });
const password = z
  .string()
  .min(8, { error: 'Use at least 8 characters' })
  .max(128, { error: 'Use at most 128 characters' });
const optionalEmail = z
  .union([z.literal(''), emailSchema])
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null));
const optionalPhone = z
  .union([z.literal(''), pkPhoneSchema])
  .optional()
  .transform((v) => v || null);

export const registerSchema = z
  .strictObject({
    name,
    email: optionalEmail,
    phone: optionalPhone,
    password,
    acceptsMarketing: z.boolean().default(false),
  })
  .refine((v) => v.email || v.phone, {
    error: 'Enter an email address or a mobile number',
    path: ['email'],
  });

export const loginSchema = z.strictObject({
  /** Email address or Pakistani mobile number. */
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});

export const profileSchema = z
  .strictObject({
    name: name.optional(),
    email: optionalEmail,
    phone: optionalPhone,
    acceptsMarketing: z.boolean().optional(),
  })
  .partial();

export const passwordChangeSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const addressSchema = z.strictObject({
  label: plainText(40).default('Home'),
  name,
  phone: pkPhoneSchema,
  address: plainText(250, { min: 5 }),
  city: plainText(80, { min: 2 }),
  isDefault: z.boolean().default(false),
});

interface CustomerSession {
  customerId: string;
  storeId: string;
}

const sessionKey = (token: string) =>
  `cust:sess:${createHash('sha256').update(token).digest('hex')}`;

/** Reads "a@b.com", "0321 1234567" or "+92321…" into the column to look up. */
export function parseIdentifier(raw: string): { email: string } | { phone: string } | null {
  const v = raw.trim();
  if (v.includes('@')) {
    const parsed = emailSchema.safeParse(v);
    return parsed.success ? { email: parsed.data.toLowerCase() } : null;
  }
  const phone = normalizePkPhone(v);
  return phone ? { phone } : null;
}

/**
 * Storefront customer accounts: sign-up and sign-in with email or phone plus a password,
 * profile, saved addresses and order history. Sessions are opaque tokens kept (hashed) in the
 * cache; the web app holds the token in an httpOnly cookie on the store's own domain.
 */
export class CustomerAccountService {
  constructor(
    private readonly db: Db,
    private readonly cache: KeyValueCache,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async register(store: Store, raw: unknown) {
    const input = registerSchema.parse(raw);
    const [byPhone, byEmail] = await Promise.all([
      input.phone
        ? this.db.customer.findUnique({
            where: { storeId_phone: { storeId: store.id, phone: input.phone } },
          })
        : null,
      input.email
        ? this.db.customer.findUnique({
            where: { storeId_email: { storeId: store.id, email: input.email } },
          })
        : null,
    ]);
    if (byPhone?.passwordHash || byEmail?.passwordHash)
      throw conflict('An account with these details already exists. Please sign in.');
    if (byPhone && byEmail && byPhone.id !== byEmail.id)
      throw conflict('This email and mobile number belong to different customers');

    const passwordHash = await hashPassword(input.password);
    const at = this.now();
    const existing = byPhone ?? byEmail;
    // A guest who ordered before claims their customer record (the merchant keeps one profile).
    // Their earlier guest orders stay out of the account: a password sign-up does not prove
    // they own the phone number or email those orders were placed with.
    const customer = existing
      ? await this.db.customer.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            ...(input.email ? { email: input.email } : {}),
            ...(input.phone ? { phone: input.phone } : {}),
            passwordHash,
            acceptsMarketing: input.acceptsMarketing,
            registeredAt: at,
            lastLoginAt: at,
          },
        })
      : await this.db.customer.create({
          data: {
            id: newId(),
            storeId: store.id,
            getorioTenantId: store.getorioTenantId,
            name: input.name,
            email: input.email,
            phone: input.phone,
            passwordHash,
            acceptsMarketing: input.acceptsMarketing,
            registeredAt: at,
            lastLoginAt: at,
          },
        });
    return { token: await this.startSession(customer), customer: await this.me(customer.id) };
  }

  async login(store: Store, raw: unknown) {
    const input = loginSchema.parse(raw);
    const id = parseIdentifier(input.identifier);
    const customer = id
      ? await this.db.customer.findUnique({
          where:
            'email' in id
              ? { storeId_email: { storeId: store.id, email: id.email } }
              : { storeId_phone: { storeId: store.id, phone: id.phone } },
        })
      : null;
    const ok = await verifyPassword(input.password, customer?.passwordHash ?? DUMMY_HASH);
    if (!customer?.passwordHash || !ok)
      throw new AppError(401, 'unauthorized', 'Wrong email, mobile number or password');
    await this.db.customer.update({
      where: { id: customer.id },
      data: { lastLoginAt: this.now() },
    });
    return { token: await this.startSession(customer), customer: await this.me(customer.id) };
  }

  async logout(token: string | undefined) {
    if (token) await this.cache.del(sessionKey(token));
  }

  /** The signed-in customer of this store, or null (wrong store, expired or signed out). */
  async resolve(store: Store, token: string | undefined): Promise<Customer | null> {
    if (!token || token.length > 200) return null;
    const session = await this.cache.get<CustomerSession>(sessionKey(token));
    if (!session || session.storeId !== store.id) return null;
    const customer = await this.db.customer.findFirst({
      where: { id: session.customerId, storeId: store.id },
    });
    return customer?.passwordHash ? customer : null;
  }

  async require(store: Store, token: string | undefined): Promise<Customer> {
    const customer = await this.resolve(store, token);
    if (!customer) throw new AppError(401, 'unauthorized', 'Please sign in');
    return customer;
  }

  async me(customerId: string) {
    const c = await this.db.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } },
    });
    const orders = await this.db.order.aggregate({
      where: { customerId, viaAccount: true, status: { not: 'cancelled' } },
      _count: { _all: true },
      _sum: { total: true },
    });
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      acceptsMarketing: c.acceptsMarketing,
      memberSince: (c.registeredAt ?? c.createdAt).toISOString(),
      orders: orders._count._all,
      totalSpent: (orders._sum.total ?? 0).toFixed(2),
      addresses: c.addresses.map(addressDto),
    };
  }

  async updateProfile(customer: Customer, raw: unknown) {
    const input = profileSchema.parse(raw);
    if (input.email === null && input.phone === null)
      throw new AppError(400, 'validation_error', 'Keep an email address or a mobile number');
    const email = input.email === undefined ? customer.email : input.email;
    const phone = input.phone === undefined ? customer.phone : input.phone;
    if (!email && !phone)
      throw new AppError(400, 'validation_error', 'Keep an email address or a mobile number');
    try {
      await this.db.customer.update({
        where: { id: customer.id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          email,
          phone,
          ...(input.acceptsMarketing !== undefined
            ? { acceptsMarketing: input.acceptsMarketing }
            : {}),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw conflict('This email or mobile number is already used by another customer');
      throw error;
    }
    return this.me(customer.id);
  }

  async changePassword(customer: Customer, raw: unknown) {
    const input = passwordChangeSchema.parse(raw);
    if (
      !customer.passwordHash ||
      !(await verifyPassword(input.currentPassword, customer.passwordHash))
    )
      throw new AppError(400, 'validation_error', 'Your current password is not correct', [
        { path: 'currentPassword', message: 'Your current password is not correct' },
      ]);
    await this.db.customer.update({
      where: { id: customer.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
  }

  async orders(customer: Customer, page = 1, pageSize = 10) {
    const where = { customerId: customer.id, viaAccount: true };
    const [rows, total] = await Promise.all([
      this.db.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: true },
      }),
      this.db.order.count({ where }),
    ]);
    return {
      items: rows.map((o) => ({
        ...toSummary(o),
        city: o.city,
        address: o.address,
        discountCode: o.discountCode,
        discountTotal: o.discountTotal.toFixed(2),
      })),
      total,
      page,
      pageSize,
    };
  }

  async addAddress(customer: Customer, raw: unknown) {
    const input = addressSchema.parse(raw);
    const count = await this.db.customerAddress.count({ where: { customerId: customer.id } });
    if (count >= MAX_ADDRESSES) throw conflict(`You can save up to ${MAX_ADDRESSES} addresses`);
    await this.db.$transaction(async (tx) => {
      const isDefault = input.isDefault || count === 0;
      if (isDefault)
        await tx.customerAddress.updateMany({
          where: { customerId: customer.id },
          data: { isDefault: false },
        });
      await tx.customerAddress.create({
        data: { id: newId(), customerId: customer.id, ...input, isDefault },
      });
    });
    return this.me(customer.id);
  }

  async updateAddress(customer: Customer, addressId: string, raw: unknown) {
    const current = await this.address(customer, addressId);
    const input = addressSchema.partial().parse(raw);
    await this.db.$transaction(async (tx) => {
      if (input.isDefault)
        await tx.customerAddress.updateMany({
          where: { customerId: customer.id },
          data: { isDefault: false },
        });
      await tx.customerAddress.update({
        where: { id: current.id },
        data: {
          ...input,
          ...(input.isDefault === false && current.isDefault ? { isDefault: true } : {}),
        },
      });
    });
    return this.me(customer.id);
  }

  async removeAddress(customer: Customer, addressId: string) {
    const current = await this.address(customer, addressId);
    await this.db.$transaction(async (tx) => {
      await tx.customerAddress.delete({ where: { id: current.id } });
      if (current.isDefault) {
        const next = await tx.customerAddress.findFirst({
          where: { customerId: customer.id },
          orderBy: { createdAt: 'asc' },
        });
        if (next)
          await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return this.me(customer.id);
  }

  private async address(customer: Customer, addressId: string) {
    const a = await this.db.customerAddress.findFirst({
      where: { id: addressId, customerId: customer.id },
    });
    if (!a) throw notFound('Address');
    return a;
  }

  private async startSession(customer: Customer) {
    const token = randomToken();
    await this.cache.set(
      sessionKey(token),
      { customerId: customer.id, storeId: customer.storeId } satisfies CustomerSession,
      CUSTOMER_SESSION_DAYS * 86_400,
    );
    return token;
  }
}

function addressDto(a: CustomerAddress) {
  return {
    id: a.id,
    label: a.label,
    name: a.name,
    phone: a.phone,
    address: a.address,
    city: a.city,
    isDefault: a.isDefault,
  };
}

/**
 * Checkout: links the order to its customer (the signed-in one, else by phone; a new guest
 * customer is created on a first order) and updates the customer's order counters.
 */
export async function recordCustomerOrder(
  tx: Prisma.TransactionClient,
  store: Store,
  order: { name: string; phone: string; email: string | null; city: string; totalMinor: number },
  signedIn: Customer | null,
  at: Date,
): Promise<string> {
  const total = (order.totalMinor / 100).toFixed(2);
  const counters = {
    ordersCount: { increment: 1 },
    totalSpent: { increment: total },
    lastOrderAt: at,
    lastCity: order.city,
  };
  if (signedIn) {
    await tx.customer.update({
      where: { id: signedIn.id },
      data: { ...counters, ...(signedIn.firstOrderAt ? {} : { firstOrderAt: at }) },
    });
    return signedIn.id;
  }
  const existing = await tx.customer.findUnique({
    where: { storeId_phone: { storeId: store.id, phone: order.phone } },
  });
  if (existing) {
    await tx.customer.update({
      where: { id: existing.id },
      data: {
        ...counters,
        ...(existing.firstOrderAt ? {} : { firstOrderAt: at }),
        // Guests' details follow their latest order; account holders manage their own.
        ...(existing.passwordHash ? {} : { name: order.name }),
      },
    });
    return existing.id;
  }
  const email = order.email?.toLowerCase() ?? null;
  const emailFree =
    email !== null &&
    !(await tx.customer.findUnique({
      where: { storeId_email: { storeId: store.id, email } },
      select: { id: true },
    }));
  const id = newId();
  await tx.customer.create({
    data: {
      id,
      storeId: store.id,
      getorioTenantId: store.getorioTenantId,
      name: order.name,
      phone: order.phone,
      email: emailFree ? email : null,
      ordersCount: 1,
      totalSpent: total,
      firstOrderAt: at,
      lastOrderAt: at,
      lastCity: order.city,
    },
  });
  return id;
}
