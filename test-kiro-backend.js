#!/usr/bin/env node

/**
 * Simple test for KiroConversationBackend
 * 
 * Usage: node test-kiro-backend.js
 */

import { KiroConversationBackend } from './dist/src/core/kiro_conversation_backend.js';

async function test() {
    console.log('🧪 Testing KiroConversationBackend...\n');

    const backend = new KiroConversationBackend();
    const config = {
        kiroCliPath: '/Users/sasha/.local/bin/kiro-cli',
        kiroModel: 'claude-sonnet-4.5'
    };

    try {
        // Test 1: Single turn
        console.log('Test 1: Single-turn conversation');
        console.log('Sending: "Say hello in JSON format"');

        const result1 = await backend.callChat(
            config,
            [{ role: 'user', content: 'Say hello in JSON format: {"greeting": "hello"}' }],
            {}
        );

        console.log('Response:', result1.messages[result1.messages.length - 1].content);
        console.log('✅ Single-turn test passed\n');

        // Test 2: Multi-turn
        console.log('Test 2: Multi-turn conversation');
        console.log('Sending follow-up: "Now say goodbye"');

        const result2 = await backend.callChat(
            config,
            result1.messages.concat([{ role: 'user', content: 'Now say goodbye in JSON format: {"farewell": "goodbye"}' }]),
            {}
        );

        console.log('Response:', result2.messages[result2.messages.length - 1].content);
        console.log('✅ Multi-turn test passed\n');

        // Cleanup
        await backend.cleanup();
        console.log('✅ All tests passed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.cause) {
            console.error('Cause:', error.cause);
        }
        process.exit(1);
    }
}

test().catch(console.error);
