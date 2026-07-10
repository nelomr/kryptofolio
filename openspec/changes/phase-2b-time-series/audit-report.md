# 🕵️ Audit Report: Frontend Mocks vs. Backend Capabilities (Phase 2B)

He revisado de forma exhaustiva, componente por componente y valor por valor, todo lo que se renderiza actualmente en las vistas de **Portfolio** y **TaxReport** a través de datos mockeados. 

A continuación presento la auditoría detallada de cada métrica mostrada en el frontend y la validación de si se puede recuperar desde la base de datos (SQLite + DuckDB).

---

## 📊 VISTA PORTFOLIO

### 1. `CryptoKpiCards.vue` (Tarjetas Superiores)
| Métrica Frontend | Origen Backend / Tabla | ¿Recuperable? | Notas |
| :--- | :--- | :---: | :--- |
| **ROI Total (%)** | `current_value` vs `cost_basis` | ✅ SÍ | DuckDB sumará el coste y aplicará el precio actual en vivo. |
| **ROI Total (Fiat)** | `current_value` - `cost_basis` | ✅ SÍ | Diferencia matemática directa. |
| **Delta 24h (Fiat)** | `current_value` vs precio ayer | ✅ SÍ | Requiere cruzar el precio actual con el `historical_prices` de hace 24h. |
| **Invested (Fiat)** | `tax_lots.total_cost_fiat` | ✅ SÍ | Suma del coste base de los lotes abiertos. |
| **Max Drawdown (%)** | `v_daily_running_balances` | ✅ SÍ | Calculable usando Window Functions sobre el histórico en DuckDB (Fase 2B). |
| **Max Drawdown (Fiat)** | `v_daily_running_balances` | ✅ SÍ | Igual que el porcentaje, pero restando el valor del ATH histórico. |
| **Recovered / Total Equity** | `current_value` | ✅ SÍ | Suma de cantidades restantes por el precio actual inyectado. |
| **Win Rate (%)** | `lot_history_events` | ✅ SÍ | Porcentaje de eventos con `gain_loss_fiat > 0` frente al total de trades cerrados. |
| **Total Trades (Win/Loss)** | `lot_history_events` | ✅ SÍ | Conteo exacto de filas agrupadas por el signo de la ganancia. |
| **Average R** | N/A | ⚠️ NO | **Génesis del problema:** La BD no guarda el Riesgo Inicial. Se debe redefinir en frontend como "Average Win / Average Loss" para ser 100% calculable. |
| **Best / Worst Asset** | `current_value` y PnL | ✅ SÍ | Agrupación por moneda ordenando por ROI%. |
| **Portfolio Dispersion (σ)** | `current_value` por activo | ✅ SÍ | Varianza matemática calculable en SQL. |

### 2. `RiskMetricsCard.vue` (Riesgo y Ratios)
| Métrica Frontend | Origen Backend / Tabla | ¿Recuperable? | Notas |
| :--- | :--- | :---: | :--- |
| **Sharpe Ratio** | Retornos diarios y Riesgo Libre | ✅ SÍ | Matemáticas sobre `v_daily_running_balances`. |
| **Sortino Ratio** | Retornos diarios negativos | ✅ SÍ | Similar al Sharpe, filtrando varianza bajista. |
| **Calmar Ratio** | Retorno anualizado vs Max DD | ✅ SÍ | División de dos métricas ya calculadas en DuckDB. |
| **Curva de Riesgo (Gráfico)** | `v_daily_running_balances` | ✅ SÍ | Requiere poblar `historical_prices` para generar el array histórico de Drawdown. |

