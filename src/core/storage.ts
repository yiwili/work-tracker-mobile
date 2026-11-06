/**
 * Work Tracker Mobile - Storage Interface & In-Memory Adapter
 * Abstracts persistent storage so the engine can run with SQLite, MMKV,
 * AsyncStorage in React Native or Room / SQLite in Native Android.
 */

import { Entity, EntityType } from './types.js';

export interface StorageAdapter {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  deleteMeta(key: string): Promise<void>;

  getEntity(entityType: EntityType, entityId: string): Promise<Entity | null>;
  listEntities(entityType: EntityType): Promise<Entity[]>;
  saveEntity(entity: Entity): Promise<void>;
  deleteEntity(entityType: EntityType, entityId: string): Promise<void>;

  getShadow(entityType: EntityType, entityId: string): Promise<Entity | null>;
  saveShadow(entity: Entity): Promise<void>;

  getDirtyEntities(): Promise<Array<{ entity_type: EntityType; entity_id: string }>>;
  markDirty(entityType: EntityType, entityId: string): Promise<void>;
  clearDirty(entityType: EntityType, entityId: string): Promise<void>;

  clearAll(): Promise<void>;
}

export class MemoryStorageAdapter implements StorageAdapter {
  private meta = new Map<string, string>();
  private entities = new Map<string, Entity>();
  private shadows = new Map<string, Entity>();
  private dirty = new Set<string>();

  private key(type: EntityType, id: string): string {
    return `${type}:${id}`;
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  async deleteMeta(key: string): Promise<void> {
    this.meta.delete(key);
  }

  async getEntity(entityType: EntityType, entityId: string): Promise<Entity | null> {
    return this.entities.get(this.key(entityType, entityId)) ?? null;
  }

  async listEntities(entityType: EntityType): Promise<Entity[]> {
    const list: Entity[] = [];
    for (const [k, v] of this.entities.entries()) {
      if (k.startsWith(`${entityType}:`)) {
        list.push(v);
      }
    }
    return list;
  }

  async saveEntity(entity: Entity): Promise<void> {
    this.entities.set(this.key(entity.entity_type, entity.entity_id), entity);
  }

  async deleteEntity(entityType: EntityType, entityId: string): Promise<void> {
    this.entities.delete(this.key(entityType, entityId));
  }

  async getShadow(entityType: EntityType, entityId: string): Promise<Entity | null> {
    return this.shadows.get(this.key(entityType, entityId)) ?? null;
  }

  async saveShadow(entity: Entity): Promise<void> {
    this.shadows.set(this.key(entity.entity_type, entity.entity_id), entity);
  }

  async getDirtyEntities(): Promise<Array<{ entity_type: EntityType; entity_id: string }>> {
    return Array.from(this.dirty).map((k) => {
      const idx = k.indexOf(':');
      return {
        entity_type: k.substring(0, idx) as EntityType,
        entity_id: k.substring(idx + 1),
      };
    });
  }

  async markDirty(entityType: EntityType, entityId: string): Promise<void> {
    this.dirty.add(this.key(entityType, entityId));
  }

  async clearDirty(entityType: EntityType, entityId: string): Promise<void> {
    this.dirty.delete(this.key(entityType, entityId));
  }

  async clearAll(): Promise<void> {
    this.meta.clear();
    this.entities.clear();
    this.shadows.clear();
    this.dirty.clear();
  }
}
