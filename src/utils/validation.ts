import { BeliefSet, Property } from "../types/interfaces";

// Thrown for malformed request payloads; the controller maps this to a 400 so
// callers (typically an LLM emitting JSON) get an actionable message instead of
// a silently wrong inference result.
export class ValidationError extends Error {}

const KNOWN_SCENARIO_TYPES = ["IF_THEN", "MUTUAL_EXCLUSION", "MUTUAL_INCLUSION"];
const KNOWN_MODALS = ["Always", "Never"];

function assertProperty(p: any, path: string): void {
  if (!p || typeof p !== "object") {
    throw new ValidationError(`${path}: property must be an object with {sentence, valence}`);
  }
  if (typeof p.sentence !== "string" || p.sentence.trim().length === 0) {
    throw new ValidationError(`${path}: "sentence" must be a non-empty string`);
  }
  if (typeof p.valence !== "boolean") {
    throw new ValidationError(
      `${path}: "valence" must be a boolean (got ${JSON.stringify(p.valence)})`
    );
  }
}

function assertPropertyArray(arr: any, path: string, allowEmpty: boolean): void {
  if (!Array.isArray(arr)) {
    throw new ValidationError(`${path}: expected an array of properties`);
  }
  if (!allowEmpty && arr.length === 0) {
    throw new ValidationError(`${path}: must contain at least one property`);
  }
  arr.forEach((p, i) => assertProperty(p, `${path}[${i}]`));
}

export function validateExplore(explore: any): Property[] {
  if (!Array.isArray(explore)) {
    throw new ValidationError(
      `"explore" must be an array of {sentence, valence} properties (an empty array is allowed)`
    );
  }
  explore.forEach((p, i) => assertProperty(p, `explore[${i}]`));
  return explore;
}

export function validateBeliefSet(beliefSet: any): BeliefSet {
  if (!beliefSet || typeof beliefSet !== "object") {
    throw new ValidationError(`"beliefSet" must be an object`);
  }
  if (!Array.isArray(beliefSet.beliefs)) {
    throw new ValidationError(`"beliefSet.beliefs" must be an array`);
  }

  beliefSet.beliefs.forEach((belief: any, i: number) => {
    const path = `beliefs[${i}]`;
    const scenario = belief?.scenario;
    if (!scenario || typeof scenario !== "object") {
      throw new ValidationError(`${path}: missing "scenario"`);
    }
    if (!KNOWN_SCENARIO_TYPES.includes(scenario.type)) {
      throw new ValidationError(
        `${path}: unknown scenario type ${JSON.stringify(scenario.type)}; expected one of ${KNOWN_SCENARIO_TYPES.join(", ")}`
      );
    }

    if (!Array.isArray(scenario.antecedents) || scenario.antecedents.length === 0) {
      throw new ValidationError(
        `${path}: "antecedents" must be a non-empty array of property groups. ` +
          `For an unconditional consequence use a single empty group: [[]]`
      );
    }

    if (scenario.type === "IF_THEN") {
      // An empty GROUP ([[]]) is meaningful: "if nothing, then..." = unconditional.
      scenario.antecedents.forEach((group: any, g: number) =>
        assertPropertyArray(group, `${path}.antecedents[${g}]`, true)
      );
      if (!Array.isArray(scenario.consequences) || scenario.consequences.length === 0) {
        throw new ValidationError(`${path}: IF_THEN requires at least one consequence`);
      }
      scenario.consequences.forEach((c: any, ci: number) => {
        const cPath = `${path}.consequences[${ci}]`;
        if (!KNOWN_MODALS.includes(c?.modal)) {
          throw new ValidationError(
            `${cPath}: unknown modal ${JSON.stringify(c?.modal)}; expected one of ${KNOWN_MODALS.join(", ")}`
          );
        }
        // Empty consequence properties would compile to an empty (vacuously
        // matched) nogood, which marks EVERY explore impossible.
        assertPropertyArray(c.properties, `${cPath}.properties`, false);
      });
    } else {
      // MUTUAL_EXCLUSION / MUTUAL_INCLUSION relate 2+ groups to each other.
      if (scenario.antecedents.length < 2) {
        throw new ValidationError(
          `${path}: ${scenario.type} requires at least two antecedent groups`
        );
      }
      scenario.antecedents.forEach((group: any, g: number) =>
        assertPropertyArray(group, `${path}.antecedents[${g}]`, false)
      );
    }
  });

  return beliefSet;
}

export function validateMaxCaseSplitDepth(value: any): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(
      `"maxCaseSplitDepth" must be a non-negative integer (got ${JSON.stringify(value)})`
    );
  }
  return value;
}
