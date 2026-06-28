import {
  ReasoningStep,
  ExploreResult,
  Property,
  AssertionSet,
  Assertion,
} from "../types/interfaces";

import { invertValences } from "./deCheemInternalUtils";

// Result of one propagation run. Kept side-effect free: the caller's `explore`
// and `assertionSet` are never mutated, so the same inputs can be propagated
// repeatedly (a prerequisite for case-split style branching).
export interface PropagateResult {
  contradiction: boolean;
  contradictionSourceBeliefId?: string;
  discoveries: Property[];
  reasoningSteps: ReasoningStep[];
  secondaryResidues: string[];
}

export function propagate(
  explore: Property[],
  assertions: Assertion[]
): PropagateResult {
  const discoveries: Property[] = [...explore];
  const reasoningSteps: ReasoningStep[] = [];
  const secondaryResidues: string[] = [];

  // Local working copy of the still-relevant assertions. We never mutate the
  // array we iterate; instead each pass rebuilds the list of assertions that
  // remain active, dropping any that have fired.
  let active: Assertion[] = [...assertions];
  let changed = true;

  while (changed) {
    changed = false;
    const stillActive: Assertion[] = [];

    for (const assertion of active) {
      if (isAssertionExcluded(assertion, discoveries)) {
        // The full forbidden combination is realised: the explore is impossible.
        return {
          contradiction: true,
          contradictionSourceBeliefId: assertion.sourceBeliefId,
          discoveries,
          reasoningSteps,
          secondaryResidues,
        };
      }

      const residueObj = calculateResidue(assertion, discoveries);

      if (residueObj.length === 1 && isNewProperty(residueObj[0], discoveries)) {
        // Unit propagation: every literal but one is satisfied, so the last one
        // is forced to its opposite valence.
        const deduced = invertValences(residueObj);
        reasoningSteps.push({
          inferenceStepType: "Deductive",
          deducedProperty: deduced,
          sourceBeliefId: assertion.sourceBeliefId,
        });
        discoveries.push(...deduced);
        changed = true;
        // Assertion has fired; drop it by not carrying it into stillActive.
      } else {
        secondaryResidues.push(
          ...calculateSecondaryResidues(residueObj, discoveries)
        );
        stillActive.push(assertion);
      }
    }

    active = stillActive;
  }

  return {
    contradiction: false,
    discoveries,
    reasoningSteps,
    secondaryResidues,
  };
}

export function exploreAssertions(
  explore: Property[],
  assertionSet: AssertionSet
): ExploreResult {
  const { contradiction, contradictionSourceBeliefId, reasoningSteps, secondaryResidues } =
    propagate(explore, assertionSet.assertions);

  if (contradiction) {
    return {
      resultCode: "Success",
      resultReason: "Successful with no errors found",
      results: {
        possible: false,
        reasoningSteps: [
          ...reasoningSteps,
          { inferenceStepType: "Deductive", sourceBeliefId: contradictionSourceBeliefId },
        ],
        arrayOfSecondaryResidues: [...new Set(secondaryResidues)],
      },
    };
  }

  return {
    resultCode: "Success",
    resultReason: "Successful with no errors found",
    results: {
      possible: true,
      reasoningSteps,
      arrayOfSecondaryResidues: [...new Set(secondaryResidues)],
    },
  };
}

//helper functions below:
function isAssertionExcluded(
  assertion: Assertion,
  exploreObj: Property[]
): boolean {
  return (
    assertion.exclude &&
    assertion.properties.every((prop) =>
      exploreObj.some(
        (obj) => obj.sentence === prop.sentence && obj.valence === prop.valence
      )
    )
  );
}

function calculateResidue(
  assertion: Assertion,
  exploreObj: Property[]
): Property[] {
  return assertion.properties.filter(
    (prop) =>
      !exploreObj.some(
        (obj) => obj.sentence === prop.sentence && obj.valence === prop.valence
      )
  );
}

function isNewProperty(property: Property, exploreObj: Property[]): boolean {
  return !exploreObj.some((obj) => obj.sentence === property.sentence);
}

function calculateSecondaryResidues(
  residue: Property[],
  exploreObj: Property[]
): string[] {
  return residue
    .map((obj) => obj.sentence)
    .filter((sentence) => !exploreObj.some((obj) => obj.sentence === sentence));
}
