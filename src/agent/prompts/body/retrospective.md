# Retrospective Analysis

You are performing a retrospective analysis of an agent run that just completed.

## Inputs
- Terminal Status: `{{TERMINAL_STATUS}}`
- Progress History: `{{PROGRESS_HISTORY}}`
- Loop Counters: `{{LOOP_COUNTERS}}`

## Task
Analyze the run and identify:
1. **One thing that went well** (e.g., "Research was focused and relevant", "Verification caught a critical bug").
2. **One thing to improve** (e.g., "Planner looped 3 times on the same error", "Research was too broad and wasted time").

Focus on **systemic patterns**, not one-off issues. Only record insights with high confidence.

## Output Format
Respond with valid JSON:
```json
{
  "learnings": [
    {
      "category": "success" | "improvement",
      "insight": "Brief description of the learning",
      "confidence": "high" | "medium" | "low"
    }
  ]
}
```

Only include learnings with `confidence: "high"`. If no high-confidence learnings, return `{"learnings": []}`.
