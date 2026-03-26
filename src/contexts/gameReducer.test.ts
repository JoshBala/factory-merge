import { strict as assert } from 'node:assert';
import type { AutomationRule } from '@/types/game';
import { createInitialState } from '@/utils/state';
import { gameReducer } from '@/contexts/GameContext';

const createRule = (id: string, lastTriggeredAt: number | null): AutomationRule => ({
  id,
  enabled: true,
  triggerType: 'interval',
  sourceRowFilter: [],
  targetRowFilter: [],
  sourceSlotFilter: [],
  targetSlotFilter: [],
  cooldownMs: 0,
  lastTriggeredAt,
});

export const runGameReducerAutomationRuleIdTest = () => {
  const initialState = createInitialState();
  const beforeRunAt = 1_000;
  const untouchedRunAt = 2_000;

  const state = {
    ...initialState,
    machines: [
      { id: 'machine-source', level: 1, slotIndex: 0, disabled: false },
      { id: 'machine-target', level: 1, slotIndex: 1, disabled: false },
    ],
    automation: {
      ...initialState.automation,
      rules: [createRule('rule-a', beforeRunAt), createRule('rule-b', untouchedRunAt)],
    },
  };

  const nextState = gameReducer(state, {
    type: 'RUN_AUTOMATION_OPS',
    ops: [
      {
        type: 'merge_machines',
        sourceId: 'machine-source',
        targetId: 'machine-target',
        ruleId: 'rule-a',
      },
    ],
  });

  const updatedRule = nextState.automation.rules.find((rule) => rule.id === 'rule-a');
  const untouchedRule = nextState.automation.rules.find((rule) => rule.id === 'rule-b');

  assert.ok(updatedRule, 'expected updated rule to exist');
  assert.ok(untouchedRule, 'expected untouched rule to exist');
  assert.notEqual(
    updatedRule.lastTriggeredAt,
    beforeRunAt,
    'expected successful op to update matching rule lastTriggeredAt'
  );
  assert.equal(
    untouchedRule.lastTriggeredAt,
    untouchedRunAt,
    'expected non-matching rule lastTriggeredAt to remain unchanged'
  );
};
