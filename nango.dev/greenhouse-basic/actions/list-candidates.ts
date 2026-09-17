import { createAction } from 'nango';
import * as z from 'zod';
import { hasResume, type GreenhouseAttachment } from '../helpers/attachments.js';

const listCandidatesInputSchema = z.object({
    jobId: z.number().optional().describe('Only return candidates who have applied to this job'),
    email: z.string().optional().describe('Only return candidates with this email address'),
    updatedAfter: z.string().optional().describe('Only return candidates updated after this ISO-8601 timestamp (e.g. "2025-01-15T00:00:00Z")'),
    perPage: z.number().optional().describe('Results per page (default 50, max 500)'),
    page: z.number().optional().describe('Page number, 1-based (default 1)'),
});

const candidateApplicationSchema = z.object({
    id: z.number(),
    jobId: z.number().nullable(),
    jobName: z.string().nullable(),
    status: z.string(),
    currentStage: z.string().nullable(),
    appliedAt: z.string().nullable(),
});

const candidateSchema = z.object({
    id: z.number(),
    name: z.string(),
    title: z.string().nullable(),
    company: z.string().nullable(),
    emails: z.array(z.string()),
    applications: z.array(candidateApplicationSchema),
    hasResume: z.boolean().describe('Whether this candidate has a resume attachment on their profile or on any of their applications. Use get-candidate-resume to fetch its download URL.'),
    updatedAt: z.string(),
});

const listCandidatesOutputSchema = z.object({
    candidates: z.array(candidateSchema),
    page: z.number(),
    perPage: z.number(),
    hasMore: z.boolean().describe('True when the page came back full, meaning another page may exist'),
});

type Candidate = z.infer<typeof candidateSchema>;

interface GreenhouseCandidate {
    id: number;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    company: string | null;
    updated_at: string;
    email_addresses: Array<{ value: string; type: string }> | null;
    attachments: GreenhouseAttachment[] | null;
    applications: Array<{
        id: number;
        status: string;
        applied_at: string | null;
        jobs: Array<{ id: number; name: string }> | null;
        current_stage: { id: number; name: string } | null;
        attachments: GreenhouseAttachment[] | null;
    }> | null;
}

const action = createAction({
    description: 'List Greenhouse candidates, optionally filtered by job, email, or update time. Returns each candidate\'s applications (needed to schedule an interview) and whether a resume is on file.',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/greenhouse/candidates', group: 'Candidates' },
    input: listCandidatesInputSchema,
    output: listCandidatesOutputSchema,

    exec: async (nango, input) => {
        const perPage = Math.min(input.perPage ?? 50, 500);
        const page = input.page ?? 1;

        const params: Record<string, string> = {
            per_page: String(perPage),
            page: String(page),
        };
        if (input.jobId !== undefined) {
            params['job_id'] = String(input.jobId);
        }
        if (input.email) {
            params['email'] = input.email;
        }
        if (input.updatedAfter) {
            params['updated_after'] = input.updatedAfter;
        }

        const response = await nango.proxy<GreenhouseCandidate[]>({
            endpoint: '/v1/candidates',
            params,
            retries: 3,
        });

        const data = response.data ?? [];
        const candidates: Candidate[] = data.map((candidate) => ({
            id: candidate.id,
            name: [candidate.first_name, candidate.last_name].filter(Boolean).join(' '),
            title: candidate.title ?? null,
            company: candidate.company ?? null,
            emails: (candidate.email_addresses ?? []).map((email) => email.value),
            applications: (candidate.applications ?? []).map((application) => ({
                id: application.id,
                jobId: application.jobs?.[0]?.id ?? null,
                jobName: application.jobs?.[0]?.name ?? null,
                status: application.status,
                currentStage: application.current_stage?.name ?? null,
                appliedAt: application.applied_at ?? null,
            })),
            hasResume: hasResume(candidate),
            updatedAt: candidate.updated_at,
        }));

        return {
            candidates,
            page,
            perPage,
            hasMore: data.length === perPage,
        };
    },
});

export default action;
