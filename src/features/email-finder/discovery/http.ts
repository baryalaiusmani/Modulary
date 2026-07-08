// Gemeinsame, defensive HTTP-Helfer fuer die Discovery-Quellen.
// Jeder Fehler wird abgefangen und liefert einen leeren Wert, damit eine
// einzelne fehlschlagende Quelle niemals den gesamten Suchlauf abbricht.

const USER_AGENT = "Mozilla/5.0 (compatible; ModularyEmailFinder/0.1; +local)";

export async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5" },
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T = unknown>(url: string, headers: Record<string, string> = {}, timeoutMs = 12_000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "application/json", ...headers },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBuffer(url: string, maxBytes = 8 * 1024 * 1024, timeoutMs = 15_000): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": USER_AGENT } });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > maxBytes ? buffer.subarray(0, maxBytes) : buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
