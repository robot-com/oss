/**
 * Test script to verify drizzle-kit API works
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Try to use require for drizzle-kit since it needs CommonJS
try {
    const { pushSchema } = require('drizzle-kit/api');
    console.log('✅ drizzle-kit/api loaded successfully via require()');
    console.log('pushSchema type:', typeof pushSchema);
} catch (e) {
    console.log('❌ require() failed:', e.message);

    // Try dynamic import
    try {
        const mod = await import('drizzle-kit/api');
        console.log('✅ drizzle-kit/api loaded via import()');
        console.log('exports:', Object.keys(mod));
    } catch (e2) {
        console.log('❌ import() also failed:', e2.message);
    }
}
