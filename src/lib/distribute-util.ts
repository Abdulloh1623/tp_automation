// Taqsimotning sof (DB'siz) mantig'i — izolyatsiyada testlanadi.

/**
 * id'larni operatorlarga round-robin taqsimlaydi, har biriga `cap` gacha.
 * Sig'imdan (operatorlar×cap) ortgani `overflow`ga tushadi.
 */
export function splitRoundRobin(
  ids: string[],
  operatorIds: string[],
  cap: number,
): { byOp: Map<string, string[]>; overflow: string[] } {
  const capacity = operatorIds.length * cap;
  const selected = ids.slice(0, capacity);
  const overflow = ids.slice(capacity);
  const byOp = new Map<string, string[]>(operatorIds.map((id) => [id, []]));
  selected.forEach((id, i) => byOp.get(operatorIds[i % operatorIds.length])!.push(id));
  return { byOp, overflow };
}
