/**
 * Work Tracker Mobile - Protocol and Entity Types
 * Directly matches OpenAPI spec (api/openapi.yaml) and protocol specification (docs/protocol.md).
 * Designed for portability across React Native and future Native Kotlin/Swift implementations.
 */

export type EntityType =
  | 'work_item'
  | 'daily_report'
  | 'setting'
  | 'project_mapping'
  | 'gitee_link';

export type TaskStatus =
  | 'requested'
  | 'attempted'
  | 'changed'
  | 'verified'
  | 'delivered';

export interface WorkItemFields {
  date: string; // YYYY-MM-DD
  title: string;
  details?: string;
  project?: string;
  category?: string;
  status?: TaskStatus;
  origin?: string;
  suggested_minutes?: number | null;
  confirmed_minutes?: number;
  time_locked?: boolean;
  time_source?: string;
  time_reason?: string;
  started_at?: string | null;
  ended_at?: string | null;
  deleted?: boolean;
  [key: string]: unknown;
}

export interface DailyReportFields {
  target_minutes: number;
  confirmed: boolean;
  confirmed_at?: string | null;
  deleted?: boolean;
  [key: string]: unknown;
}

export interface SettingFields {
  value: Record<string, unknown>;
  deleted?: boolean;
  [key: string]: unknown;
}

export interface ProjectMappingFields {
  match_mode: 'prefix' | 'contains' | 'exact';
  pattern: string;
  target_type: 'enterprise' | 'repository';
  enterprise_id?: number;
  program_id?: number;
  issue_type_id?: number | null;
  repository?: string;
  deleted?: boolean;
  [key: string]: unknown;
}

export interface GiteeLinkFields {
  work_item_id: string;
  target_scope: string;
  remote_id: string;
  url?: string;
  published_version?: number;
  published_at?: string;
  deleted?: boolean;
  [key: string]: unknown;
}

export interface Entity<T = Record<string, unknown>> {
  entity_type: EntityType;
  entity_id: string;
  version: number;
  field_versions: Record<string, number>;
  fields: T;
  updated_at: string;
  updated_by_device?: string | null;
}

export interface SyncOp {
  op_id: string;
  entity_type: EntityType;
  entity_id: string;
  base_version: number;
  fields: Record<string, unknown>;
}

export interface SyncOpResult {
  op_id: string;
  status: 'applied' | 'conflict' | 'rejected';
  entity?: Entity;
  conflict_fields?: string[];
  error?: {
    code: string;
    message: string;
  };
}

export interface PushRequest {
  ops: SyncOp[];
}

export interface PushResponse {
  results: SyncOpResult[];
  cursor: number;
}

export interface PullResponse {
  changes: Entity[];
  cursor: number;
  has_more: boolean;
}

export interface SnapshotResponse {
  entities: Entity[];
  cursor: number;
}

export type PublishState =
  | 'registered'
  | 'sending'
  | 'succeeded'
  | 'failed'
  | 'uncertain'
  | 'expired'
  | 'cancelled';

export interface PublishRequest {
  id: string;
  batch_id?: string | null;
  work_item_id: string;
  work_item_version: number;
  target_scope: string;
  operation: 'create' | 'update';
  operation_adjusted: boolean;
  remote_id: string;
  url: string;
  target: Record<string, unknown>;
  payload: Record<string, unknown>;
  config_versions: Record<string, number>;
  executor: 'device' | 'cloud';
  executor_device_id?: string | null;
  state: PublishState;
  error: string;
  note: string;
  published_version?: number | null;
  expires_at?: string | null;
  claimed_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishBatch {
  id: string;
  idempotency_key: string;
  executor: 'device' | 'cloud';
  created_by_device?: string | null;
  created_at: string;
  requests: PublishRequest[];
}

export interface PublishItemInput {
  work_item_id: string;
  work_item_version: number;
  target_scope: string;
  operation: 'create' | 'update';
  remote_id?: string;
  target?: Record<string, unknown>;
  payload: Record<string, unknown>;
  config_versions?: Record<string, number>;
}

export interface Account {
  id: string;
  email: string;
  display_name: string;
  unified_publish_enabled: boolean;
  created_at: string;
}

export interface Device {
  id: string;
  name: string;
  platform: 'desktop' | 'mobile' | 'web';
  client_version: string;
  created_at: string;
  last_seen_at?: string | null;
  last_sync_at?: string | null;
  revoked_at?: string | null;
  current: boolean;
}

export interface Session {
  token: string;
  account: Account;
  device: Device;
}
