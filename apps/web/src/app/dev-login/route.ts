import { DEMO_ACCOUNTS, devLoginEnabled, isLocalHost, signDemoSsoToken } from '@/lib/dev-login';

/** POST (from the sign-in page buttons) → the normal `/sso` flow with a fresh demo token. */
export async function POST(request: Request) {
  const secret = process.env.SSO_SHARED_SECRET;
  if (!secret || !devLoginEnabled() || !isLocalHost(request.headers.get('host'))) {
    return new Response('Not found', { status: 404 });
  }
  const form = await request.formData();
  const as = String(form.get('as') ?? '');
  if (!(as in DEMO_ACCOUNTS)) return new Response('Unknown demo account', { status: 400 });
  const token = signDemoSsoToken(as as keyof typeof DEMO_ACCOUNTS, secret);
  return new Response(null, {
    status: 303,
    headers: { location: `/sso?token=${token}`, 'cache-control': 'no-store' },
  });
}
