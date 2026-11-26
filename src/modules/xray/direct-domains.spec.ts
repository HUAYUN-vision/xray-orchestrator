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

  it('sends Hellobike, Meituan Bike and DiDi Qingju direct', () => {
    const names = new Set(ALL_DIRECT_DOMAINS);
    const covered = (host: string): boolean =>
      [...names].some((name) => host === name || host.endsWith(`.${name}`));

    // Hellobike / 哈啰单车 — app API, corporate, .cn zone
    expect(covered('a.hellobike.com')).toBe(true);
    expect(covered('api.hello-inc.com')).toBe(true);
    expect(covered('mp.hellobike.cn')).toBe(true);

    // Meituan Bike / 美团单车 — app, backend sankuai, legacy Mobike
    expect(covered('bike.meituan.com')).toBe(true);
    expect(covered('api.sankuai.com')).toBe(true);
    expect(covered('app.mobike.com')).toBe(true);

    // DiDi Qingju / 滴滴青桔 — brand, 小桔, original udache API, .cn
    expect(covered('www.qingjuchuxing.com')).toBe(true);
    expect(covered('api.xiaojukeji.com')).toBe(true);
    expect(covered('api.udache.com')).toBe(true);
    expect(covered('api.didi.cn')).toBe(true);
  });
});
