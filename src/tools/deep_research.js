import { webSearch } from './web_search.js';
import { fetchPage } from './fetch_page.js';
import { callChat } from '../core/llm.js';
export async function deepResearch(cfg, query) {
    // 1. Search
    const searchResults = await webSearch(cfg, query, { maxResults: 5 });
    if (searchResults.length === 0) {
        return [];
    }
    // 2. Fetch top 3 pages
    const topResults = searchResults.slice(0, 3);
    const pageContents = [];
    for (const result of topResults) {
        try {
            const page = await fetchPage(cfg, result.url);
            pageContents.push(`Source: ${result.url}\nTitle: ${result.title}\nContent:\n${page.content}\n---`);
        }
        catch (e) {
            console.warn(`Failed to fetch ${result.url} for deep research:`, e);
            // Fallback to snippet if fetch fails
            pageContents.push(`Source: ${result.url}\nTitle: ${result.title}\nContent (Snippet only):\n${result.snippet}\n---`);
        }
    }
    // 3. Summarize with LLM
    const context = pageContents.join('\n\n');
    const prompt = `
You are a research assistant. Answer the user's query based ONLY on the provided sources.
Extract key findings and back them up with citations.

Query: ${query}

Sources:
${context}

Output Format: JSON array of objects with "statement" (string) and "citations" (array of {url, title}).
Do not output markdown code blocks, just the raw JSON string.
`;
    const messages = [
        { role: 'system', content: 'You are a helpful research assistant. Output valid JSON only.' },
        { role: 'user', content: prompt }
    ];
    try {
        const response = await callChat(cfg, messages, {
            model: cfg.modelFast, // Use fast model for summarization
            temperature: 0,
            maxTokens: 2000,
        });
        const content = response.messages[response.messages.length - 1].content;
        if (!content)
            return [];
        // Clean up potential markdown blocks
        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const findings = JSON.parse(jsonStr);
        return findings;
    }
    catch (e) {
        console.error('Deep research summarization failed:', e);
        return [];
    }
}
