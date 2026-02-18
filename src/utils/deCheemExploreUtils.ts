import {
  ReasoningStep,
  ExploreResult,
  Property,
  AssertionSet,
  Assertion,
} from "../types/interfaces";

import { invertValences } from "./deCheemInternalUtils";

export function exploreAssertions(
  explore: Property[],
  assertionSet: AssertionSet
): ExploreResult {
  let discoveries = [...explore];

  const resultObj: ExploreResult = {
    resultCode: "Success",
    resultReason: "Successful with no errors found",
    results: {
      possible: true,
      reasoningSteps: [],
      arrayOfSecondaryResidues: [],
    },
  };

  let turn = 1;
  let previousmd5 = null;

  while (JSON.stringify(discoveries) !== previousmd5 || turn === 1) {
    previousmd5 = JSON.stringify(discoveries);
    turn++;

    for (const assertion of assertionSet.assertions) {
      const reasoningStep: ReasoningStep = {
        inferenceStepType: "Deductive",
      };

      if (isAssertionExcluded(assertion, discoveries)) {
        reasoningStep.sourceBeliefId = assertion.sourceBeliefId;
        resultObj.results.reasoningSteps.push(reasoningStep);
        resultObj.results.possible = false;
        return resultObj;
      } else {
        const residueObj = calculateResidue(assertion, discoveries);

        if (
          residueObj.length === 1 &&
          isNewProperty(residueObj[0], discoveries)
        ) {
          reasoningStep.deducedProperty = invertValences(residueObj);
          reasoningStep.sourceBeliefId = assertion.sourceBeliefId;
          resultObj.results.reasoningSteps.push(reasoningStep);
          discoveries.push(...invertValences(residueObj));
          assertionSet.assertions = assertionSet.assertions.filter(
            (x) => x !== assertion
          );
        } else {
          resultObj.results.arrayOfSecondaryResidues.push(
            ...calculateSecondaryResidues(residueObj, discoveries)
          );
        }
      }
    }
  }

  resultObj.results.arrayOfSecondaryResidues = [...new Set(resultObj.results.arrayOfSecondaryResidues)];
  return resultObj;
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
