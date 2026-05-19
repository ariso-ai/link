import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getIntrospectionQuery } from 'graphql';

const apiKey = process.env.LINEAR_API_KEY;
if (!apiKey) {
    console.error('LINEAR_API_KEY required to refresh the schema fixture.');
    process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'linear', 'schema.introspection.json');

const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
});

if (!res.ok) {
    console.error(`Linear HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
}

const body = await res.json();
if (body.errors?.length) {
    console.error(`GraphQL errors: ${body.errors.map((e) => e.message).join('; ')}`);
    process.exit(1);
}

await writeFile(outPath, JSON.stringify(body.data) + '\n', 'utf8');
console.log(`Wrote ${outPath}`);
