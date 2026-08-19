const ZERO_COST_DISCOVERY_SOURCES = [
  {
    id: 'github-good-first-issues',
    url: 'https://github.com/search?q=label%3A%22good+first+issue%22+reward+OR+bounty&type=issues',
    method: 'public_web_discovery'
  },
  {
    id: 'github-bounty-issues',
    url: 'https://github.com/search?q=bounty+reward+label%3Aissue&type=issues',
    method: 'public_web_discovery'
  },
  {
    id: 'hn-who-is-hiring',
    url: 'https://news.ycombinator.com/item?id=whoishiring',
    method: 'public_web_discovery'
  },
  {
    id: 'public-rss-self-distribution',
    url: '/feed.xml',
    method: 'seo_distribution'
  }
];