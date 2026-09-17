import { z } from "zod";
import { StateEventSchema } from "@state/StateSchema";

export type StateEvent = z.infer<typeof StateEventSchema>;

/**
 * Event Log — Master Spec §9.
 * Append-only. Every significant state change or system event gets a
 * unique id so Inspector Mode (§25, §52) can trace:
 *   Current State → Last Mutation → Event → LLM Output
 */
export class EventLog {
  private events: StateEvent[] = [];

  append(event: Omit<StateEvent, "id"> & { id?: string }): StateEvent {
    const full: StateEvent = {
      id: event.id ?? crypto.randomUUID(),
      ...event
    };
    const parsed = StateEventSchema.parse(full);
    this.events.push(parsed);
    return parsed;
  }

  all(): readonly StateEvent[] {
    return this.events;
  }

  byTurn(turn: number): readonly StateEvent[] {
    return this.events.filter((e) => e.turn === turn);
  }

  findById(id: string): StateEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  /** Used by Undo (§31): the most recent event, if any. */
  last(): StateEvent | undefined {
    return this.events.at(-1);
  }
}
