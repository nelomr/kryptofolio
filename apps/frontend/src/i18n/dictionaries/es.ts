import type { I18nDictionary } from "@/core/domain/models/I18nDictionary";

export const es: I18nDictionary = {
  "dashboard.title": "Kryptofolio",
  "dashboard.greeting": "Hola {name}",
  "navbar.portfolio": "Portafolio",
  "navbar.settings": "Ajustes",
  "navbar.logout": "Cerrar sesión",

  // Common
  "common.edit_disabled":
    "La edición de la transacción {id} está deshabilitada actualmente.",
  "common.delete_disabled":
    "La eliminación de la transacción {id} está deshabilitada actualmente.",

  // Settings
  "settings.title": "Ajustes",
  "settings.description":
    "Gestiona tus preferencias locales, claves de API y opciones de seguridad.",
  "settings.language.title": "Idioma de la Interfaz",
  "settings.language.description":
    "Selecciona el idioma en el que se mostrará la aplicación.",
  "settings.language.select_placeholder": "Selecciona un idioma",
  "settings.language.option_es": "Español",
  "settings.language.option_en": "Inglés",
  "settings.language.save_btn": "Guardar",
  "settings.language.saving_btn": "Guardando...",
  "settings.language.success": "Idioma actualizado correctamente",
  "settings.language.error": "Error al guardar el idioma",

  // Settings — Moneda Base
  "settings.currency.title": "Moneda Base",
  "settings.currency.description": "Selecciona la moneda fiat con la que se mostrarán todos los valores del portfolio.",
  "settings.currency.select_placeholder": "Selecciona una moneda",
  "settings.currency.option_usd": "USD — Dólar estadounidense",
  "settings.currency.option_eur": "EUR — Euro",
  "settings.currency.option_gbp": "GBP — Libra esterlina",
  "settings.currency.save_btn": "Guardar",
  "settings.currency.saving_btn": "Guardando...",
  "settings.currency.success": "Moneda base actualizada correctamente",
  "settings.currency.error": "Error al guardar la moneda base",
  "settings.currency.sync_success": "Tipos de cambio sincronizados correctamente",
  "settings.currency.sync_error": "Error al sincronizar los tipos de cambio",
  "settings.currency.sync_tooltip": "Los nuevos datos salen a las 16:30",

  // Errors
  "errors.validation.title": "Error de Validación de Datos",
  "errors.validation.parser_skipped_rows":
    "El parser de {parser} omitió {skipped} filas inválidas o no soportadas.",
  "errors.validation.malformed_record":
    "Un registro de transacción fue omitido debido a datos malformados.",
  "errors.validation.malformed_derivative":
    "Un registro de derivados fue omitido debido a datos malformados.",
  "errors.validation.api_malformed_data":
    "La API del Portfolio devolvió datos malformados.",
  "errors.validation.csv_required":
    "La subida de CSV requiere seleccionar un archivo.",
  "errors.market.invalid_price_event":
    "Evento de precio inválido recibido del flujo de mercado.",
  "errors.market.invalid_global_metrics":
    "Métricas globales inválidas recibidas del flujo de mercado.",

  // Portfolio Header
  "portfolio.roi": "ROI Total",
  "portfolio.invested": "Capital Invertido",
  "portfolio.analytics": "Analítica",
  "portfolio.holdings": "Holdings",
  "portfolio.metrics": "Métricas",
  "portfolio.metrics_tabs.performance_history": "Historial de Rendimiento",
  "portfolio.metrics_tabs.performance.kicker": "Historial de Rentabilidad",
  "portfolio.metrics_tabs.performance.title": "Portfolio Performance",
  "portfolio.metrics_tabs.performance.desc":
    "Valor liquidado de cartera frente a coste base ({cost}). Línea azul = capital, gris punteado = coste base.",
  "portfolio.metrics_tabs.performance.stats.return": "Retorno {range}",
  "portfolio.metrics_tabs.performance.stats.return_desc":
    "Beneficio o pérdida absoluta (en Fiat) generada en el período seleccionado.",
  "portfolio.metrics_tabs.performance.stats.vs_cost": "% s/coste",
  "portfolio.metrics_tabs.performance.stats.vs_cost_desc":
    "Rendimiento porcentual frente a la inversión inicial o coste base.",
  "portfolio.metrics_tabs.performance.stats.volatility": "Volatilidad",
  "portfolio.metrics_tabs.performance.stats.volatility_desc":
    "Dispersión de los retornos (desviación estándar). A mayor %, mayor riesgo o fluctuación.",
  "portfolio.metrics_tabs.performance.stats.best_day": "Mejor día",
  "portfolio.metrics_tabs.performance.stats.best_day_desc":
    "El porcentaje de ganancia más alto registrado en un solo día.",
  "portfolio.metrics_tabs.performance.tooltip.equity": "Capital:",
  "portfolio.metrics_tabs.performance.tooltip.cost": "Coste:",

  // Risk Metrics
  "portfolio.metrics_tabs.risk.kicker": "Ratio de Sharpe · Rolling 30D",
  "portfolio.metrics_tabs.risk.title": "Sharpe Ratio",
  "portfolio.metrics_tabs.risk.desc":
    "Rentabilidad ajustada al riesgo. Sobre 1 = rentabilidad compensa volatilidad. Banda verde = zona excelente.",
  "portfolio.metrics_tabs.risk.current": "Sharpe actual",
  "portfolio.metrics_tabs.risk.stats.sharpe": "Sharpe YTD",
  "portfolio.metrics_tabs.risk.stats.sharpe_desc":
    "Ratio de Sharpe calculado sobre el año en curso (Year To Date).",
  "portfolio.metrics_tabs.risk.stats.sortino": "Sortino",
  "portfolio.metrics_tabs.risk.stats.sortino_desc":
    "Similar al Sharpe, pero solo penaliza la volatilidad negativa (caídas).",
  "portfolio.metrics_tabs.risk.stats.calmar": "Calmar",
  "portfolio.metrics_tabs.risk.stats.calmar_desc":
    "Rentabilidad anualizada dividida por el máximo drawdown.",
  "portfolio.metrics_tabs.risk.zones.excellent": "EXCELENTE",
  "portfolio.metrics_tabs.risk.zones.acceptable": "ACEPTABLE",
  "portfolio.metrics_tabs.risk.zones.loss": "PÉRDIDA",

  "portfolio.syncing": "(Sincronizando...)",
  "portfolio.no_assets": "No se han encontrado activos en la cartera.",
  "portfolio.subtitle": "Analisis portfolio",
  "portfolio.sync_btn": "Sincronizar Portfolio",

  // Metrics
  "metrics.net_equity": "Patrimonio Neto Total",
  "metrics.unrealized_pnl": "PyG No Realizado",
  "metrics.realized_pnl": "PyG Realizado (Imponible)",

  // KPI Metrics Dashboard
  "metrics.error_loading": "Error al cargar KPIs:",
  "metrics.drawdown.kicker": "Riesgo de Caída Máxima",
  "metrics.drawdown.title": "Curva de Drawdown Histórico",
  "metrics.drawdown.desc": "Porcentaje de caída histórica de la cartera desde su punto máximo (ATH). El área roja muestra la caída.",
  "metrics.drawdown.tooltip_label": "Drawdown:",
  "metrics.roi_total_label": "ROI Total",
  "metrics.roi_delta_desc": "en 24h",
  "metrics.invested_label": "Invertido",
  "metrics.max_drawdown_label": "Max Drawdown",
  "metrics.drawdown_delta_desc": "desde ATH",
  "metrics.recovered_label": "Recuperado",
  "metrics.win_rate_label": "Tasa de Acierto",
  "metrics.trades_won": "Ganadas",
  "metrics.trades_lost": "Perdidas",
  "metrics.trades_total": "Totales",
  "metrics.average_r_label": "R Promedio",
  "metrics.best_worst_label": "Mejor / Peor",
  "metrics.dispersion_label": "Dispersión",
  "metrics.portfolio": "del Portfolio",
  "metrics.asset_allocation": "Dstribución de Assets",
  "metrics.distribution": "Distribución",
  "metrics.assets_kicker_upper": "ACTIVOS",
  "metrics.assets_kicker": "Activos",
  "metrics.assets_kicker_desc":
    "Número total de criptoactivos distintos que conforman tu cartera actual.",
  "metrics.hhi_kicker": "HHI",
  "metrics.hhi_kicker_desc":
    "Herfindahl-Hirschman Index. Mide la concentración. >2500 indica alta concentración en pocos activos.",
  "metrics.volatility.kicker": "Heatmap de Volatilidad",
  "metrics.volatility.title": "Retornos diarios · 15 semanas",
  "metrics.volatility.desc":
    "Cada celda es un día. Verde = retorno positivo, rojo = pérdida, intensidad = magnitud.",
  "metrics.volatility.tooltip.date": "Fecha",
  "metrics.volatility.tooltip.return": "Retorno",
  "metrics.volatility.stats.daily_avg": "Media Diaria",
  "metrics.volatility.stats.best_day": "Mejor día",
  "metrics.volatility.stats.best_day_desc":
    "La ganancia porcentual más alta en un solo día dentro del mapa de calor.",
  "metrics.volatility.stats.worst_day": "Peor día",
  "metrics.volatility.stats.worst_day_desc":
    "La mayor caída porcentual registrada en un solo día.",
  "metrics.volatility.stats.bullish_days": "Días Alcistas",
  "metrics.volatility.stats.bullish_days_desc":
    "Proporción de días que cerraron en positivo frente al total de días mostrados.",

  // Token Summary Cards
  "token.balance": "Balance",
  "token.current_value": "Valor Actual",
  "token.base_cost": "Coste Base",
  "token.unrealized_pnl": "PnL Latente",

  // Token Active Lots
  "token.active_lots.title": "Lotes FIFO Activos (Unidades sin vender)",
  "token.active_lots.date": "Fecha de Adquisición",
  "token.active_lots.remaining_qty": "Cantidad Restante",
  "token.active_lots.buy_price": "Precio de Compra",
  "token.active_lots.remaining_cost": "Coste Restante",
  "token.active_lots.status": "Estado",
  "token.active_lots.in_portfolio": "En Cartera",

  // Token Sales History
  "token.sales_history.date": "Fecha",
  "token.sales_history.sold_qty": "Cant. Vendida",
  "token.sales_history.sell_price": "Precio de Venta",
  "token.sales_history.type": "Tipo",
  "token.sales_history.sold": "Vendido",
  "token.sales_history.title": "Historial de Ventas y P&L Realizado",

  // Expanded Lots Table properties merged below

  // Lot Event History
  "lot_events.date": "Fecha Evento",
  "lot_events.concept": "Concepto",
  "lot_events.sell_price": "Precio Venta",
  "lot_events.notes": "Notas",
  "lot_events.non_taxable": "Evento No Imponible",
  "lot_events.badge_activation": "Activación",
  "lot_events.badge_exempt": "Exento",
  "lot_events.badge_gain": "BENEFICIO",
  "lot_events.badge_loss": "PÉRDIDA",
  "lot_events.affected_amount": "Cant. Afectada",
  "lot_events.pnl": "PyG (€)",
  "lot_events.non_taxable_desc":
    "Este movimiento no genera plusvalía/minusvalía fiscal (LIRPF Art. 33.1).",

  // Tables & Columns
  "table.asset_type_crypto": "Cryptocurrency",
  "table.asset_type_fiat": "Dinero Fiat",
  "table.asset": "Activo",
  "table.balance": "Balance",
  "table.avg_cost": "Coste Medio",
  "table.market_value": "Valor de Mercado",
  "table.performance": "Rendimiento",
  "table.locations": "Ubicaciones",

  // Expanded Lots Table
  "expanded_lots.title": "Lotes Fiscales FIFO (Abiertos)",
  "expanded_lots.date": "Fecha",
  "expanded_lots.type_status": "Tipo / Estado",
  "expanded_lots.orig_amount": "Cant. Orig",
  "expanded_lots.rest_amount": "Cant. Rest",
  "expanded_lots.location": "Ubicación",
  "expanded_lots.unit_cost": "Coste Unit.",
  "expanded_lots.total_cost": "Coste Total",
  "expanded_lots.buy": "COMPRA",
  "expanded_lots.sold": "VENDIDO",
  "expanded_lots.ai_insight": "💡 AI Insight",
  "expanded_lots.tax_loss": "Tax-Loss Harvesting",
  "expanded_lots.tax_loss_desc": " antes del cierre fiscal.",
  "expanded_lots.no_lots": "No se han encontrado lotes fiscales detallados",
  "expanded_lots.view_history": "Ver historial del lote",
  "expanded_lots.unknown_exchange": "Desconocido",

  // Lot Status
  "lot_status.open": "ABIERTO",
  "lot_status.partial": "PARCIAL",
  "lot_status.sold": "VENDIDO",

  // Token Details
  "token.no_details": "No hay detalles disponibles para este activo.",
  "token.details.title": "Detalles de {symbol}",
  "token.details.subtitle": "Desglose histórico y fiscal completo",
  "token.no_active_lots": "No hay lotes abiertos para este activo.",
  "token.no_sales_history": "No hay historial de ventas.",
  "token.gain_loss": "Ganancia / Pérdida",

  // Transaction Types (from MockAdapter etc)
  "tx_type.buy": "Compra",
  "tx_type.sell": "Venta",
  "tx_type.deposit": "Depósito",
  "tx_type.airdrop": "Airdrop",

  // Pagination
  "pagination.prev": "Anterior",
  "pagination.next": "Siguiente",
  "pagination.showing": "Mostrando",
  "pagination.to": "a",
  "pagination.of": "de",
  "pagination.results": "resultados",
  "pagination.aria_label": "Paginación",

  // Tax Domain
  "tax.title": "Informe Fiscal",
  "tax.subtitle": "Cumplimiento AEAT IRPF • Transacciones e Informe Fiscal",
  "tax.transactions.title": "Transacciones Fiscales",
  "tax.transactions.empty": "No se encontraron transacciones.",
  "tax.col.date": "Fecha",
  "tax.col.type": "Tipo",
  "tax.col.asset": "Activo",
  "tax.col.amount": "Cantidad",
  "tax.col.price": "Precio (€)",
  "tax.col.total": "Total (€)",
  "tax.col.actions": "Acciones",
  // Derivatives table columns
  "tax.col.contract": "Contrato",
  "tax.col.trade_price": "Precio operacion",
  "tax.col.pnl": "PnL (€)",
  "tax.col.fees_funding": "Fees + Funding",
  "tax.col.status": "Estado",
  "tax.derivatives.title": "Transacciones de Futuros y Derivados",
  "tax.derivatives.empty": "No se encontraron operaciones de derivados.",
  "tax.upload.title": "Subir Archivo Fiscal",
  "tax.upload.subtitle":
    "Compatible con CSV y XLSX de Kraken, Bitvavo, BitUnix, Tangem y Bit2Me.",
  "tax.upload.btn": "Subir Archivo",
  "tax.upload.uploading": "Subiendo...",
  "tax.upload.select": "Selecciona un archivo CSV o XLSX",
  "tax.import.title": "Importación Blockchain",
  "ingestion.wizard.label": "Asistente de Importación",
  "tax.import.subtitle":
    "Importa transacciones directamente desde el ledger público.",
  "tax.import.btn": "Importar",
  "tax.import.importing": "Importando...",
  "tax.import.chain_label": "Red",
  "tax.import.address_placeholder": "Dirección de Wallet / ID de Cuenta",
  "tax.delete.btn": "Borrar Todo",
  "tax.delete.confirm":
    "¿Estás seguro? Esto eliminará permanentemente todas las transacciones fiscales.",
  "tax.entries": "ENTRADAS",

  // Tax Report New Components
  "tax.header.badge": "Motor de Cumplimiento",
  "tax.header.sync": "Sync Web3",
  "tax.header.upload": "Subir CSV",
  "tax.wallets.upload": "Subir Wallets",
  "tax.wallets.upload_success": "Wallets actualizadas con éxito",
  "tax.wallets.upload_error": "Error al subir las wallets",
  "tax.wallets.all": "Todas las Wallets",
  "tax.wallets.tooltip_title": "Formato CSV requerido:",
  "tax.header.pending": "Funcionalidad pendiente de integración con backend",
  "tax.header.delete_title": "Eliminar datos",

  "tax.summary.capital_gains": "Ganancias Patrimoniales",
  "tax.summary.yields": "Rendimientos (Yields)",
  "tax.summary.total_losses": "Pérdidas Compensables",
  "tax.summary.estimated_irpf": "IRPF Estimado (Base Ahorro)",

  "tax.integrity.title": "Hospital Fiscal",
  "tax.integrity.analyzing": "Analizando integridad de datos...",
  "tax.integrity.healthy":
    "Los datos fiscales son consistentes. No se detectaron anomalías.",

  "tax.tabs.ledgers": "Libros de Operaciones",
  "tax.tabs.report": "Auditoría e Informes",
  "tax.tabs.chat": "Asistente IA",
  "tax.tabs.in_development": "(En desarrollo)",
  "tax.tabs.spot": "Operaciones Spot",
  "tax.tabs.futures": "Futuros y Derivados",
  "tax.tabs.spot_ledger": "Libro Spot",
  "tax.tabs.futures_ledger": "Libro de Futuros",
  "tax.tabs.spot_dev": "OPERACIONES SPOT EN DESARROLLO (Filtro Año: {year})",
  "tax.tabs.futures_dev":
    "FUTUROS Y DERIVADOS EN DESARROLLO (Filtro Año: {year})",
  "tax.tabs.chat_dev": "ASISTENTE IA EN DESARROLLO",
  "tax.filters.year": "Año",
  "tax.filters.all": "Todos",

  // Tax Audit Report Tab (TaxFiscalControls + TaxReportDetailsTable)
  "tax.audit.fiscal_year": "Ejercicio Fiscal",
  "tax.audit.method": "Método de Cálculo",
  "tax.audit.method_fifo": "FIFO (Primero en entrar, primero en salir)",
  "tax.audit.recalculate": "Recalcular",
  "tax.audit.recalculating": "Recalculando...",
  "tax.audit.download_report": "Descargar Informe",
  "tax.audit.downloading": "Descargando...",
  "tax.audit.download_pdf": "PDF",
  "tax.audit.download_csv": "CSV",
  "tax.audit.controls_title": "Parámetros de Cálculo",
  "tax.audit.controls_desc":
    "Ejercicio fiscal y método FIFO para generación de libro de auditoría AEAT.",

  // Audit Trail Table
  "tax.audit.table_title": "Libro de Trazabilidad FIFO (Auditoría AEAT)",
  "tax.audit.table_empty":
    "No hay datos disponibles para el ejercicio seleccionado.",
  "tax.audit.table_loading": "Generando Libro de Auditoría...",
  "tax.audit.col_date": "Fecha",
  "tax.audit.col_operation": "Operación",
  "tax.audit.col_asset": "Activo",
  "tax.audit.col_exchange": "Exchange",
  "tax.audit.col_amount": "Unidades",
  "tax.audit.col_sale_price": "Precio Venta",
  "tax.audit.col_gain_loss": "PyG",
  "tax.audit.col_fee": "Comisión (€)",
  "tax.audit.col_taxable": "Imponible",
  "tax.audit.col_notes": "Trazabilidad",
  "tax.audit.taxable_yes": "SÍ",
  "tax.audit.taxable_no": "NO",
  "tax.audit.badge_gain": "GANANCIA",
  "tax.audit.badge_loss": "PÉRDIDA",
  "tax.audit.badge_exempt": "EXENTO",
  "tax.audit.badge_activation": "RESERVA",

  // Vault Settings
  "vault.title": "Bóveda de Secretos",
  "vault.subtitle": "Bóveda Criptográfica AES-256-GCM",
  "vault.locked.title": "Bóveda Bloqueada",
  "vault.locked.desc":
    "Introduce tu contraseña maestra para desbloquear y acceder a tus credenciales locales.",
  "vault.locked.password_placeholder": "Contraseña maestra",
  "vault.locked.unlock_btn": "Desbloquear Bóveda",
  "vault.unlocked.title": "Bóveda Desbloqueada",
  "vault.unlocked.desc":
    "Tu bóveda está desbloqueada. Puedes gestionar de forma segura tus claves de integración a continuación.",

  // Vault Dynamic Providers
  "vault.provider.generic.description":
    "Sincroniza el API KEY de {providerName} de forma segura.",
  "vault.provider.generic.fields.format_title":
    "Solo se permiten caracteres alfanuméricos y símbolos básicos (-_+=/.)",
  "vault.provider.generic.fields.apiKey.label": "API Key",
  "vault.provider.generic.fields.apiSecret.label": "API Secret",

  "vault.errors.invalid_format":
    "Formato inválido: Caracteres no permitidos detectados",
  "vault.errors.invalid_password": "La contraseña proporcionada es incorrecta",
  "vault.errors.unknown_provider": "El proveedor especificado no es válido",
  "vault.errors.unlock_failed": "Fallo al desbloquear la bóveda",
  "vault.errors.save_failed": "Error al guardar credenciales",
  "vault.errors.toggle_failed": "Error al cambiar el estado del proveedor",
  "vault.success.unlocked": "Bóveda desbloqueada con éxito",
  "vault.success.saved": "Credenciales guardadas de forma segura",

  // Estado y Acciones del Vault
  "vault.provider.status.configured": "Vinculado",
  "vault.provider.status.not_configured": "No vinculado",
  "vault.actions.save": "Guardar",

  // Data Ingestion Wizard
  "ingestion.wizard.title": "Asistente de Importación",
  "ingestion.wizard.subtitle":
    "Sube un archivo para validar y mapear tus datos antes de insertarlos en el sistema.",
  "ingestion.wizard.step_upload": "Subir Archivo",
  "ingestion.wizard.step_review": "Revisión",
  "ingestion.wizard.step_success": "¡Validación Correcta!",
  "ingestion.wizard.market_type_label": "Tipo de mercado",
  "ingestion.wizard.timezone_label": "Zona Horaria",
  "ingestion.wizard.market_spot": "Mercado Spot",
  "ingestion.wizard.market_futures": "Futuros / Derivados",

  // Dropzone Area
  "ingestion.dropzone.drag_drop":
    "Arrastra y suelta tu archivo CSV o XLSX aquí",
  "ingestion.dropzone.or_click": "o haz clic para seleccionar un archivo",
  "ingestion.dropzone.format_help":
    "Soporta CSV y XLSX de Kraken, Bitvavo, Bit2Me y otros",

  // Data Grid Validator
  "ingestion.grid.parsing": "Procesando archivo, por favor espera...",
  "ingestion.grid.unsupported": "Esperando archivo...",
  "ingestion.grid.ready_to_import":
    "Todos los registros son válidos. Listo para importar.",
  "ingestion.grid.fix_errors":
    "Por favor, corrige {count} filas con errores antes de continuar.",
  "ingestion.grid.imported_success":
    "Archivo importado con éxito. Las transacciones han sido registradas.",
  "ingestion.grid.col_status": "Estado",
  "ingestion.grid.select_mapping": "Seleccionar campo...",
  "ingestion.grid.mapping_unmapped": "Sin mapear",
  "ingestion.grid.cell_error": "Requerido o formato inválido",

  // Ingestion Columns
  "ingestion.columns.date": "Fecha / Hora",
  "ingestion.columns.timezone": "Zona Horaria",
  "ingestion.columns.type": "Tipo (Compra, Venta, Retiro...)",
  "ingestion.columns.ticker": "Moneda / Asset",
  "ingestion.columns.amount": "Cantidad",
  "ingestion.columns.price": "Precio",
  "ingestion.columns.fee": "Comisión",
  "ingestion.columns.feeAsset": "Moneda Comisión",
  "ingestion.columns.txId": "ID Transacción (TxId)",
  "ingestion.columns.orderId": "ID Pedido",
  "ingestion.columns.network": "Red / Cadena",
  "ingestion.columns.fiatValue": "Valor Fiat",
  "ingestion.columns.fiatCurrency": "Moneda Fiat",
  "ingestion.columns.sourceAddress": "Dirección Origen",
  "ingestion.columns.destinationAddress": "Dirección Destino",
  "ingestion.columns.balance": "Saldo / Balance",
  "ingestion.columns.pnl": "Beneficio / Pérdida",
  "ingestion.columns.exchange": "Exchange / Plataforma",
  "ingestion.columns.description": "Descripción / Nota",
  "ingestion.columns.time": "Hora",
  "ingestion.columns.status": "Estado",
  "ingestion.columns.source_address": "Dirección Origen",
  "ingestion.columns.destination_address": "Dirección Destino",
  "ingestion.columns.tx_id": "ID Transacción",
  "ingestion.columns.group_id": "ID Grupo",
  "ingestion.columns.tx_type": "Tipo de Transacción",
  "ingestion.columns.asset": "Activo",
  "ingestion.columns.amount_in": "Cantidad de Entrada",
  "ingestion.columns.asset_in": "Activo de Entrada",
  "ingestion.columns.amount_out": "Cantidad de Salida",
  "ingestion.columns.asset_out": "Activo de Salida",
  "ingestion.columns.total_fiat": "Total Fiat",
  "ingestion.columns.price_fiat": "Precio Fiat",
  "ingestion.columns.quote_currency": "Moneda de Cotización (Quote)",
  "ingestion.columns.fiat_currency": "Moneda Total (Fiat/Valor)",
  "ingestion.columns.fee_amount": "Comisión",
  "ingestion.columns.fee_currency": "Moneda Comisión",
  "ingestion.columns.symbol": "Símbolo / Contrato",
  "ingestion.columns.realized_pnl": "PnL Realizado",
  "ingestion.columns.pnl_currency": "Moneda PnL",
  "ingestion.columns.funding_amount": "Funding / Financiación",
  "ingestion.columns.funding_currency": "Moneda Funding",
  "ingestion.columns.metadata": "Metadatos (Pasarela)",

  // Ingestion Errors
  "ingestion.errors.tx_type_required": "El tipo de transacción es requerido",
  "ingestion.errors.amount_invalid": "La cantidad debe ser un número válido",
  "ingestion.errors.financial_data_missing":
    "Faltan datos financieros: Debes proporcionar Cantidad+Activo, Totales Fiat, o Campos de Dirección",
  "ingestion.errors.time_data_missing":
    "Faltan datos de tiempo: Debes proporcionar Fecha o Timestamp",
  "ingestion.errors.unsupported_format":
    "Formato no soportado. Por favor, sube un archivo CSV o Excel.",
  "ingestion.errors.unknown_parsing_error":
    "Error desconocido al procesar el archivo.",
  "ingestion.errors.no_sheets": "No se encontraron hojas en el archivo Excel.",
  "ingestion.errors.file_empty": "El archivo está vacío.",
  "ingestion.errors.read_failed": "Error al leer el archivo.",
  "ingestion.errors.no_valid_data": "No se encontraron datos válidos.",
  "ingestion.errors.no_valid_rows_to_import":
    "No hay filas válidas para importar.",
  "ingestion.errors.unknown_submission_error":
    "Error desconocido durante la importación.",

  // Market Data Provider Settings
  "market.title": "Datos de Mercado",
  "market.subtitle": "Configura los proveedores de precio en tiempo real",
  "market.provider.kraken.name": "Kraken",
  "market.provider.kraken.desc": "Feed de precios WebSocket en tiempo real",
  "market.provider.coingecko.name": "CoinGecko",
  "market.provider.coingecko.desc": "Polling REST cada 60 s",
  "market.provider.active": "Activo",
  "market.provider.inactive": "Inactivo",
  "market.provider.category.crypto": "Cripto",
  "market.provider.category.general": "General",
  "market.provider.exclusive_note": "Solo puede haber un proveedor activo por categoría",
  "market.provider.success": "Proveedor de mercado actualizado con éxito",
  "market.provider.error": "Error al actualizar el proveedor de mercado",
  "vault.provider.market_data.title": "Proveedor de Precios en Tiempo Real",
  "vault.provider.market_data.desc": "Usa este proveedor para obtener los datos globales del mercado.",
  "market.stream.connected": "Conectado",
  "market.stream.disconnected": "Desconectado",
};
