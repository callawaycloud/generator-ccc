import { spawnSync } from "node:child_process";

/** Parsed shape of `sf org display --verbose --json` stdout. */
interface SfOrgDisplayResponse {
  status?: number;
  result?: {
    sfdxAuthUrl?: string;
  };
}

/**
 * Returns the Sfdx Auth URL from the default authorized org, if available.
 * Does not throw when the CLI is missing or no org is authorized.
 */
export function getSfdxAuthUrl(): Promise<string | null> {
  const result = spawnSync("sf", ["org", "display", "--verbose", "--json"], {
    encoding: "utf-8",
  });

  if (result.error || result.status !== 0) {
    return Promise.resolve(null);
  }

  try {
    const parsed: unknown = JSON.parse(result.stdout ?? "{}");
    if (typeof parsed !== "object" || parsed === null) {
      return Promise.resolve(null);
    }

    const response = parsed as SfOrgDisplayResponse;
    if (response.status !== 0) {
      return Promise.resolve(null);
    }

    const authUrl = response.result?.sfdxAuthUrl;
    if (typeof authUrl === "string" && authUrl.length > 0) {
      return Promise.resolve(authUrl);
    }

    return Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}
