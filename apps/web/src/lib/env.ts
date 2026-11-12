/** Server-side configuration for the web app. Nothing here is exposed to the browser. */
export const serverEnv = {
  apiUrl: (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, ''),
  rootDomain: process.env.ROOT_DOMAIN ?? 'microstore.localhost',
  storefrontUrlTemplate: process.env.STOREFRONT_URL_TEMPLATE ?? 'https://{host}',
  revalidateSecret: process.env.REVALIDATE_SECRET ?? '',
};

/** Hostnames (without port) that serve the merchant dashboard instead of a storefront. */
export const dashboardHosts = (
  process.env.DASHBOARD_HOSTS ?? 'localhost,127.0.0.1,app.microstore.localhost'
)
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function storefrontUrl(hostname: string, path = '/'): string {
  return serverEnv.storefrontUrlTemplate.replace('{host}', hostname) + (path === '/' ? '' : path);
}
