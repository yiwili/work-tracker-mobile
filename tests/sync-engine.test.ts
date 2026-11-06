import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkTrackerClient } from '../src/core/api-client.js';
import { MemoryStorageAdapter } from '../src/core/storage.js';
import { SyncEngine } from '../src/core/sync-engine.js';
import { Entity, PushRequest, PushResponse, PullResponse } from '../src/core/types.js';

test('SyncEngine builds dirty ops and handles applied response', async () => {
  const storage = new MemoryStorageAdapter();

  // Create local work item entity
  const localItem: Entity = {
    entity_type: 'work_item',
    entity_id: 'task-101',
    version: 1,
    field_versions: { title: 1, confirmed_minutes: 1 },
    fields: {
      date: '2026-11-06',
      title: 'Fix issue',
      confirmed_minutes: 60,
    },
    updated_at: new Date().toISOString(),
  };

  await storage.saveEntity(localItem);
  await storage.markDirty('work_item', 'task-101');

  let pushedOpsCount = 0;

  // Mock fetch
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = String(input);
    if (urlStr.includes('/sync/push')) {
      const body: PushRequest = JSON.parse(init?.body as string);
      pushedOpsCount = body.ops.length;
      const resp: PushResponse = {
        cursor: 10,
        results: body.ops.map((op) => ({
          op_id: op.op_id,
          status: 'applied',
          entity: {
            entity_type: op.entity_type,
            entity_id: op.entity_id,
            version: op.base_version + 1,
            field_versions: { title: op.base_version + 1, confirmed_minutes: op.base_version + 1 },
            fields: {
              ...op.fields,
            },
            updated_at: new Date().toISOString(),
          },
        })),
      };
      return new Response(JSON.stringify(resp), { status: 200 });
    }

    if (urlStr.includes('/sync/pull')) {
      const resp: PullResponse = {
        changes: [],
        cursor: 10,
        has_more: false,
      };
      return new Response(JSON.stringify(resp), { status: 200 });
    }

    return new Response('{}', { status: 200 });
  };

  const client = new WorkTrackerClient({ baseUrl: 'http://localhost:8080', token: 'test-token' });
  const engine = new SyncEngine(client, storage);

  const res = await engine.sync();
  assert.equal(pushedOpsCount, 1);
  assert.equal(res.pushed, 1);
  assert.equal(res.applied, 1);
  assert.equal(res.new_cursor, 10);

  // Dirty flag should be cleared
  const dirty = await storage.getDirtyEntities();
  assert.equal(dirty.length, 0);

  // Shadow should be saved
  const shadow = await storage.getShadow('work_item', 'task-101');
  assert.ok(shadow);
  assert.equal(shadow.version, 1);
});
