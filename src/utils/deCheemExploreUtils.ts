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
// repeatedly (case-split analysis relies on this).
export interface PropagateResult {
  contradiction: boolean;
  // What established the contradiction: a belief's assertion, the explore's own
  // premises, or case-split analysis (no single belief responsible).
  contradictionKind?: "belief" | "premise" | "caseSplit";
  contradictionSourceBeliefId?: string;
  // For caseSplit contradictions: the beliefs the refutation rests on.
  contradictionViaBeliefs?: string[];
  discoveries: Property[];
  reasoningSteps: ReasoningStep[];
  secondaryResidues: string[];
  // Set when the compute budget ran out: deductions are sound but possibly
  // missing some entailed literals.
  incomplete?: boolean;
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
          contradictionKind: "belief",
          contradictionSourceBeliefId: assertion.sourceBeliefId,
          discoveries,
          reasoningSteps,
          secondaryResidues,
        };
      }

      const residueObj = calculateResidue(assertion, discoveries);

      if (
        residueObj.length === 1 &&
        isUndetermined(residueObj[0].sentence, discoveries)
      ) {
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

// Shapes the internal result into the public ExploreResult. Kept in one place
// so the propagation-only path (caseSplit = false) stays byte-for-byte
// identical to the original behaviour.
function formatResult(result: PropagateResult): ExploreResult {
  const resultReason = result.incomplete
    ? "Compute budget exhausted before completing case-split analysis; deductions are sound but may be incomplete"
    : "Successful with no errors found";

  if (result.contradiction) {
    const contradictionStep: ReasoningStep =
      result.contradictionKind === "premise"
        ? { inferenceStepType: "PremiseContradiction" }
        : result.contradictionKind === "caseSplit"
        ? {
            inferenceStepType: "CaseSplitContradiction",
            ...(result.contradictionViaBeliefs?.length
              ? { viaBeliefs: result.contradictionViaBeliefs }
              : {}),
          }
        : {
            inferenceStepType: "Deductive",
            sourceBeliefId: result.contradictionSourceBeliefId,
          };
    return {
      resultCode: "Success",
      resultReason,
      results: {
        possible: false,
        reasoningSteps: [...result.reasoningSteps, contradictionStep],
        arrayOfSecondaryResidues: [...new Set(result.secondaryResidues)],
      },
    };
  }

  return {
    resultCode: "Success",
    resultReason,
    results: {
      possible: true,
      reasoningSteps: result.reasoningSteps,
      arrayOfSecondaryResidues: [...new Set(result.secondaryResidues)],
    },
  };
}

// Case-split analysis explores hypothetical worlds; runtime is bounded by a
// budget of search nodes rather than a nesting depth. When exhausted the
// engine stops searching and returns what has been soundly established.
export const DEFAULT_CASE_SPLIT_BUDGET = 50000;

export interface CaseSplitBudget {
  used: number;
  max: number;
}

export function exploreAssertions(
  explore: Property[],
  assertionSet: AssertionSet,
  caseSplit: boolean = false,
  budget: CaseSplitBudget = { used: 0, max: DEFAULT_CASE_SPLIT_BUDGET }
): ExploreResult {
  // Premises asserting both valences of the same sentence describe an empty
  // set of situations: impossible before any belief is consulted. Reported as
  // an ordinary contradiction, not an error.
  for (const p of explore) {
    if (
      explore.some(
        (o) => o.sentence === p.sentence && o.valence !== p.valence
      )
    ) {
      return formatResult({
        contradiction: true,
        contradictionKind: "premise",
        discoveries: [...explore],
        reasoningSteps: [],
        secondaryResidues: [],
      });
    }
  }

  const result = caseSplit
    ? caseSplitAnalysis(explore, assertionSet.assertions, budget)
    : propagate(explore, assertionSet.assertions);

  return formatResult(result);
}

// ---------------------------------------------------------------------------
// Case-split analysis (reasoning by cases), backbone-style
// ---------------------------------------------------------------------------
// Unit propagation only fires a rule when a single literal is left
// undetermined. Case-split analysis additionally finds every literal that
// holds in ALL consistent situations ("if A then Z" and "if not-A then Z"
// entail Z even though A is unknown), and detects belief sets with no
// consistent situation at all. Enabled by the caseSplit flag; results are
// complete (all entailed literals found) unless the budget runs out.
//
// Method, per independent component of the belief set:
//   1. Search for one consistent world (DPLL: propagate + branch).
//      None exists -> the explore is impossible.
//   2. Candidate literals = undetermined residue sentences, with the valence
//      that world assigns. Any world found along the way instantly eliminates
//      every candidate it falsifies (a counterexample disproves entailment).
//   3. For each surviving candidate L: search for a world satisfying NOT L.
//      No such world -> L is entailed; absorb it and re-propagate.
//
// Components: sentences never sharing an assertion cannot influence each
// other, so each connected component is analysed independently. This keeps
// the search confined to the sub-problem a deduction actually depends on.

function isUndetermined(sentence: string, discoveries: Property[]): boolean {
  return !discoveries.some((d) => d.sentence === sentence);
}

function factsKey(facts: Property[]): string {
  return facts
    .map((p) => p.sentence + (p.valence ? "+" : "-"))
    .sort()
    .join("|");
}

// Groups assertions into connected components: assertions belong together when
// they (transitively) share a sentence. Union-find over sentences.
function componentsOf(assertions: Assertion[]): Assertion[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(x) !== root) {
      const next = parent.get(x)!;
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  for (const a of assertions) {
    for (let i = 1; i < a.properties.length; i++) {
      parent.set(find(a.properties[0].sentence), find(a.properties[i].sentence));
    }
  }
  const groups = new Map<string, Assertion[]>();
  for (const a of assertions) {
    const root = find(a.properties[0].sentence);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(a);
  }
  return [...groups.values()];
}

type SatOutcome =
  | { status: "sat"; model: Property[] }
  | { status: "unsat" }
  | { status: "unknown" };

// DPLL satisfiability over one component: is there a complete situation
// consistent with `facts`? Propagation closures are memoised (propagate is
// pure), collapsing repeated sub-searches. `conflicts` collects the ids of
// beliefs that fired or excluded along explored branches; when the search
// ends in "unsat" this is the set of beliefs the refutation rests on.
function satisfiable(
  facts: Property[],
  assertions: Assertion[],
  budget: CaseSplitBudget,
  memo: Map<string, PropagateResult>,
  conflicts?: Set<string>
): SatOutcome {
  budget.used++;
  if (budget.used > budget.max) return { status: "unknown" };

  const k = factsKey(facts);
  const cached = memo.get(k);
  const r = cached ?? propagate(facts, assertions);
  if (!cached) memo.set(k, r);
  if (conflicts) {
    for (const step of r.reasoningSteps) {
      if (step.sourceBeliefId !== undefined) conflicts.add(step.sourceBeliefId);
    }
    if (r.contradictionSourceBeliefId !== undefined) {
      conflicts.add(r.contradictionSourceBeliefId);
    }
  }
  if (r.contradiction) return { status: "unsat" };

  const open = [...new Set(r.secondaryResidues)].filter((s) =>
    isUndetermined(s, r.discoveries)
  );
  if (open.length === 0) {
    // Every remaining assertion is permanently satisfied: any completion of
    // the current facts is a consistent world.
    return { status: "sat", model: r.discoveries };
  }

  // Branch on the sentence appearing in the most stuck assertions.
  const freq = new Map<string, number>();
  for (const s of r.secondaryResidues) freq.set(s, (freq.get(s) || 0) + 1);
  open.sort((a, b) => freq.get(b)! - freq.get(a)!);
  const sentence = open[0];

  const asTrue = satisfiable(
    [...r.discoveries, { sentence, valence: true }],
    assertions,
    budget,
    memo,
    conflicts
  );
  if (asTrue.status !== "unsat") return asTrue;
  return satisfiable(
    [...r.discoveries, { sentence, valence: false }],
    assertions,
    budget,
    memo,
    conflicts
  );
}

function caseSplitAnalysis(
  explore: Property[],
  assertions: Assertion[],
  budget: CaseSplitBudget
): PropagateResult {
  const base = propagate(explore, assertions);
  if (base.contradiction) return base;

  let discoveries = base.discoveries;
  const reasoningSteps = [...base.reasoningSteps];
  let incomplete = false;

  for (const component of componentsOf(assertions)) {
    const sentences = new Set(
      component.flatMap((a) => a.properties.map((p) => p.sentence))
    );
    const memo = new Map<string, PropagateResult>();
    let facts = discoveries.filter((p) => sentences.has(p.sentence));

    const firstConflicts = new Set<string>();
    const first = satisfiable(facts, component, budget, memo, firstConflicts);
    if (first.status === "unknown") {
      incomplete = true;
      continue;
    }
    if (first.status === "unsat") {
      // No consistent situation exists for this component's constraints.
      return {
        contradiction: true,
        contradictionKind: "caseSplit",
        contradictionViaBeliefs: [...firstConflicts].sort(),
        discoveries,
        reasoningSteps,
        secondaryResidues: base.secondaryResidues,
        incomplete,
      };
    }

    // Candidates: undetermined residue sentences of this component, with the
    // valence the first-found world assigns (the opposite valence already has
    // that world as a counterexample). Sentences absent from the model are
    // free either way, hence not entailed.
    let candidates: Property[] = [];
    for (const s of new Set(base.secondaryResidues)) {
      if (!sentences.has(s) || !isUndetermined(s, facts)) continue;
      const inModel = first.model.find((p) => p.sentence === s);
      if (inModel) candidates.push({ sentence: s, valence: inModel.valence });
    }

    while (candidates.length > 0) {
      const L = candidates.shift()!;
      if (!isUndetermined(L.sentence, facts)) continue;

      const refuteConflicts = new Set<string>();
      const refute = satisfiable(
        [...facts, { sentence: L.sentence, valence: !L.valence }],
        component,
        budget,
        memo,
        refuteConflicts
      );
      if (refute.status === "unknown") {
        incomplete = true;
        break;
      }
      if (refute.status === "unsat") {
        // No situation satisfies NOT L, so L holds in all of them: entailed.
        reasoningSteps.push({
          inferenceStepType: "CaseSplit",
          deducedProperty: [L],
          caseSplitOn: L.sentence,
          viaBeliefs: [...refuteConflicts].sort(),
        });
        const absorbed = propagate([...facts, L], component);
        reasoningSteps.push(...absorbed.reasoningSteps);
        facts = absorbed.discoveries;
        candidates = candidates.filter((c) =>
          isUndetermined(c.sentence, facts)
        );
      } else {
        // Found a world where NOT L holds: L is not entailed, and the world
        // also disproves every other candidate it falsifies.
        candidates = candidates.filter((c) => {
          const m = refute.model.find((p) => p.sentence === c.sentence);
          return !m || m.valence === c.valence;
        });
      }
    }

    // Merge this component's conclusions into the global picture.
    const known = new Set(discoveries.map((p) => p.sentence));
    discoveries = [
      ...discoveries,
      ...facts.filter((p) => !known.has(p.sentence)),
    ];
  }

  // Fresh residues for the enlarged fact set (components cannot interact, so
  // no new unit deductions can appear here).
  const final = propagate(discoveries, assertions);
  return {
    contradiction: false,
    discoveries,
    reasoningSteps,
    secondaryResidues: final.secondaryResidues,
    incomplete: incomplete || undefined,
  };
}

//helper functions below:
function isAssertionExcluded(
  assertion: Assertion,
  exploreObj: Property[]
): boolean {
  return assertion.properties.every((prop) =>
    exploreObj.some(
      (obj) => obj.sentence === prop.sentence && obj.valence === prop.valence
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

function calculateSecondaryResidues(
  residue: Property[],
  exploreObj: Property[]
): string[] {
  return residue
    .map((obj) => obj.sentence)
    .filter((sentence) => !exploreObj.some((obj) => obj.sentence === sentence));
}
