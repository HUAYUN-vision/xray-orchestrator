import {
  ALL_DIRECT_DOMAINS,
  asSingboxSuffixes,
  asXrayDomains,
  CN_EXTRA_DOMAINS,
  CN_TLDS,
  PRIVATE_DOMAINS,
  RU_EXTRA_DOMAINS,
  RU_TLDS,
} from './direct-domains';

const tldCovered = (domain: string, tlds: readonly string[]): boolean =>
  tlds.some((tld) => domain === tld || domain.endsWith(`.${tld}`));

describe('direct-domains', () => {
  it('has unique names', () => {
    expect(new Set(ALL_DIRECT_DOMAINS).size).toBe(ALL_DIRECT_DOMAINS.length);
  });

  it('keeps extras off the ccTLDs already covered by domain:ru / domain:cn', () => {
    for (const domain of RU_EXTRA_DOMAINS) {
      expect(tldCovered(domain, RU_TLDS)).toBe(false);
    }
    for (const domain of CN_EXTRA_DOMAINS) {
      expect(tldCovered(domain, CN_TLDS)).toBe(false);
    }
  });

  it('prefixes Xray rules with domain:', () => {
    expect(asXrayDomains(['ru', 'vk.com'])).toEqual(['domain:ru', 'domain:vk.com']);
  });

  it('adds a leading dot only to ccTLDs for sing-box', () => {
    expect(asSingboxSuffixes(['ru', 'vk.com', 'localhost'])).toEqual([
      '.ru',
      'vk.com',
      'localhost',
    ]);
    expect(asSingboxSuffixes(PRIVATE_DOMAINS).every((name) => !name.startsWith('.'))).toBe(true);
  });
});
