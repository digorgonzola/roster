/** Mint a globally unique id, safe to create on any device without coordination. */
export function newId(): string {
  return crypto.randomUUID()
}
