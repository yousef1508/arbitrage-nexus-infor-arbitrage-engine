import type { WeatherResult, ErrorResult } from './types';
import { mcpManager } from './mcp-client';
export type ToolResult = WeatherResult | { content: string } | ErrorResult;
interface SerpApiResponse {
  knowledge_graph?: { title?: string; description?: string; source?: { link?: string } };
  answer_box?: { answer?: string; snippet?: string; title?: string; link?: string };
  organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
  local_results?: Array<{ title?: string; address?: string; phone?: string; rating?: number }>;
  error?: string;
}
const customTools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_weather',
      description: 'Get current weather information for a location',
      parameters: {
        type: 'object',
        properties: { location: { type: 'string', description: 'The city or location name' } },
        required: ['location']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the web using Google or fetch content from a specific URL',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for Google search' },
          url: { type: 'string', description: 'Specific URL to fetch content from (alternative to search)' },
          num_results: { type: 'number', description: 'Number of search results to return (default: 5, max: 10)', default: 5 }
        },
        required: []
      }
    }
  }
];
export async function getToolDefinitions() {
  const mcpTools = await mcpManager.getToolDefinitions();
  return [...customTools, ...mcpTools];
}
const createSearchUrl = (query: string, apiKey: string, numResults: number) => {
  const url = new URL('https://serpapi.com/search');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('num', Math.min(numResults, 10).toString());
  return url.toString();
};
const formatSearchResults = (data: SerpApiResponse, query: string, numResults: number): string => {
  const results: string[] = [];
  if (data.knowledge_graph?.title && data.knowledge_graph.description) {
    results.push(`**${data.knowledge_graph.title}**\n${data.knowledge_graph.description}`);
    if (data.knowledge_graph.source?.link) results.push(`Source: ${data.knowledge_graph.source.link}`);
  }
  if (data.answer_box) {
    const { answer, snippet, title, link } = data.answer_box;
    if (answer) results.push(`**Answer**: ${answer}`);
    else if (snippet) results.push(`**${title || 'Answer'}**: ${snippet}`);
    if (link) results.push(`Source: ${link}`);
  }
  if (data.organic_results?.length) {
    results.push('\n**Search Results:**');
    data.organic_results.slice(0, numResults).forEach((result, index) => {
      if (result.title && result.link) {
        const text = [`${index + 1}. **${result.title}**`];
        if (result.snippet) text.push(`   ${result.snippet}`);
        text.push(`   Link: ${result.link}`);
        results.push(text.join('\n'));
      }
    });
  }
  return results.length ? `🔍 Search results for "${query}":\n\n${results.join('\n\n')}`
    : `No results found for "${query}". Try: https://www.google.com/search?q=${encodeURIComponent(query)}`;
};
async function performWebSearch(query: string, numResults = 5): Promise<string> {
  const apiKey = typeof process !== 'undefined' ? process.env?.SERPAPI_KEY : undefined;
  if (!apiKey) {
    return `🔍 Web search requires SerpAPI key. Get one at https://serpapi.com/\nFallback: https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }
  try {
    const response = await fetch(createSearchUrl(query, apiKey, numResults), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebBot/1.0)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`SerpAPI returned ${response.status}`);
    const data: SerpApiResponse = await response.json();
    if (data.error) throw new Error(`SerpAPI error: ${data.error}`);
    return formatSearchResults(data, query, numResults);
  } catch (error) {
    const isTimeout = error instanceof Error && error.message.includes('timeout');
    const fallback = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return `Search failed: ${isTimeout ? 'timeout' : 'API error'}. Try: ${fallback}`;
  }
}
async function fetchWebContent(url: string): Promise<string> {
  try {
    new URL(url);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebBot/1.0)' },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length ? `Content from ${url}:\n\n${text.slice(0, 4000)}` : `No content found.`;
  } catch (error) {
    throw new Error(`Failed to fetch: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_weather':
        return {
          location: String(args.location),
          temperature: Math.floor(Math.random() * 40),
          condition: 'Sunny',
          humidity: 50
        };
      case 'web_search': {
        const { query, url, num_results = 5 } = args;
        if (typeof url === 'string') {
          return { content: await fetchWebContent(url) };
        }
        if (typeof query === 'string') {
          return { content: await performWebSearch(query, num_results as number) };
        }
        return { error: 'Invalid parameters' };
      }
      default: {
        return { content: await mcpManager.executeTool(name, args) };
      }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}