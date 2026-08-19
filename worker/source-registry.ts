export type SourceCategory =
  | "tech_news"
  | "developer_tools"
  | "startup"
  | "security"
  | "ai"
  | "market"
  | "rss"
  | "jobs"
  | "research"
  | "open_source"
  | "other";

export type SourceRegistryItem = {
  id: string;
  name: string;
  url: string;
  category: SourceCategory;
  enabled: boolean;
  scrape_interval_minutes: number;
  priority: number;
  notes?: string;
};

export const SOURCE_REGISTRY: SourceRegistryItem[] = [
  {
    id: "hacker-news",
    name: "Hacker News",
    url: "https://news.ycombinator.com/",
    category: "tech_news",
    enabled: true,
    scrape_interval_minutes: 30,
    priority: 100,
    notes: "High-signal tech, AI, security, devtools, startup discussion source."
  },
  {
    id: "github-trending",
    name: "GitHub Trending",
    url: "https://github.com/trending",
    category: "developer_tools",
    enabled: true,
    scrape_interval_minutes: 60,
    priority: 95,
    notes: "Open-source momentum and developer-tool discovery source."
  },
  {
    id: "github-security-advisories",
    name: "GitHub Security Advisories",
    url: "https://github.com/advisories",
    category: "security",
    enabled: true,
    scrape_interval_minutes: 60,
    priority: 95,
    notes: "Security and supply-chain signal source."
  },
  {
    id: "product-hunt",
    name: "Product Hunt",
    url: "https://www.producthunt.com/",
    category: "startup",
    enabled: true,
    scrape_interval_minutes: 60,
    priority: 85,
    notes: "New product and SaaS launch signal source."
  },
  {
    id: "indie-hackers",
    name: "Indie Hackers",
    url: "https://www.indiehackers.com/",
    category: "startup",
    enabled: true,
    scrape_interval_minutes: 120,
    priority: 80,
    notes: "Founder, SaaS, indie business, and monetization source."
  },
  {
    id: "lobsters",
    name: "Lobsters",
    url: "https://lobste.rs/",
    category: "developer_tools",
    enabled: true,
    scrape_interval_minutes: 90,
    priority: 75,
    notes: "Developer-focused technical discussion source."
  },
  {
    id: "openai-news",
    name: "OpenAI News",
    url: "https://openai.com/news/",
    category: "ai",
    enabled: true,
    scrape_interval_minutes: 240,
    priority: 85,
    notes: "AI model, product, and platform announcements."
  },
  {
    id: "anthropic-news",
    name: "Anthropic News",
    url: "https://www.anthropic.com/news",
    category: "ai",
    enabled: true,
    scrape_interval_minutes: 240,
    priority: 85,
    notes: "Claude/model ecosystem announcements and AI trend source."
  },
  {
    id: "google-ai-blog",
    name: "Google AI Blog",
    url: "https://ai.googleblog.com/",
    category: "ai",
    enabled: true,
    scrape_interval_minutes: 240,
    priority: 75,
    notes: "AI research and product trend source."
  },
  {
    id: "aws-news-blog",
    name: "AWS News Blog",
    url: "https://aws.amazon.com/blogs/aws/",
    category: "market",
    enabled: true,
    scrape_interval_minutes: 240,
    priority: 70,
    notes: "Cloud, AI infrastructure, and enterprise platform signals."
  },
  {
    id: "cloudflare-blog",
    name: "Cloudflare Blog",
    url: "https://blog.cloudflare.com/",
    category: "developer_tools",
    enabled: true,
    scrape_interval_minutes: 240,
    priority: 70,
    notes: "Edge, infrastructure, security, and developer platform signals."
  },
  {
    id: "cisa-known-exploited",
    name: "CISA Known Exploited Vulnerabilities",
    url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    category: "security",
    enabled: true,
    scrape_interval_minutes: 240,
    priority: 90,
    notes: "Security urgency and vulnerability intelligence source."
  },
  {
    id: "yc-companies",
    name: "Y Combinator Companies",
    url: "https://www.ycombinator.com/companies",
    category: "startup",
    enabled: true,
    scrape_interval_minutes: 360,
    priority: 65,
    notes: "Startup trend and company category source."
  },
  {
    id: "remoteok",
    name: "Remote OK",
    url: "https://remoteok.com/",
    category: "jobs",
    enabled: true,
    scrape_interval_minutes: 240,
    priority: 55,
    notes: "Hiring demand and market skill demand source."
  },
  {
    id: "arxiv-ai",
    name: "arXiv AI",
    url: "https://arxiv.org/list/cs.AI/recent",
    category: "research",
    enabled: true,
    scrape_interval_minutes: 360,
    priority: 65,
    notes: "AI research trend source."
  },
  {
    id: "arxiv-ml",
    name: "arXiv Machine Learning",
    url: "https://arxiv.org/list/cs.LG/recent",
    category: "research",
    enabled: true,
    scrape_interval_minutes: 360,
    priority: 65,
    notes: "ML research trend source."
  }
];

export function getEnabledSources() {
  return SOURCE_REGISTRY
    .filter((source) => source.enabled)
    .sort((a, b) => b.priority - a.priority);
}