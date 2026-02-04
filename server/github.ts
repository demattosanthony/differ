type GitHubClientOptions = {
  token?: string | null;
};

type GitHubRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type GitHubResponseError = Error & { status?: number };

const API_BASE = "https://api.github.com";
const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "differ",
};

const createError = (message: string, status?: number) => {
  const error = new Error(message) as GitHubResponseError;
  error.status = status;
  return error;
};

const parseLinkHeader = (value: string | null) => {
  if (!value) return {} as Record<string, string>;
  const entries = value.split(",").map((part) => part.trim());
  const links: Record<string, string> = {};
  for (const entry of entries) {
    const match = entry.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (!match) continue;
    links[match[2]] = match[1];
  }
  return links;
};

const buildUrl = (path: string) => (path.startsWith("http") ? path : `${API_BASE}${path}`);

export const createGitHubClient = ({ token }: GitHubClientOptions) => {
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const request = async (path: string, options: GitHubRequestOptions = {}) => {
    const headers = new Headers({
      ...DEFAULT_HEADERS,
      ...authHeader,
      ...options.headers,
    });
    const response = await fetch(buildUrl(path), {
      method: options.method ?? "GET",
      headers,
      body: options.body,
    });
    if (!response.ok) {
      let detail = "";
      try {
        const text = await response.text();
        if (text) {
          try {
            const json = JSON.parse(text) as { message?: string; errors?: Array<{ message?: string }> };
            if (json.message) detail = json.message;
            if (json.errors?.length) {
              const errorDetails = json.errors
                .map((error) => error.message)
                .filter(Boolean)
                .join(", ");
              if (errorDetails) detail = detail ? `${detail} (${errorDetails})` : errorDetails;
            }
          } catch {
            detail = text;
          }
        }
      } catch {
        detail = "";
      }
      const message = detail
        ? `GitHub request failed (${response.status}): ${detail}`
        : `GitHub request failed (${response.status})`;
      throw createError(message, response.status);
    }
    return response;
  };

  const requestJson = async <T,>(path: string, options: GitHubRequestOptions = {}) => {
    const response = await request(path, options);
    return (await response.json()) as T;
  };

  const requestText = async (path: string, options: GitHubRequestOptions = {}) => {
    const response = await request(path, options);
    return await response.text();
  };

  const requestAllPages = async <T,>(path: string, options: GitHubRequestOptions = {}) => {
    const results: T[] = [];
    let nextUrl: string | undefined = buildUrl(path);
    while (nextUrl) {
      const response = await request(nextUrl, options);
      const page = (await response.json()) as T[];
      results.push(...page);
      const links = parseLinkHeader(response.headers.get("link"));
      nextUrl = links.next;
    }
    return results;
  };

  return { request, requestJson, requestText, requestAllPages };
};
