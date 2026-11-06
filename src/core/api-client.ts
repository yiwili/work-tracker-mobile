/**
 * Work Tracker Mobile - API Client
 * Clean HTTP client for Work Tracker Server (REST / OpenAPI).
 * Platform-independent: works in React Native, Web, Node, and translates 1:1 to native Retrofit / URLSession.
 */

import {
  Account,
  Device,
  Entity,
  EntityType,
  PublishBatch,
  PublishItemInput,
  PublishRequest,
  PublishState,
  PullResponse,
  PushRequest,
  PushResponse,
  Session,
  SnapshotResponse,
} from './types.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ClientConfig {
  baseUrl: string;
  token?: string;
  onTokenExpired?: () => void;
}

export class WorkTrackerClient {
  private baseUrl: string;
  private token?: string;
  private onTokenExpired?: () => void;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
    this.onTokenExpired = config.onTokenExpired;
  }

  public setToken(token?: string) {
    this.token = token;
  }

  public getToken(): string | undefined {
    return this.token;
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      query?: Record<string, string | number | boolean | undefined>;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, query } = options;
    let url = `${this.baseUrl}/api/v1${path}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    let data: any;
    const text = await response.text();
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: { code: 'invalid_json', message: text } };
    }

    if (!response.ok) {
      if (response.status === 401 && this.onTokenExpired) {
        this.onTokenExpired();
      }
      const err = data?.error || {
        code: 'http_' + response.status,
        message: response.statusText || 'Request failed',
      };
      throw new ApiError(response.status, err.code, err.message, err.details);
    }

    return data as T;
  }

  // --- Auth ---

  public async login(
    email: string,
    password: string,
    device: { name: string; platform: 'desktop' | 'mobile' | 'web'; client_version?: string }
  ): Promise<Session> {
    const session = await this.request<Session>('/auth/login', {
      method: 'POST',
      body: { email, password, device },
    });
    this.token = session.token;
    return session;
  }

  public async logout(): Promise<void> {
    await this.request<void>('/auth/logout', { method: 'POST' });
    this.token = undefined;
  }

  public async me(): Promise<{ account: Account; device: Device }> {
    return this.request<{ account: Account; device: Device }>('/me');
  }

  public async listDevices(): Promise<Device[]> {
    const res = await this.request<{ devices: Device[] }>('/devices');
    return res.devices;
  }

  public async revokeDevice(deviceId: string): Promise<void> {
    await this.request<void>(`/devices/${deviceId}`, { method: 'DELETE' });
  }

  // --- Sync ---

  public async push(req: PushRequest): Promise<PushResponse> {
    return this.request<PushResponse>('/sync/push', {
      method: 'POST',
      body: req,
    });
  }

  public async pull(cursor: number, limit = 500): Promise<PullResponse> {
    return this.request<PullResponse>('/sync/pull', {
      query: { cursor, limit },
    });
  }

  public async snapshot(): Promise<SnapshotResponse> {
    return this.request<SnapshotResponse>('/sync/snapshot');
  }

  public async listEntities(
    entityType: EntityType,
    options?: { from?: string; to?: string; include_deleted?: boolean }
  ): Promise<{ entities: Entity[]; cursor: number }> {
    return this.request<{ entities: Entity[]; cursor: number }>(`/entities/${entityType}`, {
      query: options,
    });
  }

  public async getEntity(entityType: EntityType, entityId: string): Promise<Entity> {
    return this.request<Entity>(`/entities/${entityType}/${encodeURIComponent(entityId)}`);
  }

  // --- Publish ---

  public async registerPublishBatch(
    idempotencyKey: string,
    executor: 'device' | 'cloud',
    items: PublishItemInput[]
  ): Promise<PublishBatch> {
    return this.request<PublishBatch>('/publish/batches', {
      method: 'POST',
      body: {
        idempotency_key: idempotencyKey,
        executor,
        items,
      },
    });
  }

  public async getPublishBatch(batchId: string): Promise<PublishBatch> {
    return this.request<PublishBatch>(`/publish/batches/${batchId}`);
  }

  public async listPublishRequests(options?: {
    state?: PublishState;
    work_item_id?: string;
    limit?: number;
  }): Promise<PublishRequest[]> {
    const res = await this.request<{ requests: PublishRequest[] }>('/publish/requests', {
      query: options,
    });
    return res.requests;
  }

  public async claimPublishRequest(requestId: string): Promise<PublishRequest> {
    return this.request<PublishRequest>(`/publish/requests/${requestId}/claim`, {
      method: 'POST',
    });
  }

  public async reportPublishResult(
    requestId: string,
    outcome: 'succeeded' | 'failed' | 'uncertain',
    result?: { remote_id?: string; url?: string; error?: string }
  ): Promise<PublishRequest> {
    return this.request<PublishRequest>(`/publish/requests/${requestId}/result`, {
      method: 'POST',
      body: {
        outcome,
        ...result,
      },
    });
  }

  public async reconcilePublishRequest(
    requestId: string,
    found: boolean,
    result?: { remote_id?: string; url?: string }
  ): Promise<PublishRequest> {
    return this.request<PublishRequest>(`/publish/requests/${requestId}/reconcile`, {
      method: 'POST',
      body: {
        found,
        ...result,
      },
    });
  }

  public async cancelPublishRequest(requestId: string): Promise<PublishRequest> {
    return this.request<PublishRequest>(`/publish/requests/${requestId}/cancel`, {
      method: 'POST',
    });
  }

  // --- Health ---

  public async health(): Promise<{ status: string; database: string; version?: string }> {
    return this.request<{ status: string; database: string; version?: string }>('/health');
  }
}
