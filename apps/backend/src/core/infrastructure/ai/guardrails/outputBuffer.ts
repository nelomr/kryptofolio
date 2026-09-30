export function appendToBuffer(state: Record<string, unknown>, delta: string): void {
  const current = state.buffer;
  state.buffer = `${typeof current === 'string' ? current : ''}${delta}`;
}

export function readBuffer(state: Record<string, unknown>): string {
  const current = state.buffer;
  return typeof current === 'string' ? current : '';
}