### 3. `LotHierarchyTable.vue` (Tabla de Holdings)
| Métrica Frontend | Origen Backend / Tabla | ¿Recuperable? | Notas |
| :--- | :--- | :---: | :--- |
| **Asset Balance** | `tax_lots.remaining_qty` | ✅ SÍ | Suma agrupada por token. |
| **Current Value** | Balance * Live Price | ✅ SÍ | Se inyectará el precio en la consulta. |
| **Unrealized PnL** | Current Value - Cost Basis | ✅ SÍ | Cálculo en la Vista DuckDB. |
| **Cost Basis** | `tax_lots.total_cost_fiat` | ✅ SÍ | Suma directa del coste de los lotes. |
| **Portfolio Locations** | `tax_lots.exchange_location` | ✅ SÍ | Arrays de exchanges o wallets donde residen los fondos. |
| **Lotes Desplegables** | `tax_lots` | ✅ SÍ | Fecha de compra, coste unitario y cantidad remanente salen directos de la BD. |

### 4. Modales de Detalle del Token (`TokenSummaryCards`, `TokenActiveLots`, `TokenSalesHistory`)
| Métrica Frontend | Origen Backend / Tabla | ¿Recuperable? | Notas |
| :--- | :--- | :---: | :--- |
| **Token Balance / Value / Cost** | `tax_lots` + precios | ✅ SÍ | Mismas bases que la tabla principal, filtrado por símbolo. |
| **Active Lots (Listado)** | `tax_lots` | ✅ SÍ | Reflejo 1:1 de los registros con estado `OPEN` o `PARTIAL`. |
| **Sales History (Listado)** | `lot_history_events` | ✅ SÍ | Fechas de venta, cantidad vendida, comisiones y PnL realizado. Reflejo 1:1. |

---

## 🧾 VISTA TAX REPORT (Fiscalidad)

### 1. `TaxReportSummaryCards.vue` (Tarjetas de Impuestos)
| Métrica Frontend | Origen Backend / Tabla | ¿Recuperable? | Notas |
| :--- | :--- | :---: | :--- |
| **Capital Gains** | `lot_history_events` | ✅ SÍ | Suma de `gain_loss_fiat` donde `is_taxable = 1`. |
| **Yields (Rendimientos)** | `spot_transactions` | ✅ SÍ | Suma de valor (Earn, Staking) categorizado en Base del Ahorro. |
| **Total Losses** | `lot_history_events` | ✅ SÍ | Suma de ventas en negativo. Sirve para compensar ganancias. |
| **Estimated IRPF** | Bases Imponibles * Tramos | ✅ SÍ | DuckDB agrupará bases de ahorro y general, y aplicará % dinámicos. |

### 2. `TaxTransactionsTable.vue` (Raw Spot Transactions)
| Métrica Frontend | Origen Backend / Tabla | ¿Recuperable? | Notas |
| :--- | :--- | :---: | :--- |
| **Date, Type, Asset, Exchange** | `spot_transactions` | ✅ SÍ | Reflejo 1:1 de la tabla transaccional origen. |
| **Amount, Price, Total** | `spot_transactions` | ✅ SÍ | Datos puros del CSV ingestados. |
| **Identificador de Wallet** | `refId` / Notas | ✅ SÍ | Identifica bloqueos en red de forma correcta. |

### 3. `TaxDerivativesTable.vue` (Operaciones Futuros)
| Métrica Frontend | Origen Backend / Tabla | ¿Recuperable? | Notas |
| :--- | :--- | :---: | :--- |
| **Contract, Type, Date** | `futures_transactions` | ✅ SÍ | Soportado nativamente por la nueva tabla introducida en Fase 2. |
| **Realized PnL** | `futures_transactions` | ✅ SÍ | Clave para impuestos (Integrado en Fase 2). |
| **Fees & Funding** | `futures_transactions` | ✅ SÍ | Desglose atómico recuperable. |

### 4. `TaxReportDetailsTable.vue` (FIFO Audit Trail)
| Métrica Frontend | Origen Backend / Tabla | ¿Recuperable? | Notas |
| :--- | :--- | :---: | :--- |
| **Disposal Date, Operation** | `lot_history_events` | ✅ SÍ | El evento de venta con tipo de operación derivado. |
| **Asset, Exchange** | `lot_history_events` | ✅ SÍ | Datos del lote vendido. |
| **Sale Price, Gain/Loss, Fees** | `lot_history_events` | ✅ SÍ | Componentes exactos del evento FIFO. |

