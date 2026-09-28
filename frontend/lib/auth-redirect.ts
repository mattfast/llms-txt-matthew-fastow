export function getAuthRedirectUrl(path: string): string {
  if (typeof window === "undefined") {
    throw new Error("Auth redirect URLs can only be generated in the browser.");
  }

  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const appUrl = configuredOrigin ? new URL(configuredOrigin) : new URL(window.location.origin);
  if (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost") {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS outside localhost.");
  }

  return new URL(path.replace(/^\/+/, ""), `${appUrl.origin}/`).toString();
}
