import type { AdvisorToolName, MetricId } from '@kryptofolio/shared-types';

export interface MetricDefinition {
  readonly en: string;
  readonly es: string;
  /** The advisor tool whose result carries the metric. */
  readonly producedBy: AdvisorToolName;
}

/**
 * Written for the advisor: each formula is stated in words and no example number appears, so a
 * definition can never be mistaken for a figure from the user's own ledger. The frontend keeps its own
 * UI copy of these ideas; `metricDefinitions.spec.ts` guards that every metric has both locales.
 */
export const METRIC_DEFINITIONS: Record<MetricId, MetricDefinition> = {
  equity: {
    en: 'The current market value of all valued holdings together: each holding quantity multiplied by its live price, summed. Holdings without a resolved value are left out and counted as unvalued.',
    es: 'El valor de mercado actual de todas las posiciones valoradas: la cantidad de cada posición multiplicada por su precio en vivo, sumadas. Las posiciones sin valor resuelto se excluyen y se cuentan como sin valorar.',
    producedBy: 'portfolio_summary',
  },
  cost_basis: {
    en: 'What the user paid for the assets they still hold, expressed in the display currency: the remaining purchase cost of the open lots under first-in first-out matching.',
    es: 'Lo que el usuario pagó por los activos que aún conserva, expresado en la moneda de visualización: el coste de compra restante de los lotes abiertos con el método primero en entrar, primero en salir.',
    producedBy: 'portfolio_summary',
  },
  realized_pnl: {
    en: 'Profit or loss already locked in by past disposals: the sale proceeds minus the cost of the lots consumed, under first-in first-out matching per asset across all accounts.',
    es: 'El beneficio o pérdida ya materializado por ventas pasadas: lo obtenido en la venta menos el coste de los lotes consumidos, con el método primero en entrar, primero en salir por activo entre todas las cuentas.',
    producedBy: 'portfolio_summary',
  },
  unrealized_pnl: {
    en: 'Profit or loss on assets still held: the current value of the valued holdings minus their cost basis. It becomes realized only when the assets are disposed of.',
    es: 'El beneficio o pérdida de los activos que aún se conservan: el valor actual de las posiciones valoradas menos su coste base. Solo se materializa cuando se transmiten los activos.',
    producedBy: 'portfolio_summary',
  },
  max_drawdown: {
    en: 'The largest peak-to-trough fall of the portfolio value over the observed history, as a percentage of the peak. It describes the worst loss an investor would have lived through, not a forecast.',
    es: 'La mayor caída desde un máximo hasta el mínimo posterior del valor de la cartera en el historial observado, como porcentaje del máximo. Describe la peor pérdida que se habría vivido, no una previsión.',
    producedBy: 'risk_metrics',
  },
  annualised_volatility: {
    en: 'How much the daily returns of the portfolio vary: the standard deviation of daily returns scaled to a yearly horizon. Higher means a bumpier ride, in either direction.',
    es: 'Cuánto varían los rendimientos diarios de la cartera: la desviación típica de los rendimientos diarios escalada a un horizonte anual. Más alta significa un recorrido más irregular, en ambas direcciones.',
    producedBy: 'risk_metrics',
  },
  sharpe: {
    en: 'Return earned per unit of risk taken: the average excess return over the risk-free rate divided by the volatility of returns. It lets two portfolios with different risk be compared.',
    es: 'Rentabilidad obtenida por unidad de riesgo asumido: el exceso medio de rentabilidad sobre la tasa libre de riesgo dividido por la volatilidad de los rendimientos. Permite comparar carteras con distinto riesgo.',
    producedBy: 'risk_metrics',
  },
  alpha: {
    en: 'The part of the portfolio return that is not explained by the market benchmark: the actual return minus the return implied by its beta against the benchmark.',
    es: 'La parte de la rentabilidad de la cartera que no explica el índice de referencia: la rentabilidad real menos la que implica su beta frente al índice.',
    producedBy: 'risk_metrics',
  },
  beta: {
    en: 'How strongly the portfolio moves with the market benchmark: the covariance of portfolio and benchmark returns divided by the variance of the benchmark. Above one amplifies market moves, below one dampens them.',
    es: 'Cuánto se mueve la cartera con el índice de referencia: la covarianza entre los rendimientos de la cartera y del índice dividida por la varianza del índice. Por encima de uno amplifica los movimientos del mercado, por debajo los atenúa.',
    producedBy: 'risk_metrics',
  },
  hhi: {
    en: 'The Herfindahl-Hirschman index of concentration: the sum of the squared portfolio weights of the valued holdings, on a scale from zero to one. One means everything is in a single asset; the lower it is, the more evenly the value is spread. The effective number of holdings is one divided by this index.',
    es: 'El índice de concentración de Herfindahl-Hirschman: la suma de los cuadrados de los pesos de las posiciones valoradas, en una escala de cero a uno. Uno significa que todo está en un solo activo; cuanto menor es, más repartido está el valor. El número efectivo de posiciones es uno dividido por este índice.',
    producedBy: 'concentration_risk',
  },
  top_n_weight: {
    en: 'The share of the total valued portfolio held by its largest holdings: the value of the single largest holding, or of the three largest together, divided by the total valued portfolio.',
    es: 'La proporción de la cartera valorada total que aportan sus mayores posiciones: el valor de la mayor posición, o de las tres mayores juntas, dividido por el total de la cartera valorada.',
    producedBy: 'concentration_risk',
  },
  breakeven_price: {
    en: 'The price per unit at which selling a whole holding would neither gain nor lose: its cost basis divided by the quantity held. It ignores fees and taxes on the sale.',
    es: 'El precio por unidad al que vender una posición completa no daría ni ganancia ni pérdida: su coste base dividido por la cantidad conservada. No tiene en cuenta comisiones ni impuestos de la venta.',
    producedBy: 'breakeven_price',
  },
  rates_incomplete: {
    en: 'A warning that some figure could not be converted to the display currency because no exchange rate exists for its date. The totals shown leave that amount out, so they understate the real position.',
    es: 'Un aviso de que alguna cifra no pudo convertirse a la moneda de visualización porque no existe tipo de cambio para su fecha. Los totales mostrados excluyen ese importe, por lo que infravaloran la posición real.',
    producedBy: 'portfolio_summary',
  },
  prices_incomplete: {
    en: 'A warning that some held asset has no market price, so its value is missing from the totals. The totals shown understate the real equity by that asset.',
    es: 'Un aviso de que algún activo conservado no tiene precio de mercado, por lo que su valor falta en los totales. Los totales mostrados infravaloran el patrimonio real en ese activo.',
    producedBy: 'portfolio_summary',
  },
  unvalued: {
    en: 'A holding with no current value, either because no price was found for it or because its cost basis could not be converted to the display currency. It is listed with its quantity and never counted as worth zero.',
    es: 'Una posición sin valor actual, bien porque no se encontró precio para ella o porque su coste base no pudo convertirse a la moneda de visualización. Se lista con su cantidad y nunca se cuenta como valor cero.',
    producedBy: 'data_gaps',
  },
  irpf_savings_base: {
    en: 'The part of the Spanish income tax return where capital gains and losses and crypto yields are netted together, taxed at the savings rates. Disposals of crypto fall here, computed per asset with first-in first-out matching.',
    es: 'La parte de la declaración de la renta española donde se compensan las ganancias y pérdidas patrimoniales y los rendimientos de cripto, tributando a los tipos del ahorro. Las transmisiones de cripto entran aquí, calculadas por activo con el método primero en entrar, primero en salir.',
    producedBy: 'spanish_tax_report',
  },
  net_patrimonial_result: {
    en: 'The net result of the year on disposals for tax purposes: total capital gains minus total capital losses, before any compensation with other income. A negative value is a net loss.',
    es: 'El resultado neto del ejercicio por transmisiones a efectos fiscales: las ganancias patrimoniales totales menos las pérdidas patrimoniales totales, antes de cualquier compensación con otras rentas. Un valor negativo es una pérdida neta.',
    producedBy: 'spanish_tax_report',
  },
};
