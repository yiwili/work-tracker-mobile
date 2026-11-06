/**
 * Work Tracker Mobile - Client Sync Engine
 * Implements protocol §3 (Push & 3-way merge) and §4 (Pull & Snapshot recovery).
 * Operates on the StorageAdapter interface, cleanly decoupled from UI.
 */

import { WorkTrackerClient, ApiError } from './api-client.js';
import { StorageAdapter } from './storage.js';
import { Entity, EntityType, SyncOp } from './types.js';

export interface ConflictRecord {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  conflict_fields: string[];
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  created_at: string;
}

export interface SyncResult {
  pushed: number;
  applied: number;
  conflicts: number;
  pulled: number;
  new_cursor: number;
}

export class SyncEngine {
  private inProgress = false;

  constructor(
    private client: WorkTrackerClient,
    private storage: StorageAdapter,
    private onConflict?: (conflict: ConflictRecord) => void
  ) {}

  public async getCursor(): Promise<number> {
    const raw = await this.storage.getMeta('cursor');
    return raw ? parseInt(raw, 10) : 0;
  }

  private async setCursor(cursor: number): Promise<void> {
    await this.storage.setMeta('cursor', String(cursor));
  }

  /**
   * Run a single two-way synchronization cycle (Push dirty local changes -> Pull remote changes).
   */
  public async sync(): Promise<SyncResult> {
    if (this.inProgress) {
      throw new Error('Sync already in progress');
    }
    this.inProgress = true;

    try {
      let pushed = 0;
      let applied = 0;
      let conflicts = 0;

      // 1. Build & Push dirty operations
      const dirtyList = await this.storage.getDirtyEntities();
      if (dirtyList.length > 0) {
        const ops: SyncOp[] = [];

        for (const item of dirtyList) {
          const local = await this.storage.getEntity(item.entity_type, item.entity_id);
          const shadow = await this.storage.getShadow(item.entity_type, item.entity_id);

          if (!local) {
            await this.storage.clearDirty(item.entity_type, item.entity_id);
            continue;
          }

          const baseVersion = shadow?.version ?? 0;
          const changedFields: Record<string, unknown> = {};

          if (!shadow) {
            // New entity: push all fields
            Object.assign(changedFields, local.fields);
          } else {
            // Diff against shadow
            for (const [k, v] of Object.entries(local.fields)) {
              if (JSON.stringify(v) !== JSON.stringify(shadow.fields[k])) {
                changedFields[k] = v;
              }
            }
          }

          if (Object.keys(changedFields).length > 0) {
            ops.push({
              op_id: crypto.randomUUID(),
              entity_type: item.entity_type,
              entity_id: item.entity_id,
              base_version: baseVersion,
              fields: changedFields,
            });
          } else {
            await this.storage.clearDirty(item.entity_type, item.entity_id);
          }
        }

        if (ops.length > 0) {
          pushed = ops.length;
          const pushRes = await this.client.push({ ops });

          for (const res of pushRes.results) {
            const op = ops.find((o) => o.op_id === res.op_id);
            if (!op) continue;

            if (res.status === 'applied' && res.entity) {
              applied++;
              await this.storage.saveShadow(res.entity);
              // If local fields match applied entity, clear dirty
              const local = await this.storage.getEntity(op.entity_type, op.entity_id);
              if (local && JSON.stringify(local.fields) === JSON.stringify(res.entity.fields)) {
                await this.storage.clearDirty(op.entity_type, op.entity_id);
              }
            } else if (res.status === 'conflict' && res.entity) {
              conflicts++;
              await this.handleConflict(op, res.entity, res.conflict_fields || []);
            }
          }

          if (pushRes.cursor > (await this.getCursor())) {
            await this.setCursor(pushRes.cursor);
          }
        }
      }

      // 2. Pull remote changes
      let pulled = 0;
      let hasMore = true;

      while (hasMore) {
        const currentCursor = await this.getCursor();
        let pullRes;

        try {
          pullRes = await this.client.pull(currentCursor);
        } catch (err: unknown) {
          if (err instanceof ApiError && err.status === 410) {
            // Cursor expired -> perform full snapshot recovery
            await this.recoverWithSnapshot();
            break;
          }
          throw err;
        }

        for (const remote of pullRes.changes) {
          pulled++;
          await this.applyRemoteEntity(remote);
        }

        await this.setCursor(pullRes.cursor);
        hasMore = pullRes.has_more;
      }

      await this.storage.setMeta('last_sync_at', new Date().toISOString());

      return {
        pushed,
        applied,
        conflicts,
        pulled,
        new_cursor: await this.getCursor(),
      };
    } finally {
      this.inProgress = false;
    }
  }

