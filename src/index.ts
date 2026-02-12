export type DeliveryProvider = 'gmail';
// Allow case-insensitive provider inputs at runtime, while still
// providing autocomplete for known providers via `DeliveryProvider`.
export type DeliveryProviderInput =
  | DeliveryProvider
  | Uppercase<DeliveryProvider>
  | Capitalize<DeliveryProvider>;

export interface InkDesEmailStudioOptions {
  baseUrl?: string;
  apiKey: string;
  /**
   * Domain / tenant. Required for `render()`. Optional for provider-based `deliver()`.
   */
  domain?: string;
  /**
   * Delivery provider mode (e.g. Gmail). When set, `deliver()` will send `x-provider`.
   */
  provider?: DeliveryProviderInput;
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
  /**
   * Preferred locale for delivery (e.g. "en-US").
   */
  locale?: string;
  /**
   * Legacy alias for locale. Kept for backwards compatibility.
   */
  language?: string;
  /**
   * Optional provider override for this call (e.g. "gmail").
   */
  provider?: DeliveryProviderInput;
  /**
   * Optional domain override for this call. Useful when a client is
   * constructed in provider mode but still needs domain-based delivery.
   */
  domain?: string;
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
  private readonly domain: string | undefined;
  private readonly provider: DeliveryProviderInput | undefined;
  private readonly defaultLocale: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number | undefined;

  constructor(options: InkDesEmailStudioOptions) {
    if (!options.apiKey) throw new Error("InkDesEmailStudio: 'apiKey' is required");

    this.baseUrl = (options.baseUrl ?? 'https://render.inkdes.com').replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.domain = options.domain;
    this.provider = options.provider;
    this.defaultLocale = options.defaultLocale ?? 'en-US';
    this.fetchImpl = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs;
  }

  private static normalizeProvider(provider: DeliveryProviderInput): string {
    return String(provider).trim().toLowerCase();
  }

  private static toProviderHeader(providerRaw: DeliveryProviderInput | undefined): string | undefined {
    if (!providerRaw) return undefined;
    const normalized = InkDesEmailStudio.normalizeProvider(providerRaw);
    // Currently supported provider(s). Keep this conservative until expanded.
    if (normalized === 'gmail') return 'gmail';
    return undefined;
  }

  private buildHeaders(extraHeaders?: Record<string, string | undefined>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
    };
    if (!extraHeaders) return headers;
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (value !== undefined) headers[key] = value;
    }
    return headers;
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private resolveDeliverLocale(params: DeliverParams): string {
    return params.locale ?? params.language ?? this.defaultLocale;
  }

  private resolveDeliverHeaders(params: DeliverParams): Record<string, string | undefined> {
    const providerRaw = params.provider ?? this.provider;
    const providerHeader = InkDesEmailStudio.toProviderHeader(providerRaw);
    const domainHeader = params.domain ?? this.domain;

    if (!providerHeader && !domainHeader) {
      throw new Error(
        "InkDesEmailStudio: either 'domain' or provider 'gmail' is required to call deliver()"
      );
    }

    return {
      'x-domain': domainHeader,
      'x-provider': providerHeader,
    };
  }

  private async request<T = unknown>(
    path: string,
    body: unknown,
    extraHeaders?: Record<string, string | undefined>
  ): Promise<{
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
        headers: this.buildHeaders(extraHeaders),
        body: JSON.stringify(body ?? {}),
        signal: controller?.signal,
      });

      const parsed = await this.parseResponseBody(response);

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
    if (!this.domain) {
      throw new Error("InkDesEmailStudio: 'domain' is required to call render()");
    }

    const body = {
      experience_id: params.experienceId,
      version: params.version,
      locale: params.locale ?? this.defaultLocale,
      data: params.data ?? {},
    };

    const res = await this.request<{ ok: boolean; html?: string; subject?: string }>(
      '/v1/render',
      body,
      { 'x-domain': this.domain }
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
    const locale = this.resolveDeliverLocale(params);

    const body = {
      experience_id: params.experienceId,
      version: params.version,
      locale,
      language: params.language,
      channel_data: {
        toEmail: params.channelData.toEmail,
        toEmailName: params.channelData.toEmailName,
        fromEmail: params.channelData.fromEmail,
        fromEmailName: params.channelData.fromEmailName,
      },
      data: params.data ?? {},
    };

    const res = await this.request<{ ok: boolean; message?: string }>(
      '/v1/deliver',
      body,
      this.resolveDeliverHeaders(params)
    );

    if (!res.ok) {
      return { ok: false, status: res.status, error: res.error };
    }

    return { ok: true, status: res.status, message: (res.data as any)?.message };
  }
}

export default InkDesEmailStudio;

