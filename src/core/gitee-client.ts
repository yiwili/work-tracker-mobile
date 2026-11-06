/**
 * Work Tracker Mobile - Gitee Direct Client
 * Used for direct mobile Gitee Enterprise integration (project lookup, direct publish, reconciliation).
 * Keeps credentials exclusively on the device (secure storage).
 */

export interface GiteeProgram {
  id: number;
  name: string;
  ident: string;
  status: number;
}

export interface GiteeIssueType {
  id: number;
  name: string;
  category: string;
}

export interface GiteeEnterpriseIssue {
  id: number;
  ident: string;
  title: string;
  description: string;
  state: string;
  program_id: number;
  program_name?: string;
  issue_url?: string;
}

export class GiteeClient {
  private baseUrl = 'https://api.gitee.com/enterprises';

  constructor(private token: string) {}

  private async request<T>(path: string, options: { method?: string; body?: unknown; query?: Record<string, any> } = {}): Promise<T> {
    const { method = 'GET', body, query = {} } = options;
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('access_token', this.token);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) {
        url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gitee API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }

  public async listPrograms(enterpriseId: number): Promise<GiteeProgram[]> {
    const data = await this.request<any>(`/${enterpriseId}/programs`, {
      query: { status: '0,1', sort: 'name', direction: 'asc', per_page: 100 },
    });
    const rows = Array.isArray(data) ? data : data?.data || [];
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      ident: r.ident || '',
      status: r.status ?? 0,
    }));
  }

  public async listIssueTypes(enterpriseId: number, programId: number): Promise<GiteeIssueType[]> {
    const data = await this.request<any>(`/${enterpriseId}/programs/${programId}/issue_types`, {
      query: { scope: 'all' },
    });
    const rows = Array.isArray(data) ? data : data?.data || [];
    return rows.map((r: any) => ({
      id: r.id,
      name: r.title || r.name,
      category: r.category || '',
    }));
  }

  public async createIssue(
    enterpriseId: number,
    params: {
      program_id: number;
      title: string;
      description: string;
      duration?: number;
      issue_type_id?: number;
      plan_started_at?: string;
    }
  ): Promise<{ id: number; issue_url?: string }> {
    return this.request<{ id: number; issue_url?: string }>(`/${enterpriseId}/issues`, {
      method: 'POST',
      body: params,
    });
  }

  public async updateIssue(
    enterpriseId: number,
    issueId: number,
    params: {
      description?: string;
      duration?: number;
    }
  ): Promise<{ id: number; issue_url?: string }> {
    return this.request<{ id: number; issue_url?: string }>(`/${enterpriseId}/issues/${issueId}`, {
      method: 'PUT',
      body: params,
    });
  }

  public async getIssueDetail(enterpriseId: number, issueId: number): Promise<GiteeEnterpriseIssue> {
    return this.request<GiteeEnterpriseIssue>(`/${enterpriseId}/issues/${issueId}`);
  }
}
