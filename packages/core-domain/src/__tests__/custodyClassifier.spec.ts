import { describe, it, expect } from 'vitest';
import {
  classifyCustodyMovement,
  type CustodyClassification,
} from '../domain/services/custodyClassifier';

/**
 * The classifier resolves what `deposit` / `withdrawal` / `transfer` actually MEAN, which the
 * original pipeline never did: it mapped them verbatim, so every crypto wallet movement reached
 * the FIFO engine as an acquisition or a disposal.
 */

const expectCustody = (
  result: CustodyClassification,
  txType: 'TRANSFER_IN' | 'TRANSFER_OUT'
): void => {
  expect(result.kind).toBe('CUSTODY_MOVEMENT');
  if (result.kind !== 'CUSTODY_MOVEMENT') return;
  expect(result.txType).toBe(txType);
};

const expectFunding = (
  result: CustodyClassification,
  txType: 'DEPOSIT' | 'WITHDRAWAL'
): void => {
  expect(result.kind).toBe('FIAT_FUNDING');
  if (result.kind !== 'FIAT_FUNDING') return;
  expect(result.txType).toBe(txType);
};

describe('classifyCustodyMovement — crypto movements are custody, not trades', () => {
  it('classifies a Kraken crypto withdrawal as an outbound custody movement', () => {
    // The exact shape of the real export: type=withdrawal, subclass=crypto, asset=XRP.
    const result = classifyCustodyMovement({
      rawType: 'withdrawal',
      assetSymbol: 'XRP',
      subclass: 'crypto',
    });
    expectCustody(result, 'TRANSFER_OUT');
  });

  it('classifies a crypto deposit as an inbound custody movement', () => {
    const result = classifyCustodyMovement({
      rawType: 'deposit',
      assetSymbol: 'XRP',
      subclass: 'crypto',
    });
    expectCustody(result, 'TRANSFER_IN');
  });

  it('classifies crypto movements without a subclass hint by symbol alone', () => {
    // Most exports provide no subclass; the ISO-4217 list has to carry the decision.
    expectCustody(classifyCustodyMovement({ rawType: 'withdrawal', assetSymbol: 'ADA' }), 'TRANSFER_OUT');
    expectCustody(classifyCustodyMovement({ rawType: 'deposit', assetSymbol: 'BTC' }), 'TRANSFER_IN');
  });

  it('treats a stablecoin as crypto, not as fiat', () => {
    // USDT is not an ISO-4217 code. Misclassifying it as fiat would silently drop it from FIFO.
    expectCustody(classifyCustodyMovement({ rawType: 'deposit', assetSymbol: 'USDT' }), 'TRANSFER_IN');
  });
});

describe('classifyCustodyMovement — fiat movements are funding, not custody', () => {
  it('classifies a Kraken fiat deposit as funding', () => {
    const result = classifyCustodyMovement({
      rawType: 'deposit',
      assetSymbol: 'EUR',
      subclass: 'fiat',
    });
    expectFunding(result, 'DEPOSIT');
  });

  it('classifies a fiat withdrawal as funding', () => {
    expectFunding(
      classifyCustodyMovement({ rawType: 'withdrawal', assetSymbol: 'USD' }),
      'WITHDRAWAL'
    );
  });

  it('recognises fiat by ISO-4217 code without a subclass hint', () => {
    for (const code of ['EUR', 'USD', 'GBP', 'CHF']) {
      expectFunding(classifyCustodyMovement({ rawType: 'deposit', assetSymbol: code }), 'DEPOSIT');
    }
  });

  it('lets an explicit crypto subclass override the ISO-4217 lookup', () => {
    // A token whose ticker collides with a currency code must follow the source's own subclass.
    expectCustody(
      classifyCustodyMovement({ rawType: 'deposit', assetSymbol: 'CHF', subclass: 'crypto' }),
      'TRANSFER_IN'
    );
  });
});

describe('classifyCustodyMovement — generic transfers take direction from the sign', () => {
  it('classifies a positive generic transfer as inbound', () => {
    expectCustody(
      classifyCustodyMovement({ rawType: 'transfer', assetSymbol: 'USDT', amount: '100' }),
      'TRANSFER_IN'
    );
  });

  it('classifies a negative generic transfer as outbound', () => {
    expectCustody(
      classifyCustodyMovement({ rawType: 'transfer', assetSymbol: 'USDT', amount: '-100' }),
      'TRANSFER_OUT'
    );
  });

  it('rejects a generic transfer with no resolvable direction', () => {
    // Guessing a direction here would silently attribute custody to the wrong side.
    const result = classifyCustodyMovement({ rawType: 'transfer', assetSymbol: 'USDT' });
    expect(result.kind).toBe('UNCLASSIFIED');
  });

  it('rejects a zero-amount generic transfer rather than defaulting to inbound', () => {
    const result = classifyCustodyMovement({
      rawType: 'transfer',
      assetSymbol: 'USDT',
      amount: '0',
    });
    expect(result.kind).toBe('UNCLASSIFIED');
  });

  it('classifies a fiat generic transfer as funding, using the sign for direction', () => {
    expectFunding(
      classifyCustodyMovement({ rawType: 'transfer', assetSymbol: 'EUR', amount: '-500' }),
      'WITHDRAWAL'
    );
  });
});

describe('classifyCustodyMovement — rejects rather than guesses', () => {
  it('rejects a type it does not recognise as a movement', () => {
    const result = classifyCustodyMovement({ rawType: 'buy', assetSymbol: 'BTC' });
    expect(result.kind).toBe('UNCLASSIFIED');
  });

  it('rejects an unmappable type instead of defaulting to a trade', () => {
    // `toSpotTxType` used to default anything unknown to 'BUY', fabricating an acquisition.
    const result = classifyCustodyMovement({ rawType: 'liquidation_transfer', assetSymbol: 'BTC' });
    expect(result.kind).toBe('UNCLASSIFIED');
    if (result.kind !== 'UNCLASSIFIED') return;
    expect(result.reason).toContain('liquidation_transfer');
  });

  it('rejects a movement with no asset symbol', () => {
    const result = classifyCustodyMovement({ rawType: 'withdrawal', assetSymbol: '' });
    expect(result.kind).toBe('UNCLASSIFIED');
  });

  it('is case- and whitespace-insensitive on both the type and the symbol', () => {
    expectCustody(
      classifyCustodyMovement({ rawType: '  WITHDRAWAL ', assetSymbol: ' xrp ' }),
      'TRANSFER_OUT'
    );
    expectFunding(
      classifyCustodyMovement({ rawType: 'Deposit', assetSymbol: 'eur' }),
      'DEPOSIT'
    );
  });

  it('accepts the Spanish source labels the normalizer already supports', () => {
    expectCustody(classifyCustodyMovement({ rawType: 'retiro', assetSymbol: 'XRP' }), 'TRANSFER_OUT');
    expectCustody(
      classifyCustodyMovement({ rawType: 'deposito', assetSymbol: 'XRP' }),
      'TRANSFER_IN'
    );
  });
});

describe('classifyCustodyMovement — purity', () => {
  it('does not mutate its input', () => {
    const input = { rawType: 'withdrawal', assetSymbol: 'XRP', subclass: 'crypto' as const };
    const snapshot = JSON.stringify(input);
    classifyCustodyMovement(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('is referentially transparent', () => {
    const input = { rawType: 'deposit', assetSymbol: 'XRP' };
    expect(classifyCustodyMovement(input)).toEqual(classifyCustodyMovement(input));
  });
});
