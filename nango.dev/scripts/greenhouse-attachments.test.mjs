import './ts-resolve.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { default: listCandidates } = await import('../greenhouse-basic/actions/list-candidates.ts');
const { default: getCandidateResume } = await import('../greenhouse-basic/actions/get-candidate-resume.ts');

// Minimal stand-in for the Nango action context: routes proxy calls by endpoint.
function fakeNango(routes) {
    return {
        proxy: async (config) => {
            const route = Object.entries(routes).find(([suffix]) => config.endpoint.endsWith(suffix));
            if (!route) {
                throw new Error(`Unexpected proxy call: ${config.endpoint}`);
            }
            return { data: route[1] };
        },
    };
}

const RESUME = {
    filename: 'John_Locke_Resume.pdf',
    type: 'resume',
    created_at: '2020-09-27T18:45:27.137Z',
};

// Greenhouse serves attachments as S3 signed URLs regenerated per request, so the
// same file arrives with different signatures at the candidate and application levels.
const resumeAt = (signature) => ({ ...RESUME, url: `https://prod-heroku.s3.amazonaws.com/resume.pdf?sig=${signature}` });

function candidate({ attachments = [], applications = [] }) {
    return {
        id: 57683957,
        first_name: 'John',
        last_name: 'Locke',
        title: null,
        company: null,
        updated_at: '2020-09-27T18:45:27.137Z',
        email_addresses: [],
        attachments,
        applications,
    };
}

test('hasResume is true when the resume lives only on an application', async () => {
    const nango = fakeNango({
        '/v1/candidates': [
            candidate({
                attachments: [],
                applications: [{ id: 1, status: 'active', applied_at: null, jobs: null, current_stage: null, attachments: [resumeAt('a')] }],
            }),
        ],
    });

    const result = await listCandidates.exec(nango, {});

    assert.equal(result.candidates[0].hasResume, true);
});

test('get-candidate-resume finds a resume attached only to an application', async () => {
    const nango = fakeNango({
        '/v1/candidates/57683957': candidate({
            attachments: [],
            applications: [{ attachments: [resumeAt('a')] }],
        }),
    });

    const result = await getCandidateResume.exec(nango, { candidateId: 57683957 });

    assert.equal(result.attachments.length, 1);
    assert.equal(result.attachments[0].filename, 'John_Locke_Resume.pdf');
});

test('the same file at both levels is returned once despite differing signed URLs', async () => {
    const nango = fakeNango({
        '/v1/candidates/57683957': candidate({
            attachments: [resumeAt('candidate-level')],
            applications: [{ attachments: [resumeAt('application-level')] }],
        }),
    });

    const result = await getCandidateResume.exec(nango, { candidateId: 57683957 });

    assert.equal(result.attachments.length, 1);
});

test('distinct resumes from separate applications are both returned', async () => {
    const nango = fakeNango({
        '/v1/candidates/57683957': candidate({
            attachments: [],
            applications: [
                { attachments: [{ ...resumeAt('a'), filename: 'Resume_2024.pdf' }] },
                { attachments: [{ ...resumeAt('b'), filename: 'Resume_2025.pdf' }] },
            ],
        }),
    });

    const result = await getCandidateResume.exec(nango, { candidateId: 57683957 });

    assert.deepEqual(
        result.attachments.map((attachment) => attachment.filename),
        ['Resume_2024.pdf', 'Resume_2025.pdf']
    );
});

test('non-resume attachments are excluded unless includeAllAttachments is set', async () => {
    const coverLetter = { filename: 'Cover.pdf', type: 'cover_letter', created_at: '2020-09-27T18:45:27.137Z', url: 'https://example.com/cover.pdf' };
    const payload = candidate({ attachments: [resumeAt('a')], applications: [{ attachments: [coverLetter] }] });

    const resumesOnly = await getCandidateResume.exec(fakeNango({ '/v1/candidates/57683957': payload }), { candidateId: 57683957 });
    assert.deepEqual(
        resumesOnly.attachments.map((attachment) => attachment.type),
        ['resume']
    );

    const everything = await getCandidateResume.exec(fakeNango({ '/v1/candidates/57683957': payload }), {
        candidateId: 57683957,
        includeAllAttachments: true,
    });
    assert.deepEqual(
        everything.attachments.map((attachment) => attachment.type),
        ['resume', 'cover_letter']
    );
});

test('candidates with no attachments anywhere report hasResume false', async () => {
    const nango = fakeNango({
        '/v1/candidates': [candidate({ attachments: null, applications: [{ id: 1, status: 'active', applied_at: null, jobs: null, current_stage: null, attachments: null }] })],
    });

    const result = await listCandidates.exec(nango, {});

    assert.equal(result.candidates[0].hasResume, false);
});
