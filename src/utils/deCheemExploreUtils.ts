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

  // Premises asserting both valences of the same sentence describe an empty
  // set of situations: no belief is needed to make this impossible. Reported
  // as an ordinary contradiction (no sourceBeliefId), not an error.
  for (const p of discoveries) {
    if (
      discoveries.some(
        (o) => o.sentence === p.sentence && o.valence !== p.valence
      )
    ) {
      return {
        contradiction: true,
        discoveries,
        reasoningSteps,
        secondaryResidues,
      };
    }
  }

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

// Shapes the internal propagation/case-split result into the public
// ExploreResult. Kept in one place so the maxCaseSplitDepth === 0 path stays
// byte-for-byte identical to the original behaviour.
function formatResult(result: PropagateResult): ExploreResult {
  if (result.contradiction) {
    return {
      resultCode: "Success",
      resultReason: "Successful with no errors found",
      results: {
        possible: false,
        reasoningSteps: [
          ...result.reasoningSteps,
          // A contradiction without a source belief means the explore's own
          // premises were mutually exclusive (e.g. A and NOT A supplied).
          result.contradictionSourceBeliefId !== undefined
            ? {
                inferenceStepType: "Deductive",
                sourceBeliefId: result.contradictionSourceBeliefId,
              }
            : { inferenceStepType: "PremiseContradiction" },
        ],
        arrayOfSecondaryResidues: [...new Set(result.secondaryResidues)],
      },
    };
  }

  return {
    resultCode: "Success",
    resultReason: "Successful with no errors found",
    results: {
      possible: true,
      reasoningSteps: result.reasoningSteps,
      arrayOfSecondaryResidues: [...new Set(result.secondaryResidues)],
    },
  };
}

// Case-split explores an exponential branch tree in the worst case. Rather
// than capping depth, runtime is bounded by a budget of recursive branch
// visits; when exhausted the engine stops deepening and returns what has been
// soundly established so far (never wrong, possibly incomplete).
export const DEFAULT_CASE_SPLIT_BUDGET = 50000;

export interface CaseSplitBudget {
  used: number;
  max: number;
}

export function exploreAssertions(
  explore: Property[],
  assertionSet: AssertionSet,
  maxCaseSplitDepth: number = 0,
  budget: CaseSplitBudget = { used: 0, max: DEFAULT_CASE_SPLIT_BUDGET }
): ExploreResult {
  const result =
    maxCaseSplitDepth > 0
      ? deduceWithCaseSplit(
          explore,
          assertionSet.assertions,
          maxCaseSplitDepth,
          0,
          budget
        )
      : propagate(explore, assertionSet.assertions);

  return formatResult(result);
}

// ---------------------------------------------------------------------------
// Case-split (reasoning by cases)
// ---------------------------------------------------------------------------
// Unit propagation alone only fires a rule when a single literal is left
// undetermined. Some conclusions instead require showing they hold for EVERY
// value of an undetermined variable: "if A then Z" and "if not-A then Z" entail
// Z even though A is unknown. deduceWithCaseSplit adds that by, for each
// relevant undetermined sentence, propagating both branches and:
//   * both branches contradict      -> the current facts are inconsistent;
//   * exactly one branch contradicts -> the other value is forced (failed
//                                       literal rule);
//   * neither contradicts            -> any literal common to both branch
//                                       closures is entailed regardless (the
//                                       intersection), and is deduced.
// All three moves are sound entailment, so the result only ever adds correct
// deductions (it remains incomplete at finite depth, which is the cost knob).

function isUndetermined(sentence: string, discoveries: Property[]): boolean {
  return !discoveries.some((d) => d.sentence === sentence);
}

function isNewLiteral(prop: Property, discoveries: Property[]): boolean {
  return !discoveries.some(
    (d) => d.sentence === prop.sentence && d.valence === prop.valence
  );
}

// Literals present (same sentence AND valence) in both property lists.
function intersectProperties(a: Property[], b: Property[]): Property[] {
  return a.filter((pa) =>
    b.some((pb) => pb.sentence === pa.sentence && pb.valence === pa.valence)
  );
}

export function deduceWithCaseSplit(
  explore: Property[],
  assertions: Assertion[],
  maxDepth: number,
  depth: number = 0,
  budget: CaseSplitBudget = { used: 0, max: DEFAULT_CASE_SPLIT_BUDGET }
): PropagateResult {
  budget.used++;
  // Start from the unit-propagation closure of the current facts. When the
  // budget is exhausted, stop deepening: propagation alone is still sound.
  const base = propagate(explore, assertions);
  if (base.contradiction || depth >= maxDepth || budget.used > budget.max) {
    return base;
  }

  let discoveries = base.discoveries;
  let reasoningSteps = base.reasoningSteps;
  let secondaryResidues = base.secondaryResidues;

  let changed = true;
  while (changed) {
    changed = false;

    // The undetermined sentences worth branching on are exactly the ones the
    // engine already flagged as relevant-but-stuck: the secondary residues.
    const candidates = [...new Set(secondaryResidues)].filter((s) =>
      isUndetermined(s, discoveries)
    );

    for (const sentence of candidates) {
      if (!isUndetermined(sentence, discoveries)) continue; // determined mid-loop

      const asTrue: Property = { sentence, valence: true };
      const asFalse: Property = { sentence, valence: false };
      const branchTrue = deduceWithCaseSplit(
        [...discoveries, asTrue],
        assertions,
        maxDepth,
        depth + 1,
        budget
      );
      const branchFalse = deduceWithCaseSplit(
        [...discoveries, asFalse],
        assertions,
        maxDepth,
        depth + 1,
        budget
      );

      // What to add to the current facts as a result of this split.
      let forced: Property[] = [];

      if (branchTrue.contradiction && branchFalse.contradiction) {
        // Neither value is viable: the current facts themselves are impossible.
        return {
          contradiction: true,
          contradictionSourceBeliefId:
            branchTrue.contradictionSourceBeliefId ??
            branchFalse.contradictionSourceBeliefId,
          discoveries,
          reasoningSteps,
          secondaryResidues,
        };
      } else if (branchTrue.contradiction) {
        forced = [asFalse]; // P:true impossible => P:false forced
      } else if (branchFalse.contradiction) {
        forced = [asTrue]; // P:false impossible => P:true forced
      } else {
        // Both viable: anything true in both closures holds either way.
        forced = intersectProperties(
          branchTrue.discoveries,
          branchFalse.discoveries
        ).filter((p) => isNewLiteral(p, discoveries));
      }

      if (forced.length === 0) continue;

      for (const f of forced) {
        reasoningSteps.push({
          inferenceStepType: "CaseSplit",
          deducedProperty: [f],
          caseSplitOn: sentence,
        });
      }

      // Re-propagate with the newly forced facts to reach the new closure; this
      // may unlock further ordinary deductions and refreshes the residues.
      const reprop = propagate([...discoveries, ...forced], assertions);
      reasoningSteps = [...reasoningSteps, ...reprop.reasoningSteps];
      if (reprop.contradiction) {
        return {
          contradiction: true,
          contradictionSourceBeliefId: reprop.contradictionSourceBeliefId,
          discoveries: reprop.discoveries,
          reasoningSteps,
          secondaryResidues: reprop.secondaryResidues,
        };
      }
      discoveries = reprop.discoveries;
      secondaryResidues = reprop.secondaryResidues;
      changed = true;
    }
  }

  return {
    contradiction: false,
    discoveries,
    reasoningSteps,
    secondaryResidues,
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
