import { generateKeyPairSync, createPrivateKey } from 'crypto';
import { loadServiceAccount, normalizePrivateKey } from '../src/services/pushNotification.service';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const clean = privateKey.trim();

const parses = (pem: string) => {
  expect(() => createPrivateKey(pem)).not.toThrow();
};

describe('normalizePrivateKey', () => {
  it('keeps a good key working', () => parses(normalizePrivateKey(privateKey)));

  it('fixes literal \\n sequences (how most dashboards store it)', () => {
    parses(normalizePrivateKey(clean.replace(/\n/g, '\\n')));
  });

  it('fixes wrapping quotes and a trailing comma copied from the JSON', () => {
    parses(normalizePrivateKey(`"${clean.replace(/\n/g, '\\n')}",`));
    parses(normalizePrivateKey(`'${clean}'`));
  });

  it('fixes line breaks that were replaced by spaces', () => {
    parses(normalizePrivateKey(clean.replace(/\n/g, ' ')));
  });

  it('fixes line breaks that were dropped entirely', () => {
    const header = '-----BEGIN PRIVATE KEY-----';
    const footer = '-----END PRIVATE KEY-----';
    const body = clean.replace(header, '').replace(footer, '').replace(/\s/g, '');
    parses(normalizePrivateKey(header + body + footer));
  });

  it('fixes Windows line endings', () => {
    parses(normalizePrivateKey(clean.replace(/\n/g, '\r\n')));
  });
});

describe('loadServiceAccount', () => {
  const base = { FIREBASE_PROJECT_ID: 'proj', FIREBASE_CLIENT_EMAIL: 'x@proj.iam.gserviceaccount.com' };

  it('reports what is missing without throwing', () => {
    const r = loadServiceAccount({});
    expect(r.ok).toBe(false);
  });

  it('reads the three separate variables', () => {
    const r = loadServiceAccount({ ...base, FIREBASE_PRIVATE_KEY: clean.replace(/\n/g, '\\n') } as any);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.account.projectId).toBe('proj');
      parses(r.account.privateKey as string);
    }
  });

  const json = JSON.stringify({ project_id: 'proj', client_email: 'x@proj.iam.gserviceaccount.com', private_key: clean });

  it('reads the whole JSON file from one variable', () => {
    const r = loadServiceAccount({ FIREBASE_SERVICE_ACCOUNT_JSON: json } as any);
    expect(r.ok).toBe(true);
    if (r.ok) parses(r.account.privateKey as string);
  });

  it('reads the whole JSON file as base64', () => {
    const r = loadServiceAccount({ FIREBASE_SERVICE_ACCOUNT_JSON: Buffer.from(json).toString('base64') } as any);
    expect(r.ok).toBe(true);
  });

  it('rejects broken JSON and incomplete JSON with a clear reason', () => {
    expect(loadServiceAccount({ FIREBASE_SERVICE_ACCOUNT_JSON: '{nope' } as any).ok).toBe(false);
    const r = loadServiceAccount({ FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"p"}' } as any);
    expect(r.ok).toBe(false);
  });
});
