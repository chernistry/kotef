import { KotefConfig } from '../core/config.js';
import * as cheerio from 'cheerio';

export interface FetchedPage {
    url: string;
    status: number;
    content: string;
    contentType?: string;
}

const pageCache = new Map<string, FetchedPage>();

const BLOCKED_HOSTS = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    'internal',
    'local',
];

function isUrlAllowed(urlStr: string): boolean {
    try {
        const url = new URL(urlStr);
        if (BLOCKED_HOSTS.includes(url.hostname)) return false;
        if (url.hostname.startsWith('192.168.') || url.hostname.startsWith('10.')) return false;
        return true;
    } catch {
        return false;
    }
}

export async function fetchPage(
    cfg: KotefConfig,
    url: string,
): Promise<FetchedPage> {
    if (pageCache.has(url)) {
        return pageCache.get(url)!;
    }

    if (cfg.mockMode) {
        return {
            url,
            status: 200,
            content: 'Mock page content for ' + url,
            contentType: 'text/html'
        };
    }

    if (!isUrlAllowed(url)) {
        throw new Error(`URL blocked by policy: ${url}`);
    }

    const response = await fetch(url, {
        headers: {
            'User-Agent': 'KotefBot/1.0 (AI Research Agent)',
        },
        signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
        throw new Error(`Unsupported content type: ${contentType}`);
    }

    const html = await response.text();

    // Strip HTML to text
    const $ = cheerio.load(html);

    // Remove scripts, styles, etc.
    $('script, style, noscript, iframe, svg').remove();

    // Replace block elements with spaces to preserve separation
    $('div, p, br, h1, h2, h3, h4, h5, h6, li').after(' ');

    let text = $('body').text();
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Truncate if too long (e.g. 50k chars)
    if (text.length > 50000) {
        text = text.substring(0, 50000) + '... (truncated)';
    }

    const result: FetchedPage = {
        url,
        status: response.status,
        content: text,
        contentType,
    };

    pageCache.set(url, result);
    return result;
}
