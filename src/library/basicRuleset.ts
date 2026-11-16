import { AttributeDefSchema, type AttributeDef } from "../state/StateSchema";

/** The value a person starts with for each skill of the basic set. */
export const BASIC_START_VALUE = 60;

const skill = (name: string): AttributeDef =>
  AttributeDefSchema.parse({ id: name, name, kind: "number", min: 0, max: 100 });

/**
 * The set an adventure plays with when it has chosen none: two skills out of 100.
 * It is never saved in the library and is not on the Rule-sets shelf.
 */
export const BASIC_RULESET: { name: string; attributes: AttributeDef[] } = {
  name: "Basic",
  attributes: [skill("Observation"), skill("Persuasion")],
};
