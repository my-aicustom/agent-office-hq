import crypto from 'node:crypto';
export function verifyHmac({rawBody,signature,secret,algorithm='sha256'}){if(!secret||!signature)return false;const expected=crypto.createHmac(algorithm,secret).update(rawBody).digest('hex');const supplied=String(signature).replace(/^sha256=/,'');const a=Buffer.from(expected),b=Buffer.from(supplied);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
export function idempotencyKey(provider,externalId){return `${provider}:${externalId||crypto.randomUUID()}`;}