  /**
   * Apply an incoming remote entity from Pull or Snapshot.
   */
  private async applyRemoteEntity(remote: Entity): Promise<void> {
    const local = await this.storage.getEntity(remote.entity_type, remote.entity_id);
    const shadow = await this.storage.getShadow(remote.entity_type, remote.entity_id);

    if (!local) {
      // New from remote
      await this.storage.saveEntity(remote);
      await this.storage.saveShadow(remote);
      await this.storage.clearDirty(remote.entity_type, remote.entity_id);
      return;
    }

    if (!shadow) {
      // Local exists without shadow: three-way merge with empty base
      await this.storage.saveEntity(remote);
      await this.storage.saveShadow(remote);
      return;
    }

    // Three-way merge: base = shadow, local = local, remote = remote
    const mergedFields = { ...local.fields };
    const conflictFields: string[] = [];

    for (const [key, remoteVal] of Object.entries(remote.fields)) {
      const shadowVal = shadow.fields[key];
      const localVal = local.fields[key];

      const remoteChanged = JSON.stringify(remoteVal) !== JSON.stringify(shadowVal);
      const localChanged = JSON.stringify(localVal) !== JSON.stringify(shadowVal);

      if (remoteChanged && !localChanged) {
        // Remote-only change -> accept remote
        mergedFields[key] = remoteVal;
      } else if (remoteChanged && localChanged) {
        if (JSON.stringify(remoteVal) !== JSON.stringify(localVal)) {
          conflictFields.push(key);
        }
      }
    }

    if (conflictFields.length > 0) {
      const conflict: ConflictRecord = {
        id: crypto.randomUUID(),
        entity_type: remote.entity_type,
        entity_id: remote.entity_id,
        conflict_fields: conflictFields,
        local: local.fields,
        remote: remote.fields,
        created_at: new Date().toISOString(),
      };
      if (this.onConflict) {
        this.onConflict(conflict);
      }
    }

    const updatedLocal: Entity = {
      ...remote,
      fields: mergedFields,
    };
    await this.storage.saveEntity(updatedLocal);
    await this.storage.saveShadow(remote);
  }

  private async handleConflict(op: SyncOp, remote: Entity, conflictFields: string[]): Promise<void> {
    const local = await this.storage.getEntity(op.entity_type, op.entity_id);
    if (!local) return;

    const conflict: ConflictRecord = {
      id: crypto.randomUUID(),
      entity_type: op.entity_type,
      entity_id: op.entity_id,
      conflict_fields: conflictFields,
      local: local.fields,
      remote: remote.fields,
      created_at: new Date().toISOString(),
    };

    if (this.onConflict) {
      this.onConflict(conflict);
    }

    // Shadow moves to remote acknowledged version
    await this.storage.saveShadow(remote);
  }

  /**
   * Snapshot recovery when cursor expires.
   */
  public async recoverWithSnapshot(): Promise<void> {
    const snapshot = await this.client.snapshot();
    for (const remote of snapshot.entities) {
      await this.applyRemoteEntity(remote);
    }
    await this.setCursor(snapshot.cursor);
  }
}
