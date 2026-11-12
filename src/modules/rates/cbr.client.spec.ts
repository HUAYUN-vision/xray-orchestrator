import { parseCbrDaily } from './cbr.client';

/** Trimmed real response of XML_daily.asp (2026-11-12), already decoded from windows-1251. */
const XML = `<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="12.11.2026" name="Foreign Currency Market"><Valute ID="R01010"><NumCode>036</NumCode><CharCode>AUD</CharCode><Nominal>1</Nominal><Name>Австралийский доллар</Name><Value>56,8547</Value><VunitRate>56,8547</VunitRate></Valute><Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Доллар США</Name><Value>82,6617</Value><VunitRate>82,6617</VunitRate></Valute><Valute ID="R01375"><NumCode>156</NumCode><CharCode>CNY</CharCode><Nominal>1</Nominal><Name>Юань</Name><Value>12,3907</Value><VunitRate>12,3907</VunitRate></Valute><Valute ID="R01335"><NumCode>398</NumCode><CharCode>KZT</CharCode><Nominal>100</Nominal><Name>Тенге</Name><Value>15,8000</Value><VunitRate>0,158</VunitRate></Valute></ValCurs>`;

describe('parseCbrDaily', () => {
  it('parses the date and per-unit rates', () => {
    expect(parseCbrDaily(XML)).toEqual({
      date: '2026-11-12',
      rubPerUnit: { AUD: '56.8547', USD: '82.6617', CNY: '12.3907', KZT: '0.158' },
    });
  });

  it('uses VunitRate, so the nominal does not matter', () => {
    expect(parseCbrDaily(XML).rubPerUnit.KZT).toBe('0.158');
  });

  it('fails on unexpected content', () => {
    expect(() => parseCbrDaily('<html>blocked</html>')).toThrow(/no ValCurs date/);
    expect(() => parseCbrDaily('<ValCurs Date="12.11.2026"></ValCurs>')).toThrow(/no rates/);
  });
});
