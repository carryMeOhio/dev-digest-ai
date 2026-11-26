/**
 * Fixture pull requests for the skills control experiment.
 *
 * Each one is built so a competent reviewer WITHOUT the relevant skill plausibly
 * returns "looks fine" — the code is clean, named well and does what it says —
 * while the same reviewer WITH the skill has a specific rule that fires. That
 * contrast is the whole point; a PR with an obvious bug would be caught either
 * way and would prove nothing.
 *
 * The patches are real unified diffs. `diffFromPrFiles` reconstructs a diff from
 * `pr_files.patch`, so these PRs are reviewable with no clone and no network —
 * and the grounding gate (which drops any finding not citing a real diff line)
 * works against them exactly as it does against an imported PR.
 */

export interface FixtureFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface FixturePr {
  number: number;
  title: string;
  author: string;
  branch: string;
  headSha: string;
  body: string;
  files: FixtureFile[];
  commitMessage: string;
  /** Which agent this PR is the control experiment for (documentation only). */
  forAgent: string;
}

// ---------------------------------------------------------------------------
// #701 — Test Quality. A test that covers the happy path and nothing else.
//
// `applyDiscount` has three behaviours the test never reaches: the `percent > 100`
// guard, the `quantity === 0` early return, and the rounding on a fractional
// result. The test also mocks `priceFor`, the very lookup the total depends on,
// so it would pass against a stubbed implementation.
// ---------------------------------------------------------------------------
const PR_701: FixturePr = {
  number: 701,
  title: 'Add discount calculator and tests',
  author: 'dev.tanaka',
  branch: 'feat/discount-calculator',
  headSha: 'c7f1a93b22de',
  forAgent: 'Test Quality Reviewer',
  commitMessage: 'Add applyDiscount with unit tests',
  body: 'Adds the discount calculator used by checkout, with unit tests covering the calculation.',
  files: [
    {
      path: 'src/billing/discount.ts',
      additions: 24,
      deletions: 0,
      patch: `@@ -0,0 +1,24 @@
+import { priceFor } from './catalog.js';
+
+export interface DiscountInput {
+  sku: string;
+  quantity: number;
+  percent: number;
+}
+
+/** Total for a line item after a percentage discount, in whole cents. */
+export function applyDiscount(input: DiscountInput): number {
+  if (input.percent > 100) {
+    throw new RangeError('percent must be <= 100');
+  }
+
+  if (input.quantity === 0) {
+    return 0;
+  }
+
+  const unit = priceFor(input.sku);
+  const gross = unit * input.quantity;
+  const discounted = gross * (1 - input.percent / 100);
+
+  return Math.round(discounted);
+}`,
    },
    {
      path: 'src/billing/discount.test.ts',
      additions: 18,
      deletions: 0,
      patch: `@@ -0,0 +1,18 @@
+import { describe, it, expect, vi } from 'vitest';
+import { applyDiscount } from './discount.js';
+
+vi.mock('./catalog.js', () => ({
+  priceFor: vi.fn(() => 1000),
+}));
+
+describe('applyDiscount', () => {
+  it('applies a percentage discount to the line total', () => {
+    const total = applyDiscount({ sku: 'SKU-1', quantity: 2, percent: 10 });
+    expect(total).toBe(1800);
+  });
+
+  it('returns the gross total when the discount is zero', () => {
+    const total = applyDiscount({ sku: 'SKU-1', quantity: 1, percent: 0 });
+    expect(total).toBe(1000);
+  });
+});`,
    },
  ],
};

// ---------------------------------------------------------------------------
// #702 — API Contract. A route signature change presented as a cleanup.
//
// The request field `user_id` is renamed to `account_id`, the `status` response
// field is dropped in favour of `state`, and `limit` gains a max. Every existing
// caller breaks; the diff ships no compatibility window, and the vendored client
// copy of the contract is not touched.
// ---------------------------------------------------------------------------
const PR_702: FixturePr = {
  number: 702,
  title: 'Tighten the payments list endpoint schema',
  author: 'dev.okafor',
  branch: 'chore/payments-schema-cleanup',
  headSha: 'b4e80c1d7a35',
  forAgent: 'API Contract Reviewer',
  commitMessage: 'Clean up payments list request/response naming',
  body: 'Naming cleanup on the payments list endpoint so the schema matches our internal vocabulary. No behaviour change.',
  files: [
    {
      path: 'src/modules/payments/routes.ts',
      additions: 9,
      deletions: 9,
      patch: `@@ -8,20 +8,20 @@ import { PaymentSummary } from '@devdigest/shared';
 const ListPaymentsQuery = z.object({
-  user_id: z.string().uuid(),
-  limit: z.coerce.number().int().positive().optional(),
+  account_id: z.string().uuid(),
+  limit: z.coerce.number().int().positive().max(50).optional(),
   cursor: z.string().optional(),
 });
 
 export default async function paymentsRoutes(appBase: FastifyInstance) {
   const app = appBase.withTypeProvider<ZodTypeProvider>();
   const service = new PaymentsService(app.container);
 
   app.get('/payments', { schema: { querystring: ListPaymentsQuery } }, async (req) => {
     const { workspaceId } = await getContext(app.container, req);
-    const rows = await service.list(workspaceId, req.query.user_id, req.query.limit ?? 100);
+    const rows = await service.list(workspaceId, req.query.account_id, req.query.limit ?? 50);
     return rows.map((r) => ({
       id: r.id,
       amount_cents: r.amountCents,
-      status: r.status,
+      state: r.status,
       created_at: r.createdAt.toISOString(),
     }));
   });
 }`,
    },
    {
      path: 'src/modules/payments/service.ts',
      additions: 3,
      deletions: 3,
      patch: `@@ -14,9 +14,9 @@ export class PaymentsService {
   async list(
     workspaceId: string,
-    userId: string,
+    accountId: string,
     limit: number,
   ): Promise<PaymentRow[]> {
-    return this.repo.listForUser(workspaceId, userId, limit);
+    return this.repo.listForAccount(workspaceId, accountId, limit);
   }
 }`,
    },
  ],
};

export const FIXTURE_PRS: FixturePr[] = [PR_701, PR_702];
