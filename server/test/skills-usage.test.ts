import { describe, it, expect } from 'vitest';
import { computeUsage, isContentChange, type UsageInputs } from '../src/modules/skills/helpers.js';

/** The stat definitions are product decisions; pin them here, hermetically. */

const INPUTS: UsageInputs = {
  runs: [
    { runId: 'r1', applied: [{ id: 'sk', tokens: 400 }, { id: 'other', tokens: 50 }] },
    { runId: 'r2', applied: [{ id: 'sk', tokens: 200 }] },
    { runId: 'r3', applied: [] },
    { runId: 'r4', applied: [{ id: 'other', tokens: 10 }] },
  ],
  findings: [
    { runId: 'r1', total: 4, accepted: 2, dismissed: 1 },
    { runId: 'r2', total: 2, accepted: 1, dismissed: 0 },
    // A run that did NOT apply the skill must not count toward its accept rate.
    { runId: 'r4', total: 9, accepted: 0, dismissed: 9 },
  ],
  links: [
    { skillId: 'sk', agentId: 'a1', agentName: 'Alpha', enabled: true, order: 0 },
    { skillId: 'sk', agentId: 'a2', agentName: 'Beta', enabled: false, order: 2 },
    { skillId: 'other', agentId: 'a1', agentName: 'Alpha', enabled: true, order: 1 },
  ],
};

describe('computeUsage', () => {
  const u = computeUsage('sk', INPUTS);

  it('counts only agents whose link is enabled, but lists every link', () => {
    expect(u.agents).toBe(1);
    expect(u.agent_links.map((l) => l.agent_name)).toEqual(['Alpha', 'Beta']);
  });

  it('pull_freq = applying runs ÷ all completed runs', () => {
    expect(u.runs).toBe(2);
    expect(u.pull_freq).toBe(0.5);
  });

  it('accept_rate = accepted ÷ (accepted + dismissed), only over applying runs', () => {
    // r1 + r2: 3 accepted, 1 dismissed → 0.75. r4's 9 dismissals are excluded.
    expect(u.accept_rate).toBe(0.75);
    expect(u.findings).toEqual({ total: 6, accepted: 3, dismissed: 1 });
  });

  it('avg_tokens is the mean over applying runs', () => {
    expect(u.avg_tokens).toBe(300);
  });

  it('reports null, not 0, when there is nothing to divide by', () => {
    const empty = computeUsage('sk', { runs: [], findings: [], links: [] });
    expect(empty).toMatchObject({
      agents: 0,
      runs: 0,
      pull_freq: null,
      accept_rate: null,
      avg_tokens: null,
    });
  });

  it('leaves accept_rate null when findings exist but none are triaged yet', () => {
    const untriaged = computeUsage('sk', {
      ...INPUTS,
      findings: [{ runId: 'r1', total: 5, accepted: 0, dismissed: 0 }],
    });
    expect(untriaged.accept_rate).toBeNull();
  });
});

describe('isContentChange', () => {
  const row = { name: 'n', description: 'd', type: 'rubric' as const, body: 'b' };

  it('is true for a change to any of name, description, type or body', () => {
    expect(isContentChange(row, { name: 'n2' })).toBe(true);
    expect(isContentChange(row, { description: 'd2' })).toBe(true);
    expect(isContentChange(row, { type: 'security' })).toBe(true);
    expect(isContentChange(row, { body: 'b2' })).toBe(true);
  });

  it('is false for an enable toggle or for unchanged values', () => {
    expect(isContentChange(row, { enabled: false })).toBe(false);
    expect(isContentChange(row, { name: 'n', body: 'b' })).toBe(false);
    expect(isContentChange(row, {})).toBe(false);
  });
});