---

## 🎯 Conclusiones y Ajustes Requeridos
Tras el repaso componente por componente, declaro que **TODOS los valores mostrados en el frontend son recuperables desde la base de datos con la arquitectura actual y la Fase 2B**, con una única excepción técnica:

1. **La Métrica `Average R` (Inviable sin cambiar concepto)**: Puesto que no conocemos el SL original, debe transformarse semánticamente en el frontend a **"Win/Loss Ratio (Fiat)"** (Beneficio medio por operación ganadora dividido por la pérdida media de las perdedoras).
2. **Series Temporales (El Corazón de 2B)**: Gráficos de Drawdown, Delta 24h, Sharpe y Heatmap dependen enteramente de que poblemos el repositorio de `historical_prices` de forma activa.
3. **Alpha y Beta**: Exige que el sistema ingeste obligatoriamente el par `BTC` para comparar correlaciones.
4. **🚨 HALLAZGO CRÍTICO (INCONSISTENCIA DE CÓDIGO VS ARQUITECTURA) 🚨**:
   Durante la auditoría profunda del código actual (`apps/backend/src`), he detectado que la implementación existente de `DuckDbPortfolioAnalyticsAdapter.ts` **viola la regla de arquitectura de la Fase 2**. Actualmente, el método `getHoldingsSnapshot` inserta `livePrices` en una tabla de DuckDB (`live_prices`) y ejecuta el cálculo en tiempo real dentro del motor OLAP.
   - *El Problema*: Esto contradice frontalmente la regla de "DuckDB no debe usarse para el PnL en tiempo real, solo para snapshots históricos. Node.js asume el cálculo en tiempo real".
   - *La Solución*: Como parte obligatoria de las tareas de la Fase 2B, se deberá **refactorizar** este endpoint y su lógica subyacente. Se creará un `PortfolioAnalyticsService` puro en Node.js (Capa de Aplicación) que solicite los snapshots cacheados de SQLite (`tax_lots`) mediante `ILedgerPort`, y Node.js aplicará las matemáticas simples (`qty * live_price`) en memoria, devolviendo a DuckDB su verdadero propósito (métricas de riesgo, series temporales e histórico).
5. **🚨 HALLAZGO CRÍTICO (VOLATILIDAD DE PRECIOS HISTÓRICOS Y SOLAPAMIENTO CON FASE 3) 🚨**:
   El adaptador `DuckDbAdapter.ts` crea la tabla `asset_prices` exclusivamente en la memoria de DuckDB (`:memory:`). Al reiniciar el backend, **todos los precios históricos se pierden**. 
   - *El Problema*: El `ASOF JOIN` requerido para las series temporales fallará si no hay un repositorio persistente de precios históricos.
   - *La Solución*: Ejecutar la **Phase Parquet** antes de la Fase 2B. Esta fase creará el **Hive-Partitioned Parquet Storage** (`data/historical/prices/...`) y el Daemon de Ingesta. Una vez completada, DuckDB en la Fase 2B simplemente leerá de forma pasiva esos archivos Parquet para el `ASOF JOIN`, usando la lógica de *fallback* (`COALESCE` `fiat_value_eur / amount`) para suplir huecos temporales.
6. **🚨 HALLAZGO CRÍTICO (BYPASS DEL CACHÉ EN TAX CALCULATOR) 🚨**:
   El adaptador `DuckDbTaxCalculatorAdapter.getSpanishTaxReport` actualmente consulta la vista pesada `v_calculated_lot_history_events` en lugar del snapshot cacheado `ledger.lot_history_events`.
   - *El Problema*: Esto anula completamente el propósito de `FifoMaterializerService` y golpea el motor lógico FIFO en cada petición del reporte de impuestos.
   - *La Solución*: Refactorizar la consulta SQL en el `DuckDbTaxCalculatorAdapter` para leer de la tabla materializada de SQLite (`ledger.lot_history_events`).
