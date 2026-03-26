import { strict as assert } from 'node:assert';
import type { AutomationRule, GameState } from '@/types/game';
import { createInitialState } from '@/utils/state';
import { planAutomationOpsFromGameState } from '@/utils/automationPlanner';

const createMoveRule = (overrides: Partial<AutomationRule> = {}): AutomationRule => ({
  id: 'move-rule',
  enabled: true,
  triggerType: 'slot_filled',
  sourceRowFilter: [],
  targetRowFilter: [],
  sourceSlotFilter: [],
  targetSlotFilter: [],
  cooldownMs: 0,
  lastTriggeredAt: null,
  ...overrides,
});

const createBaseState = (): GameState => {
  const initialState = createInitialState();
  return {
    ...initialState,
    machines: [{ id: 'machine-a', level: 1, slotIndex: 0, disabled: false }],
  };
};

export const runAutomationPlannerMoveTargetSlotTests = () => {
  {
    const state = createBaseState();
    state.automation.rules = [createMoveRule()];

    const [op] = planAutomationOpsFromGameState(state, Date.now());
    assert.ok(op, 'expected planner to emit one op');
    assert.equal(op.kind, 'MOVE', 'expected empty targetSlotFilter to allow move planning');
    if (op.kind === 'MOVE') {
      assert.equal(op.targetSlot, 1, 'expected planner to pick the first valid empty slot');
    }
  }

  {
    const state = createBaseState();
    state.automation.rules = [
      createMoveRule({
        targetSlotFilter: [5],
      }),
    ];

    const [op] = planAutomationOpsFromGameState(state, Date.now());
    assert.ok(op, 'expected planner to emit one op');
    assert.equal(op.kind, 'MOVE', 'expected explicit targetSlotFilter to keep move available');
    if (op.kind === 'MOVE') {
      assert.equal(op.targetSlot, 5, 'expected planner to obey explicit targetSlotFilter');
    }
  }
};
