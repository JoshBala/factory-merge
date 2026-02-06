import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { canMerge } from '@/utils/calculations';

const DRAG_THRESHOLD_PX = 8;

type PointerPosition = { x: number; y: number };

export type DragState = {
  draggedMachineId: string | null;
  fromSlotIndex: number | null;
  pointerPosition: PointerPosition | null;
  dragOffset: PointerPosition | null;
  ghostSize: { width: number; height: number } | null;
  isPointerDown: boolean;
  isDragging: boolean;
  overSlotIndex: number | null;
  pointerId: number | null;
  startPosition: PointerPosition | null;
};

type DragContextValue = {
  dragState: DragState;
  startDrag: (
    machineId: string,
    slotIndex: number,
    event: React.PointerEvent<HTMLElement>
  ) => void;
  ignoreClick: boolean;
  clearIgnoreClick: () => void;
};

const initialDragState: DragState = {
  draggedMachineId: null,
  fromSlotIndex: null,
  pointerPosition: null,
  dragOffset: null,
  ghostSize: null,
  isPointerDown: false,
  isDragging: false,
  overSlotIndex: null,
  pointerId: null,
  startPosition: null,
};

const DragContext = createContext<DragContextValue | null>(null);

const getSlotIndexFromPoint = (x: number, y: number): number | null => {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;
  const slotElement = element.closest<HTMLElement>('[data-slot-index]');
  if (!slotElement) return null;
  const value = slotElement.getAttribute('data-slot-index');
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const MachineDragProvider = ({ children }: { children: React.ReactNode }) => {
  const { state, actions } = useGame();
  const [dragState, setDragState] = useState<DragState>(initialDragState);
  const [ignoreClick, setIgnoreClick] = useState(false);
  const stateRef = useRef(state);
  const actionsRef = useRef(actions);
  const dragStateRef = useRef(dragState);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  const clearIgnoreClick = useCallback(() => {
    setIgnoreClick(false);
  }, []);

  const startDrag = useCallback(
    (machineId: string, slotIndex: number, event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      const target = event.currentTarget;
      const rect = target.getBoundingClientRect();
      setDragState({
        draggedMachineId: machineId,
        fromSlotIndex: slotIndex,
        pointerPosition: { x: event.clientX, y: event.clientY },
        dragOffset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
        ghostSize: { width: rect.width, height: rect.height },
        isPointerDown: true,
        isDragging: false,
        overSlotIndex: null,
        pointerId: event.pointerId,
        startPosition: { x: event.clientX, y: event.clientY },
      });
    },
    []
  );

  useEffect(() => {
    if (!dragState.isPointerDown) return;

    const handlePointerMove = (event: PointerEvent) => {
      const currentDrag = dragStateRef.current;
      if (!currentDrag.isPointerDown || currentDrag.pointerId !== event.pointerId) return;
      const nextPosition = { x: event.clientX, y: event.clientY };
      setDragState(prev => {
        if (!prev.isPointerDown || !prev.startPosition) return prev;
        const distance = Math.hypot(
          nextPosition.x - prev.startPosition.x,
          nextPosition.y - prev.startPosition.y
        );
        const isDragging = prev.isDragging || distance >= DRAG_THRESHOLD_PX;
        return {
          ...prev,
          isDragging,
          pointerPosition: nextPosition,
          overSlotIndex: isDragging ? getSlotIndexFromPoint(event.clientX, event.clientY) : null,
        };
      });
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const currentDrag = dragStateRef.current;
      if (currentDrag.pointerId !== event.pointerId) return;
      const currentState = stateRef.current;
      const currentActions = actionsRef.current;
      const wasDragging = currentDrag.isDragging;

      if (wasDragging && currentDrag.draggedMachineId) {
        const draggedMachine = currentState.machines.find(
          machine => machine.id === currentDrag.draggedMachineId
        );
        if (draggedMachine && currentDrag.overSlotIndex !== null) {
          const targetSlot = currentDrag.overSlotIndex;
          if (targetSlot !== draggedMachine.slotIndex) {
            const targetMachine = currentState.machines.find(
              machine => machine.slotIndex === targetSlot
            );
            if (!targetMachine && !draggedMachine.disabled) {
              currentActions.moveMachine(draggedMachine.id, targetSlot);
            } else if (targetMachine && canMerge(draggedMachine, targetMachine)) {
              currentActions.mergeMachines(draggedMachine.id, targetMachine.id);
            }
          }
        }
      }

      if (wasDragging) {
        setIgnoreClick(true);
      }

      setDragState(initialDragState);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [dragState.isPointerDown]);

  const value = useMemo(
    () => ({ dragState, startDrag, ignoreClick, clearIgnoreClick }),
    [dragState, startDrag, ignoreClick, clearIgnoreClick]
  );

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
};

export const useMachineDrag = () => {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error('useMachineDrag must be used within MachineDragProvider');
  }
  return context;
};
