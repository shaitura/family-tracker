import { describe, it, expect } from 'vitest';
import { docToEntity } from './entityMapping';

describe('docToEntity', () => {
  it('uses the Firestore document id', () => {
    const e = docToEntity<{ id: string; amount: number }>('abc123', { amount: 50 });
    expect(e.id).toBe('abc123');
    expect(e.amount).toBe(50);
  });

  it('never lets a stored `id` field shadow the document id', () => {
    // The regression: a row carrying its own `id` became uneditable, because
    // update()/delete() addressed doc(db, col, '<stale-id>') — a path that does
    // not exist — and the rejection was never surfaced anywhere in the UI.
    const e = docToEntity<{ id: string; category: string }>('realDocId', {
      id: 'stale-id-from-an-older-writer',
      category: 'ילדים',
    });
    expect(e.id).toBe('realDocId');
    expect(e.category).toBe('ילדים');
  });

  it('keeps every other field intact', () => {
    const e = docToEntity<Record<string, unknown>>('x', { a: 1, b: null, c: 'ok' });
    expect(e).toEqual({ id: 'x', a: 1, b: null, c: 'ok' });
  });
});
