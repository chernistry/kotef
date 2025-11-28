import { describe, it, expect } from 'vitest';

describe('XML Ticket Parsing', () => {
    it('parses valid XML tickets', () => {
        const content = `
Here are the tickets:

<ticket filename="01-task.md" title="Task 1">
# Task 1
Content here
</ticket>

<ticket filename="02-task.md" title="Task 2">
# Task 2
More content
- List item
</ticket>
    `;

        const tickets: { filename: string; title: string; content: string }[] = [];
        const ticketRegex = /<ticket\s+filename="([^"]+)"\s+title="([^"]+)">([\s\S]*?)<\/ticket>/g;

        let match;
        while ((match = ticketRegex.exec(content)) !== null) {
            tickets.push({
                filename: match[1],
                title: match[2],
                content: match[3].trim()
            });
        }

        expect(tickets).toHaveLength(2);
        expect(tickets[0].filename).toBe('01-task.md');
        expect(tickets[0].title).toBe('Task 1');
        expect(tickets[0].content).toBe('# Task 1\nContent here');

        expect(tickets[1].filename).toBe('02-task.md');
        expect(tickets[1].content).toContain('More content');
    });

    it('handles nested tags and attributes correctly', () => {
        const content = `
<ticket filename="complex.md" title="Complex">
Content with <div class="foo">html</div> inside.
And quotes: "hello"
</ticket>
    `;

        const tickets: { filename: string; title: string; content: string }[] = [];
        const ticketRegex = /<ticket\s+filename="([^"]+)"\s+title="([^"]+)">([\s\S]*?)<\/ticket>/g;

        let match;
        while ((match = ticketRegex.exec(content)) !== null) {
            tickets.push({
                filename: match[1],
                title: match[2],
                content: match[3].trim()
            });
        }

        expect(tickets).toHaveLength(1);
        expect(tickets[0].content).toContain('<div class="foo">html</div>');
        expect(tickets[0].content).toContain('"hello"');
    });
});
