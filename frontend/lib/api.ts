import { getSupabaseBrowserClient } from "./supabase";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Thin fetch wrapper that attaches the current Supabase session's access token as a
 * Bearer token, so the FastAPI backend can independently verify the caller's identity. */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api${path}`, { ...options, headers });
  } catch {
    // fetch() throws a plain TypeError (not an ApiError) for network-level failures
    // (DNS, CORS, offline, etc). Normalize it so every caller's `instanceof ApiError`
    // check still fires instead of silently swallowing the failure.
    throw new ApiError("Couldn't reach the server. Please check your connection and try again.", 0);
  }
  if (!res.ok) {
    const body = await res.text();
    let message = body || res.statusText;
    try {
      const payload: unknown = JSON.parse(body);
      if (payload && typeof payload === "object" && "detail" in payload) {
        const detail = payload.detail;
        if (typeof detail === "string") message = detail;
      }
    } catch {
      // Non-JSON error bodies are preserved verbatim.
    }
    throw new ApiError(message, res.status);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return (await res.text()) as unknown as T;
}
