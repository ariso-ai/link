import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { parse, validate, buildClientSchema, GraphQLError } from 'graphql';

const here = dirname(fileURLToPath(import.meta.url));
const linearDir = join(here, '..', 'linear');
const fragmentsDir = join(linearDir, 'helpers');
const actionsDir = join(linearDir, 'actions');
const schemaPath = join(linearDir, 'schema.introspection.json');

const fragmentExportRegex = /export\s+const\s+(\w+Fragment)\s*=\s*`([\s\S]*?)`/g;
const graphqlTemplateRegex = /`([^`]*?\b(?:query|mutation)\s+\w+[\s\S]*?)`/g;
const interpolationRegex = /\$\{(\w+)\}/g;

async function loadSchema() {
    const introspection = JSON.parse(await readFile(schemaPath, 'utf8'));
    return buildClientSchema(introspection);
}

async function loadFragments() {
    const fragments = {};
    const files = await readdir(fragmentsDir);
    for (const file of files) {
        if (!file.endsWith('.ts')) continue;
        const contents = await readFile(join(fragmentsDir, file), 'utf8');
        for (const match of contents.matchAll(fragmentExportRegex)) {
            const [, name, body] = match;
            if (name && body !== undefined) {
                fragments[name] = body;
            }
        }
    }
    return fragments;
}

function resolveInterpolations(template, fragments) {
    let unresolved = null;
    const resolved = template.replace(interpolationRegex, (_, name) => {
        const value = fragments[name];
        if (value === undefined) {
            unresolved = name;
            return `__UNRESOLVED_${name}__`;
        }
        return value;
    });
    return unresolved ? null : resolved;
}

async function validateActionFile(filePath, fragments, schema) {
    const contents = await readFile(filePath, 'utf8');
    const failures = [];
    const rel = relative(linearDir, filePath);

    let templateCount = 0;
    for (const match of contents.matchAll(graphqlTemplateRegex)) {
        templateCount++;
        const [, raw] = match;
        if (!raw) continue;

        const resolved = resolveInterpolations(raw, fragments);
        if (resolved === null) {
            failures.push({
                file: rel,
                error: `Unresolved fragment interpolation in template #${templateCount}`,
            });
            continue;
        }

        let document;
        try {
            document = parse(resolved);
        } catch (err) {
            const msg = err instanceof GraphQLError ? err.message : String(err);
            failures.push({
                file: rel,
                error: `GraphQL parse error in template #${templateCount}: ${msg}`,
            });
            continue;
        }

        const validationErrors = validate(schema, document);
        for (const err of validationErrors) {
            failures.push({
                file: rel,
                error: `GraphQL schema validation in template #${templateCount}: ${err.message}`,
            });
        }
    }

    if (templateCount === 0) {
        failures.push({
            file: rel,
            error: 'No GraphQL templates found — expected at least one query or mutation',
        });
    }

    return failures;
}

async function main() {
    const schema = await loadSchema();
    const fragments = await loadFragments();
    const fragmentNames = Object.keys(fragments);
    if (fragmentNames.length === 0) {
        console.error('No GraphQL fragments found in linear/helpers');
        process.exit(1);
    }
    console.log(`Loaded Linear schema + ${fragmentNames.length} fragment(s)`);

    const actionFiles = (await readdir(actionsDir))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => join(actionsDir, f));

    const allFailures = [];
    for (const file of actionFiles) {
        const failures = await validateActionFile(file, fragments, schema);
        allFailures.push(...failures);
    }

    if (allFailures.length) {
        console.error(`\nValidation failed with ${allFailures.length} issue(s):`);
        for (const f of allFailures) {
            console.error(`  ${f.file}: ${f.error}`);
        }
        process.exit(1);
    }

    console.log(`All ${actionFiles.length} Linear action(s) validate against Linear's schema.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
