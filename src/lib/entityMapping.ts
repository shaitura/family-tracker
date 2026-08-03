/**
 * Map a Firestore document to an entity.
 *
 * The document id MUST win over any `id` field stored inside the document body.
 * Some rows carry a stale `id` from an older writer; letting it shadow the real
 * one points update()/delete() at `doc(db, collection, '<stale-id>')` — a path
 * that does not exist — so every write against that row rejects. In the Admin
 * table that surfaced as a row that could not be edited in any column, with no
 * error anywhere, forever.
 *
 * Lives in its own module (no Firebase import) so it stays unit-testable: this
 * repo has no local .env, so anything that reaches firebase/auth throws on import.
 */
export function docToEntity<T>(docId: string, data: Record<string, unknown>): T {
  return { ...data, id: docId } as T;
}
