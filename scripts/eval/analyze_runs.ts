
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { aggregateMetrics, saveAggregatedMetrics } from '../../src/agent/utils/flow_metrics.js';

async function main() {
    const rootDir = process.cwd();
    const sddDir = path.join(rootDir, '.sdd');
    const runsDir = path.join(sddDir, 'runs');
    const cacheDir = path.join(sddDir, 'cache');

    console.log(`Aggregating metrics from ${runsDir}...`);

    try {
        await fs.mkdir(cacheDir, { recursive: true });

        const metrics = await aggregateMetrics(runsDir);

        console.log('Aggregated Metrics:');
        console.log(JSON.stringify(metrics, null, 2));

        await saveAggregatedMetrics(cacheDir, metrics);
        console.log(`Saved to ${path.join(cacheDir, 'flow_metrics.json')}`);

    } catch (e) {
        console.error('Failed to aggregate metrics:', e);
        process.exit(1);
    }
}

main();
