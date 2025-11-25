#!/usr/bin/env tsx
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runEvalScenario, generateEvalReport, type EvalScenario } from './framework.js';

/**
 * Load all scenario definitions from JSON files
 */
async function loadScenarios(): Promise<EvalScenario[]> {
    const scenariosDir = path.join(import.meta.dirname || __dirname, 'scenarios');
    const files = await fs.readdir(scenariosDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const scenarios: EvalScenario[] = [];
    for (const file of jsonFiles) {
        const content = await fs.readFile(path.join(scenariosDir, file), 'utf-8');
        scenarios.push(JSON.parse(content));
    }

    return scenarios;
}

/**
 * Main CLI entry point
 */
async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    const scenarioId = args.find(a => a.startsWith('--scenario='))?.split('=')[1];
    const verbose = args.includes('--verbose') || args.includes('-v');
    const dryRun = args.includes('--dry-run');

    console.log('🧪 Kotef Evaluation Harness\n');

    // Load scenarios
    const allScenarios = await loadScenarios();
    const scenarios = scenarioId
        ? allScenarios.filter(s => s.id === scenarioId)
        : allScenarios;

    if (scenarios.length === 0) {
        console.error(`❌ No scenarios found${scenarioId ? ` matching: ${scenarioId}` : ''}`);
        process.exit(1);
    }

    console.log(`Running ${scenarios.length} scenario(s)...\n`);

    // Run scenarios
    const results = [];
    for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        console.log(`[${i + 1}/${scenarios.length}] ${scenario.id}`);
        console.log(`    ${scenario.description}`);

        const result = await runEvalScenario(scenario, { verbose, dryRun });
        results.push(result);

        const icon = result.success ? '✅' : '❌';
        console.log(`    ${icon} ${result.success ? 'PASS' : 'FAIL'}`);

        if (!result.success && result.error) {
            console.log(`    💥 Error: ${result.error}`);
        }
    }

    // Generate report
    const report = generateEvalReport(results);
    console.log(report);

    // Save results to file
    const resultsDir = path.join(import.meta.dirname || __dirname, 'results');
    await fs.mkdir(resultsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile = path.join(resultsDir, `eval-${timestamp}.json`);
    await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Results saved to: ${resultsFile}\n`);

    // Exit with appropriate code
    const failed = results.filter(r => !r.success).length;
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
