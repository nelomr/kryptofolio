## Why

We need to visualize the peak-to-trough decline of the crypto portfolio over time to better understand risk and historical drawdowns. This allows users to see periods of "underwater equity" and recovery phases.

## What Changes

- Add a new "Crypto Drawdown Curve" metric widget in the metrics tab.
- Augment the Domain Port `ICryptoMetricsPort` with a `getDrawdownCurve` method.
- Implement the infrastructure to fetch drawdown points.
- Create a reusable `DrawdownCurve.vue` component that leverages `TimeAreaChart.vue` with an inverted color scheme and a baseline of 0%.

## Capabilities

### New Capabilities
- `crypto-drawdown-curve`: Visualization of portfolio drawdown percentage over a selected time range.

### Modified Capabilities


## Impact

- **Domain**: Modifies `ICryptoMetricsPort.ts` to add `getDrawdownCurve`.
- **Infrastructure**: Updates `RestCryptoMetricsAdapter.ts` and adds Zod schemas `DrawdownPointSchema`.
- **UI**: Adds `DrawdownCurve.vue` to `src/views/Portfolio/components/metrics/`. Reuses `TimeAreaChart.vue` component.
