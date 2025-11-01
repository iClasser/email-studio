export interface InkDesEmailStudioOptions {
  baseUrl?: string;
  apiKey: string;
  domain: string;
  defaultLocale?: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

export interface RenderParams {
  experienceId: string;
  version?: number;
  locale?: string;
  data?: Record<string, unknown>;
}

export interface RenderResult {
  ok: boolean;
  status: number;
  html?: string;
  subject?: string;
  error?: {
    message: string;
    body?: unknown;
  };
}

export interface DeliverParams {
  experienceId: string;
  version?: number;
  language?: string;
  channelData: {
    toEmail: string;
    fromEmail: string;
    toEmailName?: string;
    fromEmailName?: string;
  };
  data?: Record<string, unknown>;
}

export interface DeliverResult {
  ok: boolean;
  status: number;
  message?: string;
  error?: {
    message: string;
    body?: unknown;
  };
}

export class InkDesEmailStudio {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly domain: string;
  private readonly defaultLocale: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number | undefined;

  constructor(options: InkDesEmailStudioOptions) {
    if (!options.apiKey) throw new Error("InkDesEmailStudio: 'apiKey' is required");
    if (!options.domain) throw new Error("InkDesEmailStudio: 'domain' is required");

    this.baseUrl = (options.baseUrl ?? 'https://render.inkdes.com').replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.domain = options.domain;
    this.defaultLocale = options.defaultLocale ?? 'en-US';
    this.fetchImpl = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs;
  }

  private async request<T = unknown>(path: string, body: unknown): Promise<{
    ok: boolean;
    status: number;
    data: T | null;
    error?: { message: string; body?: unknown };
  }> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (this.timeoutMs && controller) {
      timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    }

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'x-domain': this.domain,
        },
        body: JSON.stringify(body ?? {}),
        signal: controller?.signal,
      });

      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data: null,
          error: { message: `${response.status} ${response.statusText}`, body: parsed },
        };
      }

      return { ok: true, status: response.status, data: parsed as T };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false, status: 0, data: null, error: { message } };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async render(params: RenderParams): Promise<RenderResult> {
    const body = {
      experience_id: params.experienceId,
      version: params.version,
      locale: params.locale ?? this.defaultLocale,
      data: params.data ?? {},
    };

    const res = await this.request<{ ok: boolean; html?: string; subject?: string }>(
      '/v1/render',
      body
    );

    if (!res.ok) {
      return { ok: false, status: res.status, error: res.error };
    }

    const payload = res.data ?? {};
    return {
      ok: true,
      status: res.status,
      html: (payload as any).html,
      subject: (payload as any).subject,
    };
  }

  async deliver(params: DeliverParams): Promise<DeliverResult> {
    const body = {
      experience_id: params.experienceId,
      version: params.version,
      language: params.language,
      channel_data: {
        toEmail: params.channelData.toEmail,
        toEmailName: params.channelData.toEmailName,
        fromEmail: params.channelData.fromEmail,
        fromEmailName: params.channelData.fromEmailName,
      },
      data: params.data ?? {},
    };

    const res = await this.request<{ ok: boolean; message?: string }>('/v1/deliver', body);

    if (!res.ok) {
      return { ok: false, status: res.status, error: res.error };
    }

    return { ok: true, status: res.status, message: (res.data as any)?.message };
  }
}

export default InkDesEmailStudio;

