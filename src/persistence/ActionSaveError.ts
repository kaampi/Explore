/** The authoritative action has committed in memory; retry storage, never reroll the action. */
export class ActionSaveError extends Error {
  constructor(cause: unknown) {
    super(`The action is resolved, but could not be saved. ${cause instanceof Error ? cause.message : ''}`);
    this.name = 'ActionSaveError';
  }
}
