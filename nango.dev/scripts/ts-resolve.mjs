import { registerHooks } from 'node:module';

// Nango sources import siblings as `./foo.js` (TypeScript node16 resolution) while
// the files on disk are `./foo.ts`. Map those imports back to the .ts file so Node's
// built-in type stripping can load actions directly in tests.
registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (err) {
            if (err?.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && specifier.endsWith('.js')) {
                return nextResolve(specifier.slice(0, -3) + '.ts', context);
            }
            throw err;
        }
    },
});
