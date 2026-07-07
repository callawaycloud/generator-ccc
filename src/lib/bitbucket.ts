import { spawnSync } from "node:child_process";

/** Parsed Bitbucket repository coordinates from a git remote URL. */
export interface BitbucketRemote {
  workspace: string;
  repoSlug: string;
}

/** Configuration for BitbucketClient. */
export interface BitbucketClientOptions {
  workspace: string;
  repoSlug: string;
  token: string;
}

interface PipelinesConfigResponse {
  enabled?: boolean;
}

interface BitbucketVariable {
  uuid: string;
  key: string;
}

interface BitbucketPaginatedResponse<T> {
  values?: T[];
  next?: string;
}

interface PipelineRefSelector {
  type: string;
  pattern?: string;
}

interface PipelineRefTarget {
  type: string;
  ref_name?: string;
  selector?: PipelineRefSelector;
}

interface BitbucketSchedule {
  target?: PipelineRefTarget;
}

/**
 * Runs `git remote get-url origin` and parses Bitbucket SSH/HTTPS URLs.
 * Returns null when origin is missing or not a Bitbucket remote.
 */
export function parseBitbucketRemote(cwd: string): BitbucketRemote | null {
  const result = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd,
    encoding: "utf-8",
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  const remoteUrl = (result.stdout ?? "").trim();
  if (remoteUrl.length === 0) {
    return null;
  }

  const sshMatch = /^git@bitbucket\.org:([^/]+)\/(.+?)(?:\.git)?$/u.exec(remoteUrl);
  if (sshMatch) {
    return {
      workspace: sshMatch[1],
      repoSlug: sshMatch[2],
    };
  }

  const httpsMatch = /^https?:\/\/bitbucket\.org\/([^/]+)\/(.+?)(?:\.git)?$/u.exec(remoteUrl);
  if (httpsMatch) {
    return {
      workspace: httpsMatch[1],
      repoSlug: httpsMatch[2],
    };
  }

  return null;
}

/**
 * Bitbucket REST API client for repository pipeline configuration.
 */
export class BitbucketClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: BitbucketClientOptions) {
    this.baseUrl = `https://api.bitbucket.org/2.0/repositories/${options.workspace}/${options.repoSlug}`;
    this.token = options.token;
  }

  /**
   * Returns whether Bitbucket Pipelines is enabled for the repository.
   * Treats 404 as disabled.
   */
  async isPipelinesEnabled(): Promise<boolean> {
    const response = await this.request(`${this.baseUrl}/pipelines_config`);

    if (response.status === 404) {
      return false;
    }

    if (!response.ok) {
      await this.throwApiError(response);
    }

    const body = (await response.json()) as PipelinesConfigResponse;
    return body.enabled === true;
  }

  /**
   * Enables Bitbucket Pipelines for the repository.
   */
  async enablePipelines(): Promise<void> {
    const response = await this.request(`${this.baseUrl}/pipelines_config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }
  }

  /**
   * Finds a pipeline variable by key, following pagination when needed.
   */
  async getVariable(key: string): Promise<{ uuid: string } | null> {
    let url: string | null = `${this.baseUrl}/pipelines_config/variables?pagelen=100`;

    while (url !== null) {
      const response = await this.request(url);

      if (!response.ok) {
        await this.throwApiError(response);
      }

      const body = (await response.json()) as BitbucketPaginatedResponse<BitbucketVariable>;
      const values = body.values ?? [];

      for (const variable of values) {
        if (variable.key === key) {
          return { uuid: variable.uuid };
        }
      }

      url = body.next ?? null;
    }

    return null;
  }

  /**
   * Creates or updates a secured repository pipeline variable.
   */
  async setSecuredVariable(key: string, value: string): Promise<void> {
    const existing = await this.getVariable(key);

    if (existing !== null) {
      const response = await this.request(
        `${this.baseUrl}/pipelines_config/variables/${existing.uuid}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value, secured: true }),
        }
      );

      if (!response.ok) {
        await this.throwApiError(response);
      }
      return;
    }

    const response = await this.request(`${this.baseUrl}/pipelines_config/variables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, secured: true }),
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }
  }

  /**
   * Returns whether a schedule exists for the given custom pipeline on a branch.
   */
  async hasSchedule(pipelineName: string, branch: string): Promise<boolean> {
    let url: string | null = `${this.baseUrl}/pipelines_config/schedules?pagelen=100`;

    while (url !== null) {
      const response = await this.request(url);

      if (!response.ok) {
        await this.throwApiError(response);
      }

      const body = (await response.json()) as BitbucketPaginatedResponse<BitbucketSchedule>;
      const values = body.values ?? [];

      for (const schedule of values) {
        if (this.scheduleMatches(schedule, pipelineName, branch)) {
          return true;
        }
      }

      url = body.next ?? null;
    }

    return false;
  }

  /**
   * Creates a scheduled pipeline run for a custom pipeline on a branch.
   */
  async createSchedule(
    pipelineName: string,
    branch: string,
    cronPattern: string
  ): Promise<void> {
    const response = await this.request(`${this.baseUrl}/pipelines_config/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        cron_pattern: cronPattern,
        target: {
          type: "pipeline_ref_target",
          ref_type: "branch",
          ref_name: branch,
          selector: {
            type: "custom",
            pattern: pipelineName,
          },
        },
      }),
    });

    if (!response.ok) {
      await this.throwApiError(response);
    }
  }

  private async request(url: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${this.token}`);

    return fetch(url, {
      ...init,
      headers,
    });
  }

  private scheduleMatches(
    schedule: BitbucketSchedule,
    pipelineName: string,
    branch: string
  ): boolean {
    const target = schedule.target;
    if (target === undefined) {
      return false;
    }

    if (target.type !== "pipeline_ref_target") {
      return false;
    }

    if (target.ref_name !== branch) {
      return false;
    }

    const selector = target.selector;
    if (selector === undefined) {
      return false;
    }

    return selector.type === "custom" && selector.pattern === pipelineName;
  }

  private async throwApiError(response: Response): Promise<never> {
    const bodyText = await response.text();
    throw new Error(`Bitbucket API error ${response.status}: ${bodyText}`);
  }
}
