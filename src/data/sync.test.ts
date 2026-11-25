import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { ensureSeeded } from './seed';
import { saveTask, deleteTask } from './tasks';
import { joinHousehold, leaveHousehold, parseInvite, startSharing, syncNow } from './sync';

/** A tiny in-memory stand-in for the sync server, with the same newest-wins rule. */
function fakeServer() {
  const rows = new Map<string, { tbl: string; id: string; at: string; deleted: boolean; data: unknown; seq: number }>();
  let seq = 0;
  const KEY = `${'a'.repeat(32)}.${'b'.repeat(64)}`;
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (url.endsWith('/households')) return new Response(JSON.stringify({ key: KEY }));
    if ((init.headers as Record<string, string>).Authorization !== `Bearer ${KEY}`) return new Response('{}', { status: 401 });
    for (const c of body.changes) {
      const k = `${c.tbl}|${c.id}`;
      const cur = rows.get(k);
      if (!cur || c.at > cur.at) rows.set(k, { ...c, data: c.deleted ? null : c.data, seq: ++seq });
    }
    const out = [...rows.values()].filter((r) => r.seq > body.since).sort((a, b) => a.seq - b.seq);
    return new Response(JSON.stringify({ changes: out, cursor: out.length ? out[out.length - 1].seq : body.since, more: false }));
  });
  return { rows, fetchMock, KEY, push: (c: { tbl: string; id: string; at: string; deleted?: boolean; data?: unknown }) =>
    rows.set(`${c.tbl}|${c.id}`, { deleted: false, data: null, ...c, seq: ++seq }) };
}

let server: ReturnType<typeof fakeServer>;

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureSeeded();
  server = fakeServer();
  vi.stubGlobal('fetch', server.fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const dept = async () => (await db.departments.toCollection().first())!.id;
const newTask = async (name: string) =>
  saveTask({ name, departmentId: await dept(), notes: '', paused: false, cadence: 'weekly', timingMode: 'every', timingValue: null });

describe('household sharing', () => {
  it('notes every local write in the outbox, including updates and hard deletes', async () => {
    await db.syncOutbox.clear();
    const id = await newTask('Mop');
    expect(await db.syncOutbox.get(`tasks|${id}`)).toBeTruthy();
    await db.occurrences.add({ id: 'o1', taskId: id, periodStart: 'x', periodEnd: 'y', dueDate: null, status: 'open', createdAt: '', updatedAt: '', deletedAt: null });
    await db.occurrences.delete('o1');
    expect(await db.syncOutbox.get('occurrences|o1')).toBeTruthy();
    await db.occurrences.add({ id: 'o2', taskId: id, periodStart: 'x', periodEnd: 'y', dueDate: null, status: 'open', createdAt: '', updatedAt: '', deletedAt: null });
    await db.occurrences.where('taskId').equals(id).delete();
    expect(await db.syncOutbox.get('occurrences|o2')).toBeTruthy();
  });

  it('starting to share sends everything up and empties the outbox', async () => {
    await newTask('Mop');
    const key = await startSharing();
    expect(key).toBe(server.KEY);
    expect([...server.rows.keys()].filter((k) => k.startsWith('tasks|'))).toHaveLength(1);
    expect(server.rows.has('household|' + (await db.household.toCollection().first())!.id)).toBe(true);
    expect(await db.syncOutbox.count()).toBe(0);
  });

  it('fetches changes from the other phone without sending them back, and the newest change wins', async () => {
    const id = await newTask('Mop');
    await startSharing();
    const task = (await db.tasks.get(id))!;
    server.push({ tbl: 'tasks', id, at: '2999-01-01T00:00:00.000Z', data: { ...task, name: 'Mop the floors' } });
    await syncNow();
    expect((await db.tasks.get(id))!.name).toBe('Mop the floors');
    expect(await db.syncOutbox.count()).toBe(0);

    // An older change from elsewhere loses to a pending local edit
    await db.tasks.update(id, { name: 'Mine' });
    server.push({ tbl: 'tasks', id, at: '2000-01-01T00:00:00.000Z', data: { ...task, name: 'Old' } });
    await syncNow();
    expect((await db.tasks.get(id))!.name).toBe('Mine');
    expect(server.rows.get(`tasks|${id}`)!.data).toMatchObject({ name: 'Mine' });
  });

  it('deletes travel too', async () => {
    const id = await newTask('Mop');
    await startSharing();
    await deleteTask(id); // soft delete: an update
    await syncNow();
    expect((server.rows.get(`tasks|${id}`)!.data as { deletedAt: string }).deletedAt).toBeTruthy();
    server.push({ tbl: 'tasks', id, at: '2999-01-01T00:00:00.000Z', deleted: true });
    await syncNow();
    expect(await db.tasks.get(id)).toBeUndefined();
  });

  it('joining replaces this phone with the household, and leaving keeps the copy', async () => {
    await newTask('Mine only');
    server.push({ tbl: 'tasks', id: 't-shared', at: '2026-01-01T00:00:00.000Z', data: { id: 't-shared', name: 'Shared', departmentId: 'd', cadence: 'weekly' } });
    await joinHousehold(server.KEY);
    expect((await db.tasks.toArray()).map((t) => t.name)).toEqual(['Shared']);
    expect(await db.syncOutbox.count()).toBe(0);
    await leaveHousehold();
    expect(await db.tasks.count()).toBe(1);
  });

  it('a wrong invite changes nothing', async () => {
    await newTask('Mine');
    await expect(joinHousehold(`${'c'.repeat(32)}.${'d'.repeat(64)}`)).rejects.toThrow();
    expect(await db.tasks.count()).toBe(1);
  });

  it('reads an invite from a link or a pasted code', () => {
    const k = `${'1'.repeat(32)}.${'f'.repeat(64)}`;
    expect(parseInvite(`https://x.github.io/neatly-household/#/join/${k}`)).toBe(k);
    expect(parseInvite(`  ${k.toUpperCase()} `)).toBe(k);
    expect(parseInvite('hello')).toBeNull();
  });
});
