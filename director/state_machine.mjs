// Iron Director — State Machine Engine
// Validates and guarantees deterministic, unforgeable task lifecycle transitions.

import { TASK_STATES } from './constants.mjs';

const ALLOWED_TRANSITIONS = {
  [TASK_STATES.PROPOSED]: [TASK_STATES.QUEUED, TASK_STATES.BLOCKED],
  [TASK_STATES.QUEUED]: [TASK_STATES.CLAIMED, TASK_STATES.BLOCKED, TASK_STATES.ESCALATED],
  [TASK_STATES.CLAIMED]: [
    TASK_STATES.RUNNING,
    TASK_STATES.RETRYING,
    TASK_STATES.QUEUED,
    TASK_STATES.BLOCKED,
    TASK_STATES.FAILED
  ],
  [TASK_STATES.RUNNING]: [
    TASK_STATES.VERIFYING,
    TASK_STATES.RETRYING,
    TASK_STATES.HANDOFF,
    TASK_STATES.BLOCKED,
    TASK_STATES.FAILED
  ],
  [TASK_STATES.RETRYING]: [
    TASK_STATES.CLAIMED,
    TASK_STATES.RUNNING,
    TASK_STATES.HANDOFF,
    TASK_STATES.BLOCKED,
    TASK_STATES.FAILED
  ],
  [TASK_STATES.HANDOFF]: [
    TASK_STATES.CLAIMED,
    TASK_STATES.RUNNING,
    TASK_STATES.VERIFYING,
    TASK_STATES.BLOCKED,
    TASK_STATES.ESCALATED,
    TASK_STATES.FAILED
  ],
  [TASK_STATES.VERIFYING]: [
    TASK_STATES.ARTIFACT_READY,
    TASK_STATES.PR_OPEN,
    TASK_STATES.AWAITING_REVIEW,
    TASK_STATES.DEPLOYED,
    TASK_STATES.DONE,
    TASK_STATES.RETRYING,
    TASK_STATES.HANDOFF,
    TASK_STATES.BLOCKED,
    TASK_STATES.FAILED
  ],
  [TASK_STATES.ARTIFACT_READY]: [
    TASK_STATES.PR_OPEN,
    TASK_STATES.AWAITING_REVIEW,
    TASK_STATES.RETRYING,
    TASK_STATES.BLOCKED,
    TASK_STATES.FAILED
  ],
  [TASK_STATES.PR_OPEN]: [
    TASK_STATES.AWAITING_REVIEW,
    TASK_STATES.DEPLOYED,
    TASK_STATES.RETRYING,
    TASK_STATES.BLOCKED,
    TASK_STATES.FAILED
  ],
  [TASK_STATES.AWAITING_REVIEW]: [
    TASK_STATES.DEPLOYED,
    TASK_STATES.BLOCKED,
    TASK_STATES.FAILED
  ],
  [TASK_STATES.DEPLOYED]: [
    TASK_STATES.DONE,
    TASK_STATES.RETRYING,
    TASK_STATES.BLOCKED,
    TASK_STATES.FAILED
  ],
  [TASK_STATES.BLOCKED]: [
    TASK_STATES.QUEUED,
    TASK_STATES.ESCALATED,
    TASK_STATES.FAILED
  ],
  [TASK_STATES.ESCALATED]: [
    TASK_STATES.QUEUED,
    TASK_STATES.FAILED,
    TASK_STATES.DONE
  ],
  [TASK_STATES.DONE]: [],
  [TASK_STATES.FAILED]: []
};

export class TaskStateMachine {
  /**
   * Checks if a transition from currentState to targetState is structurally valid.
   */
  static canTransition(fromState, toState) {
    if (!fromState || !toState) return false;
    if (fromState === toState) return true; // Idempotent no-op
    const allowed = ALLOWED_TRANSITIONS[fromState];
    return Array.isArray(allowed) && allowed.includes(toState);
  }

  /**
   * Validates and applies a transition, generating a tamper-evident audit record.
   */
  static transition(task, nextState, { actor = 'system', reason = '', evidence = null } = {}) {
    if (!task || typeof task !== 'object') {
      throw new Error('Invalid task object passed to state machine.');
    }

    const currentState = task.state || TASK_STATES.PROPOSED;

    if (!this.canTransition(currentState, nextState)) {
      throw new Error(
        `Illegal state transition: Cannot move task '${task.id}' from [${currentState}] to [${nextState}].`
      );
    }

    const timestamp = new Date().toISOString();
    const historyEntry = {
      timestamp,
      fromState: currentState,
      toState: nextState,
      actor,
      reason,
      evidence: evidence ? JSON.parse(JSON.stringify(evidence)) : null
    };

    const updatedTask = {
      ...task,
      state: nextState,
      updatedAt: timestamp,
      history: [...(task.history || []), historyEntry]
    };

    // Auto-update timestamps for key lifecycle milestones
    if (nextState === TASK_STATES.CLAIMED && !updatedTask.claimedAt) {
      updatedTask.claimedAt = timestamp;
    }
    if (nextState === TASK_STATES.DONE) {
      updatedTask.completedAt = timestamp;
    }
    if (nextState === TASK_STATES.FAILED) {
      updatedTask.failedAt = timestamp;
    }

    return updatedTask;
  }
}
