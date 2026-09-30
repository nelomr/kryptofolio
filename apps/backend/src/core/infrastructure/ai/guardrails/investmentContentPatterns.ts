/**
 * A deterministic pattern detector, in Spanish and English. This is a heuristic, not a
 * classifier — the false-positive/paraphrase-evasion trade-off is a deliberate, explicit choice,
 * deferring a real classifier to Phase 1's `ModerationProcessor`.
 */
const INVESTMENT_CLAIM_PATTERN =
  /forecast|price target|will (rise|fall|go up|go down|increase|decrease)|allocation|rebalanc|market timing|time the market|pron[oó]stico|predicci[oó]n|previsi[oó]n|asignaci[oó]n de (activos|cartera)|reequilibr|cronometrar el mercado|momento del mercado/i;

const DIRECTIVE_INJECTION_PATTERN =
  /ignore (your|the) (disclaimer|guardrail|instructions)|disregard (your|the) (disclaimer|guardrail|instructions)|answer as a licensed (adviser|advisor)|act as a licensed (adviser|advisor)|ignora (tu|el) (descargo|las instrucciones)|act[uú]a como un asesor con licencia|responde como un asesor con licencia/i;

const TAX_EVASION_PATTERN =
  /hide (gains|income|profits) from (the )?(tax|irpf|hacienda|authorities)|evade taxes|avoid paying taxes illegally|not (report|declare) (gains|income) to (the )?(tax|irpf|hacienda)|ocultar (ganancias|ingresos) (a|de) (hacienda|la agencia tributaria)|evadir impuestos|no declarar (ganancias|ingresos) a hacienda/i;

export function mentionsInvestmentClaim(text: string): boolean {
  return INVESTMENT_CLAIM_PATTERN.test(text);
}

export function mentionsDirectiveInjection(text: string): boolean {
  return DIRECTIVE_INJECTION_PATTERN.test(text);
}

export function mentionsTaxEvasion(text: string): boolean {
  return TAX_EVASION_PATTERN.test(text);
}
