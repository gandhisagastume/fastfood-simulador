export const BASE = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:8080';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  health: () => req<{ ok: string }>('/api/health'),
  companies: () => req<{ company: string; count: number }[]>('/api/companies'),
  products: (p: Record<string, string | number> = {}) => {
    const q = new URLSearchParams(Object.entries(p).map(([k, v]) => [k, String(v)]));
    return req<any[]>(`/api/products?${q}`);
  },
  completeness: () => req<Record<string, { valid: number; total: number; missing: number }>>('/api/quality/completeness'),
  descriptive: (variable = 'calories') => req<Record<string, any>>(`/api/stats/descriptive?variable=${variable}`),
  simulate: (body: any) => req<{ run_id: number; results: any[] }>('/api/simulate', { method: 'POST', body: JSON.stringify(body) }),
  run: (id: number) => req<{ run_id: number; results: any[] }>(`/api/runs/${id}`),
  dictionary: () => req<{ entries: any[]; notes: string[] }>('/api/dictionary'),
  report: () => req<any>('/api/quality/report'),
  fit: (variable: string, company = '') => req<any>(`/api/fit?variable=${variable}${company ? `&company=${encodeURIComponent(company)}` : ''}`),
  validate: (variable: string) => req<any[]>(`/api/validate?variable=${variable}`),
  recommend: () => req<any>('/api/recommend'),
  dashboard: (run_id?: number) => req<any>(run_id ? `/api/dashboard/summary?run_id=${run_id}` : '/api/dashboard/summary')
};
