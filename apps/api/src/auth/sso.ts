import { importSPKI, jwtVerify, type JWTVerifyOptions } from 'jose';
import { z } from 'zod';
import { AppError } from '../lib/errors';

export const ROLES = ['owner', 'staff', 'platform_admin'] as const;
export type Role = (typeof ROLES)[number];

export interface SsoClaims {
  getorioUserId: string;
  getorioTenantId: string;
  role: Role;
  /** Optional token id; when present the token can be used only once. */
  jti?: string;
  exp: number;
}

/** How Getorio identifies a merchant to Microstore (requirements §5, [OPEN] Q-1). */
export interface AuthProvider {
  verify(token: string): Promise<SsoClaims>;
}

const claimsSchema = z.object({
  getorioUserId: z.string().min(1).max(64),
  getorioTenantId: z.string().min(1).max(64),
  role: z.enum(ROLES),
  jti: z.string().min(1).max(128).optional(),
  exp: z.number().int(),
});

/** Max lifetime of an SSO token; the redirect is consumed immediately. */
export const MAX_SSO_TOKEN_LIFETIME_SECONDS = 60;
const CLOCK_TOLERANCE_SECONDS = 5;

export interface JwtSsoOptions {
  /** HS256 shared secret (dev) */
  sharedSecret?: string;
  /** RS256 public key, PEM (SPKI) */
  publicKeyPem?: string;
  issuer?: string;
  audience?: string;
  now?: () => number;
}

const invalid = () => new AppError(401, 'unauthorized', 'Invalid or expired sign-in link');

/** Default provider: a short-lived JWT signed by Getorio (RS256, or HS256 with a shared secret). */
export class JwtSsoProvider implements AuthProvider {
  private keyPromise: Promise<Awaited<ReturnType<typeof importSPKI>> | Uint8Array>;
  private readonly algorithms: string[];

  constructor(private readonly options: JwtSsoOptions) {
    if (options.publicKeyPem) {
      this.algorithms = ['RS256'];
      this.keyPromise = importSPKI(options.publicKeyPem, 'RS256');
    } else if (options.sharedSecret) {
      this.algorithms = ['HS256'];
      this.keyPromise = Promise.resolve(new TextEncoder().encode(options.sharedSecret));
    } else {
      throw new Error('JwtSsoProvider needs a public key or a shared secret');
    }
  }

  async verify(token: string): Promise<SsoClaims> {
    const nowSeconds = Math.floor((this.options.now?.() ?? Date.now()) / 1000);
    const verifyOptions: JWTVerifyOptions = {
      algorithms: this.algorithms,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      currentDate: new Date(nowSeconds * 1000),
      requiredClaims: ['exp'],
      ...(this.options.issuer ? { issuer: this.options.issuer } : {}),
      ...(this.options.audience ? { audience: this.options.audience } : {}),
    };
    let payload: unknown;
    try {
      ({ payload } = await jwtVerify(token, await this.keyPromise, verifyOptions));
    } catch {
      throw invalid();
    }
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) throw invalid();
    if (claims.data.exp - nowSeconds > MAX_SSO_TOKEN_LIFETIME_SECONDS + CLOCK_TOLERANCE_SECONDS) {
      throw invalid();
    }
    return claims.data;
  }
}
