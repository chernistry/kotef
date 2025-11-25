# Prompt Adaptation Template

Instruction for AI: adapt the provided prompt to the specific project while preserving its structure and logic.

---

## Task
Adapt the prompt for project {{PROJECT_NAME}} with surgical edits:
- KEEP the complete structure, formatting, and length.
- REPLACE only technology/domain references.
- ADAPT code examples to the target stack.
- DO NOT TRIM content — prefer 1:1 replacements.

## Project Context
- Project: {{PROJECT_NAME}}
- Description: {{PROJECT_DESCRIPTION_CONTENT}}
- Stack: {{TECH_STACK}}
- Domain: {{DOMAIN}}

## Specific Replacements
### 1) Stack & Technologies
{{TECH_REPLACEMENTS}}
Example:
```
Node.js 20 LTS → Python 3.12+
TypeScript → Python with type hints
LangGraph.js → LangGraph (Python)
Zod → Pydantic
Jest → pytest
```

### 2) Domain & Business Logic
{{DOMAIN_REPLACEMENTS}}
Example:
```
travel workflows → document workflows
brands/domains → collections/sources
scraping/search → retrieval
```

### 3) Architectural Patterns
{{ARCHITECTURE_REPLACEMENTS}}
Example:
```
Crawlee (PlaywrightCrawler) → remove (not used)
Temporal/Step Functions → Prefect flows
Vectara → Qdrant
```

### 4) Paths & Project Structure
{{PATH_REPLACEMENTS}}
Example:
```
/Users/sasha/.../navan/ → /Users/sasha/.../meulex/
src/services/ → app/services/
```

### 5) Quality & Standards
{{QUALITY_REPLACEMENTS}}
Example:
```
strict TypeScript → strict type hints
TSDoc → Google‑style docstrings
ESLint → ruff/black
```

### 6) Testing & CI/CD
{{TESTING_REPLACEMENTS}}
Example:
```
Jest/Supertest → pytest/unittest
Testing Library → pytest fixtures
```

### 7) Observability & Monitoring
{{OBSERVABILITY_REPLACEMENTS}}
Example:
```
Langfuse → OpenTelemetry
Bottleneck → tenacity + asyncio patterns
```

## Adaptation Rules
1) Structure
   - Keep all sections and headings
   - Keep formatting (lists, tables, code blocks)
   - Keep internal logic and order

2) Replacements
   - Replace technology references 1:1
   - Adapt code to target language/framework
   - Update imports and paths
   - Adapt metrics and budgets to the project

3) Content
   - DO NOT remove sections; adapt examples
   - DO NOT oversimplify logic
   - Add short comments if clarification is needed

4) Code Examples
   - Rewrite to target language
   - Preserve logic and patterns
   - Idiomatic style; add type hints when applicable

5) Domain Concepts
   - Replace domain terms consistently
   - Update examples to the target domain
   - Preserve level of detail

## Source Prompt to Adapt
```markdown
{{SOURCE_PROMPT}}
```

## Additional Context
{{ADDITIONAL_CONTEXT}}

---

## Output
Return the fully adapted prompt with:
- All replacements applied consistently
- Adapted code examples
- Updated paths and imports
- Preserved structure and formatting
- Short comments where clarifications were needed

Begin adaptation now.
