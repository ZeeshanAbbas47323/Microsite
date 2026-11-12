// k6 baseline (requirements §12): storefront browsing and COD checkout.
//
//   docker run --rm -i --add-host=host.docker.internal:host-gateway \
//     -e WEB=http://host.docker.internal:3002 -e API=http://host.docker.internal:4100 \
//     -e STORE_HOST=<sub>.microstore.localhost -v "$PWD/load:/load" grafana/k6:1.3.0 run /load/storefront.js
//
// Checkout goes straight to the API with a random X-Forwarded-For per request so the per-IP
// rate limit (10/min) does not cap the test; run it only against a stack with TRUST_PROXY=true.
import http from 'k6/http';
import { check, sleep } from 'k6';

const WEB = __ENV.WEB;
const API = __ENV.API;
const HOST = __ENV.STORE_HOST;
const port = WEB.split(':').pop();

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      exec: 'browse',
      stages: [
        { duration: '20s', target: 50 },
        { duration: '40s', target: 100 },
        { duration: '10s', target: 0 },
      ],
    },
    checkout: {
      executor: 'constant-arrival-rate',
      exec: 'checkout',
      rate: 5,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 20,
    },
  },
  thresholds: {
    'http_req_failed{scenario:browse}': ['rate<0.01'],
    'http_req_duration{scenario:browse}': ['p(95)<800'],
    'http_req_duration{scenario:checkout}': ['p(95)<800'],
    'checks{scenario:checkout}': ['rate>0.99'],
  },
};

// The Next.js server routes by Host; k6 sets it explicitly while connecting to WEB.
const storeParams = { headers: { Host: `${HOST}:${port}` } };

export function browse() {
  const pages = ['/', '/products', '/products/p-1001', '/products/p-1004', '/about'];
  for (const p of pages) {
    const res = http.get(`${WEB}${p}`, storeParams);
    check(res, { 'page 200': (r) => r.status === 200 });
  }
  sleep(1);
}

export function checkout() {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const res = http.post(
    `${API}/api/v1/public/checkout`,
    JSON.stringify({
      customer: { name: 'Load Test', phone: '03001234567' },
      shipping: { address: 'House 1, Street 2, Test Town', city: 'Lahore' },
      items: [{ productId: 'p-1003', qty: 1 }],
    }),
    {
      headers: {
        'content-type': 'application/json',
        'x-store-host': HOST,
        'idempotency-key': `k6-${__VU}-${__ITER}-${Date.now()}-abcdef`,
        'x-forwarded-for': ip,
      },
    },
  );
  check(res, { 'order created': (r) => r.status === 201 });
}
