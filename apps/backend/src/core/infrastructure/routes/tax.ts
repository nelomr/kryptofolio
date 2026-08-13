import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { DIContainer } from '../di/container.js';
import type { SpanishTaxReportResponse } from '../../application/use-cases/GetSpanishTaxReportUseCase.js';
import type { ConvertedAmount } from '@kryptofolio/shared-types';

function parseReportParams(
  year: string | undefined,
  method: string | undefined,
  accountId: string | undefined,
  targetCurrency: string | undefined,
) {
  return {
    year: year ? Number(year) : new Date().getFullYear(),
    method: method || 'FIFO',
    accountId,
    targetCurrency,
  };
}

/**
 * The figure a row shows, or blank.
 *
 * An `UNCONVERTIBLE` outcome writes its native amount followed by the currency it is actually in,
 * because a bare number in a column headed by the report's currency would assert a conversion that
 * did not happen. An unresolved figure writes nothing at all — a `0` would read as a disposal that
 * earned nothing.
 */
function amountOrBlank(figure: ConvertedAmount | null): string {
  if (figure === null) return '';
  return figure.kind === 'UNCONVERTIBLE'
    ? `${figure.nativeAmount} ${figure.nativeCurrency}`
    : figure.amount;
}

/**
 * The export, as data rather than prose.
 *
 * The currency, the conversion basis and the completeness of the period are emitted as tokens, not
 * sentences: the backend states no user-facing copy anywhere else either, and a file that outlives
 * the session must not carry a translation of it from the moment it was produced. The importing
 * side renders these the same way the header does.
 *
 * They lead the file rather than trailing it, because a truncated export must lose rows, not the
 * statement that says what its rows mean.
 */
function toCsv(report: SpanishTaxReportResponse): string {
  const lines = [
    'kryptofolio_tax_report',
    `year,${report.year}`,
    `method,${report.method}`,
    `currency,${report.currency}`,
    `conversion,${report.conversion.kind}`,
    `conversion_basis,EACH_EVENT_OWN_DATE`,
    `completeness,${report.unconvertibleEvents.length === 0 ? 'COMPLETE' : 'INCOMPLETE'}`,
  ];

  // Listed individually, so the file names what is missing from its own totals instead of merely
  // admitting that something is.
  for (const event of report.unconvertibleEvents) {
    lines.push(
      `unconvertible_event,${event.id},${event.occurredOn},${event.nativeAmount},${event.nativeCurrency}`,
    );
  }

  lines.push(
    '',
    'savings_base_yields,general_base_airdrops,spot_capital_gains,net_patrimonial_result,estimated_irpf',
    [
      report.savingsBaseYields,
      report.generalBaseAirdrops,
      report.spotCapitalGains,
      report.summary.net_patrimonial_result,
      report.summary.estimated_irpf,
    ].join(','),
    '',
    'event_id,disposal_date,amount_from_lot,sale_price,gain_loss,operation_type,is_taxable',
  );

  for (const event of report.audit_trail) {
    lines.push(
      [
        event.id,
        event.disposal_date,
        event.amount_from_lot,
        amountOrBlank(event.sale_price),
        amountOrBlank(event.gain_loss),
        event.operation_type,
        event.is_taxable ? '1' : '0',
      ].join(','),
    );
  }

  return lines.join('\n');
}

export function createTaxApi(container: DIContainer) {
  return new Hono()
    .get('/transactions/spot', async (c) => {
      const accountId = c.req.query('accountId');
      const txs = await container.ledgerPort.getSpotTransactions(accountId);
      return c.json(txs, 200);
    })
    .get('/transactions/futures', async (c) => {
      const accountId = c.req.query('accountId');
      const txs = await container.ledgerPort.getFuturesTransactions(accountId);
      return c.json(txs, 200);
    })
    .get('/transactions/futures-derivatives', async (c) => {
      const accountId = c.req.query('accountId');
      const targetCurrency = c.req.query('currency');
      const pnl = await container.portfolioAnalyticsPort.getDerivativesPnl(
        accountId,
        targetCurrency,
      );
      return c.json(pnl, 200);
    })
    .get('/transactions/invalid', (c) => c.json([], 200))
    .get('/report', async (c) => {
      const params = parseReportParams(
        c.req.query('year'),
        c.req.query('method'),
        c.req.query('accountId'),
        c.req.query('currency'),
      );
      const report = await container.getSpanishTaxReportUseCase.execute(params);
      return c.json(report, 200);
    })
    // Registered before `/report/:year`, which would otherwise match it with year="download" —
    // Hono resolves in registration order, so the export was unreachable and every statement it is
    // required to carry was unreachable with it.
    .get('/report/download', async (c) => {
      const params = parseReportParams(
        c.req.query('year'),
        c.req.query('method'),
        c.req.query('accountId'),
        c.req.query('currency'),
      );
      const report = await container.getSpanishTaxReportUseCase.execute(params);

      return c.body(toCsv(report), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kryptofolio-tax-report-${report.year}-${report.currency}.csv"`,
      });
    })
    .get('/report/:year', async (c) => {
      const params = parseReportParams(
        c.req.param('year'),
        c.req.query('method'),
        c.req.query('accountId'),
        c.req.query('currency'),
      );
      const report = await container.getSpanishTaxReportUseCase.execute(params);
      return c.json(report, 200);
    })
    .delete('/transactions/:id', (c) => c.json({ success: true }, 200))
    .put('/transactions/:id', zValidator('json', z.record(z.unknown())), (c) =>
      c.json({ success: true }, 200),
    )
    .post(
      '/transactions/validate',
      zValidator('json', z.record(z.unknown())),
      (c) => c.json({ success: true }, 200),
    )
    .post('/upload', (c) => c.json({ success: true }, 200))
    .delete('/transactions/market/:market', (c) =>
      c.json({ success: true }, 200),
    )
    .post(
      '/import-wallet',
      zValidator('json', z.object({ chain: z.string(), address: z.string() })),
      (c) => c.json({ success: true }, 200),
    )
    .post('/sync-web3', zValidator('json', z.object({}).optional()), (c) =>
      c.json({ success: true }, 200),
    )
    ;
}
