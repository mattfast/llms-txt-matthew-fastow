// Shared TypeScript types mirroring the FastAPI backend's Pydantic schemas.

export type SiteStatus = "pending" | "crawling" | "ready" | "error";

export interface CrawlActivity {
  started_at: string;
  current_url: string | null;
  recently_crawled: string[];
  recently_discovered: string[];
  coverage?: Record<string, number> | null;
}

export interface Site {
  id: string;
  root_url: string;
  domain: string;
  status: SiteStatus;
  max_pages: number;
  allow_subdomains: boolean;
  include_patterns: string[];
  exclude_patterns: string[];
  pages_discovered: number;
  pages_crawled: number;
  crawl_activity: CrawlActivity | null;
  last_crawled_at: string | null;
  created_at: string;
}

export interface CrawlJob {
  id: string;
  job_type: "initial" | "recheck";
  status: "queued" | "running" | "done" | "error";
  pages_discovered: number;
  pages_crawled: number;
  pages_changed: number;
  error_message: string | null;
  coverage: CrawlCoverage | null;
  started_at: string;
  finished_at: string | null;
}

export interface CrawlCoverage {
  summary: {
    discovered: number;
    crawled: number;
    skipped: number;
    failed: number;
    pending?: number;
    truncated: number;
    recorded: number;
  };
  pages: { url: string; status: "discovered" | "crawled" | "skipped" | "failed"; reason: string | null }[];
}

export interface LlmsTxtVersion {
  id: string;
  version_number: number;
  content: string;
  full_content: string;
  changed_paths: string[];
  diff_summary: string | null;
  created_at: string;
}

export interface LlmsTxtVersionSummary {
  id: string;
  version_number: number;
  changed_paths: string[];
  diff_summary: string | null;
  created_at: string;
}

export interface MerkleTreeNode {
  name: string;
  path: string;
  hash: string;
  is_leaf: boolean;
  changed: boolean;
  children: MerkleTreeNode[];
}

export interface MerkleTreeResponse {
  root_hash: string;
  tree: MerkleTreeNode;
  changed_paths: string[];
}

export interface LeaderboardEntry {
  user_id: string;
  email: string;
  display_name: string | null;
  sites_generated: number;
}

export interface TopicEntry {
  topic: string;
  mentions: number;
  sites: number;
}

export interface TopicTrendPoint {
  topic: string;
  day: string;
  mentions: number;
}

export interface CostSummary {
  total_usd: number;
  by_day: { day: string; cost_usd: number }[];
  by_purpose: { purpose: string; cost_usd: number }[];
}

export interface SearchMatch {
  domain: string;
  path: string;
  title: string;
  url: string;
}

export interface SearchResult {
  answer: string;
  matches: SearchMatch[];
}

export interface MeResponse {
  id: string;
  email: string;
  onboarded: boolean;
  company_id?: string;
  company_name?: string;
  role?: "admin" | "member";
}
