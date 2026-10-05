/** Identificadores únicos legibles con prefijo por entidad (p. ej. `prj_lq3k2f9a8c`). */
export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}
