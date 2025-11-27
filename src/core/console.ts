import chalk from 'chalk';

/**
 * Pretty console output for user-facing messages
 * Separate from structured JSON logs
 */

const icons = {
    info: 'ℹ',
    success: '✓',
    warning: '⚠',
    error: '✗',
    search: '🔍',
    research: '📚',
    code: '⚙',
    test: '🧪',
    git: '📝',
    ticket: '🎫',
    time: '⏱',
    rocket: '🚀',
    brain: '🧠',
    tools: '🔧'
};

export const console_log = {
    header: (text: string) => {
        console.log('\n' + chalk.bold.cyan('═'.repeat(80)));
        console.log(chalk.bold.cyan(`  ${text}`));
        console.log(chalk.bold.cyan('═'.repeat(80)) + '\n');
    },

    section: (text: string) => {
        console.log('\n' + chalk.bold.white(`▸ ${text}`));
    },

    info: (text: string, detail?: string) => {
        console.log(chalk.blue(`  ${icons.info}  ${text}`) + (detail ? chalk.gray(` ${detail}`) : ''));
    },

    success: (text: string, detail?: string) => {
        console.log(chalk.green(`  ${icons.success}  ${text}`) + (detail ? chalk.gray(` ${detail}`) : ''));
    },

    warning: (text: string, detail?: string) => {
        console.log(chalk.yellow(`  ${icons.warning}  ${text}`) + (detail ? chalk.gray(` ${detail}`) : ''));
    },

    error: (text: string, detail?: string) => {
        console.log(chalk.red(`  ${icons.error}  ${text}`) + (detail ? chalk.gray(` ${detail}`) : ''));
    },

    research: (text: string, detail?: string) => {
        console.log(chalk.magenta(`  ${icons.research}  ${text}`) + (detail ? chalk.gray(` ${detail}`) : ''));
    },

    code: (text: string, detail?: string) => {
        console.log(chalk.cyan(`  ${icons.code}  ${text}`) + (detail ? chalk.gray(` ${detail}`) : ''));
    },

    test: (text: string, detail?: string) => {
        console.log(chalk.yellow(`  ${icons.test}  ${text}`) + (detail ? chalk.gray(` ${detail}`) : ''));
    },

    git: (text: string, detail?: string) => {
        console.log(chalk.green(`  ${icons.git}  ${text}`) + (detail ? chalk.gray(` ${detail}`) : ''));
    },

    ticket: (text: string, detail?: string) => {
        console.log(chalk.blue(`  ${icons.ticket}  ${text}`) + (detail ? chalk.gray(` ${detail}`) : ''));
    },

    dim: (text: string) => {
        console.log(chalk.gray(`     ${text}`));
    },

    progress: (current: number, total: number, text: string) => {
        const percent = Math.round((current / total) * 100);
        const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
        console.log(chalk.cyan(`  ${icons.time}  [${bar}] ${percent}% ${text}`));
    },

    divider: () => {
        console.log(chalk.gray('  ' + '─'.repeat(76)));
    }
};
