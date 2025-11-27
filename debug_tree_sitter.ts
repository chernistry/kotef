import * as ParserNamespace from 'web-tree-sitter';
import * as ParserNamespace from 'web-tree-sitter';
import { createRequire } from 'module';

console.log('Namespace:', ParserNamespace);


const require = createRequire(import.meta.url);
try {
    const Module = require('web-tree-sitter');
    console.log('Module keys:', Object.keys(Module));
    if (Module.init) console.log('Module.init exists');
    if (Module.Parser && Module.Parser.init) console.log('Module.Parser.init exists');

    // Check namespace
    if (ParserNamespace.init) console.log('Namespace.init exists');
    if (ParserNamespace.Parser && ParserNamespace.Parser.init) console.log('Namespace.Parser.init exists');
} catch (e) {
    console.log('Require failed:', e.message);
}
