# Deep Research

The deep research module (`src/tools/deep_research.ts`) allows the agent to perform multi-step, self-correcting web research.

## How it Works

1.  **Initial Search**: The agent performs a web search using the provided query (or an optimized version).
2.  **Summarization**: Top results are fetched and summarized by an LLM.
3.  **Quality Evaluation**: The research attempt is scored on:
    *   **Relevance**: How well it answers the goal.
    *   **Coverage**: How comprehensive the information is.
    *   **Confidence**: How trustworthy the sources are.
4.  **Refinement Loop**:
    *   If quality scores are below thresholds (`relevance < 0.7` or `coverage < 0.6`), the agent generates a **refined query** and tries again.
    *   This repeats up to `maxAttempts` (default: 3).
5.  **Selection**: The attempt with the highest quality score is returned.

## Configuration

*   `maxAttempts`: Maximum number of search iterations (default: 3).
*   `maxWebRequestsPerRun`: Global limit on web requests (not yet fully enforced per-module, but tracked).

## Error Handling

*   **Web Search Failures**: If the search provider (Tavily) fails or returns errors, the module catches the error, logs a warning, and treats it as 0 results. This prevents the entire agent from crashing.
*   **Parsing Errors**: LLM JSON parsing errors are caught and result in empty findings or null scores, triggering safe fallbacks.
*   **Graceful Degradation**: If all attempts fail or produce no results, an empty array is returned.

## Logging

Structured logs are emitted to the `deep-research` logger, including:
*   `attempt`: Current attempt number.
*   `quality`: `{ relevance, coverage, confidence, shouldRetry }`.
*   `chosenQuery`: The query that produced the final results.
