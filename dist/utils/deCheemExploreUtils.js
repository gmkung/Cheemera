"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exploreAssertions = exports.DEFAULT_CASE_SPLIT_BUDGET = exports.propagate = void 0;
const deCheemInternalUtils_1 = require("./deCheemInternalUtils");
function propagate(explore, assertions) {
    const discoveries = [...explore];
    const reasoningSteps = [];
    const secondaryResidues = [];
    // Local working copy of the still-relevant assertions. We never mutate the
    // array we iterate; instead each pass rebuilds the list of assertions that
    // remain active, dropping any that have fired.
    let active = [...assertions];
    let changed = true;
    while (changed) {
        changed = false;
        const stillActive = [];
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
            if (residueObj.length === 1 &&
                isUndetermined(residueObj[0].sentence, discoveries)) {
                // Unit propagation: every literal but one is satisfied, so the last one
                // is forced to its opposite valence.
                const deduced = (0, deCheemInternalUtils_1.invertValences)(residueObj);
                reasoningSteps.push({
                    inferenceStepType: "Deductive",
                    deducedProperty: deduced,
                    sourceBeliefId: assertion.sourceBeliefId,
                });
                discoveries.push(...deduced);
                changed = true;
                // Assertion has fired; drop it by not carrying it into stillActive.
            }
            else {
                secondaryResidues.push(...calculateSecondaryResidues(residueObj, discoveries));
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
exports.propagate = propagate;
// Shapes the internal result into the public ExploreResult. Kept in one place
// so the maxCaseSplitDepth === 0 path stays byte-for-byte identical to the
// original behaviour.
function formatResult(result) {
    var _a;
    const resultReason = result.incomplete
        ? "Compute budget exhausted before completing case-split analysis; deductions are sound but may be incomplete"
        : "Successful with no errors found";
    if (result.contradiction) {
        const contradictionStep = result.contradictionKind === "premise"
            ? { inferenceStepType: "PremiseContradiction" }
            : result.contradictionKind === "caseSplit"
                ? Object.assign({ inferenceStepType: "CaseSplitContradiction" }, (((_a = result.contradictionViaBeliefs) === null || _a === void 0 ? void 0 : _a.length)
                    ? { viaBeliefs: result.contradictionViaBeliefs }
                    : {})) : {
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
exports.DEFAULT_CASE_SPLIT_BUDGET = 50000;
function exploreAssertions(explore, assertionSet, maxCaseSplitDepth = 0, budget = { used: 0, max: exports.DEFAULT_CASE_SPLIT_BUDGET }) {
    // Premises asserting both valences of the same sentence describe an empty
    // set of situations: impossible before any belief is consulted. Reported as
    // an ordinary contradiction, not an error.
    for (const p of explore) {
        if (explore.some((o) => o.sentence === p.sentence && o.valence !== p.valence)) {
            return formatResult({
                contradiction: true,
                contradictionKind: "premise",
                discoveries: [...explore],
                reasoningSteps: [],
                secondaryResidues: [],
            });
        }
    }
    const result = maxCaseSplitDepth > 0
        ? caseSplitAnalysis(explore, assertionSet.assertions, budget)
        : propagate(explore, assertionSet.assertions);
    return formatResult(result);
}
exports.exploreAssertions = exploreAssertions;
// ---------------------------------------------------------------------------
// Case-split analysis (reasoning by cases), backbone-style
// ---------------------------------------------------------------------------
// Unit propagation only fires a rule when a single literal is left
// undetermined. Case-split analysis additionally finds every literal that
// holds in ALL consistent situations ("if A then Z" and "if not-A then Z"
// entail Z even though A is unknown), and detects belief sets with no
// consistent situation at all. Any maxCaseSplitDepth >= 1 enables it; results
// are complete (all entailed literals found) unless the budget runs out.
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
function isUndetermined(sentence, discoveries) {
    return !discoveries.some((d) => d.sentence === sentence);
}
function factsKey(facts) {
    return facts
        .map((p) => p.sentence + (p.valence ? "+" : "-"))
        .sort()
        .join("|");
}
// Groups assertions into connected components: assertions belong together when
// they (transitively) share a sentence. Union-find over sentences.
function componentsOf(assertions) {
    const parent = new Map();
    const find = (x) => {
        if (!parent.has(x))
            parent.set(x, x);
        let root = x;
        while (parent.get(root) !== root)
            root = parent.get(root);
        while (parent.get(x) !== root) {
            const next = parent.get(x);
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
    const groups = new Map();
    for (const a of assertions) {
        const root = find(a.properties[0].sentence);
        if (!groups.has(root))
            groups.set(root, []);
        groups.get(root).push(a);
    }
    return [...groups.values()];
}
// DPLL satisfiability over one component: is there a complete situation
// consistent with `facts`? Propagation closures are memoised (propagate is
// pure), collapsing repeated sub-searches. `conflicts` collects the ids of
// beliefs that fired or excluded along explored branches; when the search
// ends in "unsat" this is the set of beliefs the refutation rests on.
function satisfiable(facts, assertions, budget, memo, conflicts) {
    budget.used++;
    if (budget.used > budget.max)
        return { status: "unknown" };
    const k = factsKey(facts);
    const cached = memo.get(k);
    const r = cached !== null && cached !== void 0 ? cached : propagate(facts, assertions);
    if (!cached)
        memo.set(k, r);
    if (conflicts) {
        for (const step of r.reasoningSteps) {
            if (step.sourceBeliefId !== undefined)
                conflicts.add(step.sourceBeliefId);
        }
        if (r.contradictionSourceBeliefId !== undefined) {
            conflicts.add(r.contradictionSourceBeliefId);
        }
    }
    if (r.contradiction)
        return { status: "unsat" };
    const open = [...new Set(r.secondaryResidues)].filter((s) => isUndetermined(s, r.discoveries));
    if (open.length === 0) {
        // Every remaining assertion is permanently satisfied: any completion of
        // the current facts is a consistent world.
        return { status: "sat", model: r.discoveries };
    }
    // Branch on the sentence appearing in the most stuck assertions.
    const freq = new Map();
    for (const s of r.secondaryResidues)
        freq.set(s, (freq.get(s) || 0) + 1);
    open.sort((a, b) => freq.get(b) - freq.get(a));
    const sentence = open[0];
    const asTrue = satisfiable([...r.discoveries, { sentence, valence: true }], assertions, budget, memo, conflicts);
    if (asTrue.status !== "unsat")
        return asTrue;
    return satisfiable([...r.discoveries, { sentence, valence: false }], assertions, budget, memo, conflicts);
}
function caseSplitAnalysis(explore, assertions, budget) {
    const base = propagate(explore, assertions);
    if (base.contradiction)
        return base;
    let discoveries = base.discoveries;
    const reasoningSteps = [...base.reasoningSteps];
    let incomplete = false;
    for (const component of componentsOf(assertions)) {
        const sentences = new Set(component.flatMap((a) => a.properties.map((p) => p.sentence)));
        const memo = new Map();
        let facts = discoveries.filter((p) => sentences.has(p.sentence));
        const firstConflicts = new Set();
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
        let candidates = [];
        for (const s of new Set(base.secondaryResidues)) {
            if (!sentences.has(s) || !isUndetermined(s, facts))
                continue;
            const inModel = first.model.find((p) => p.sentence === s);
            if (inModel)
                candidates.push({ sentence: s, valence: inModel.valence });
        }
        while (candidates.length > 0) {
            const L = candidates.shift();
            if (!isUndetermined(L.sentence, facts))
                continue;
            const refuteConflicts = new Set();
            const refute = satisfiable([...facts, { sentence: L.sentence, valence: !L.valence }], component, budget, memo, refuteConflicts);
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
                candidates = candidates.filter((c) => isUndetermined(c.sentence, facts));
            }
            else {
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
function isAssertionExcluded(assertion, exploreObj) {
    return assertion.properties.every((prop) => exploreObj.some((obj) => obj.sentence === prop.sentence && obj.valence === prop.valence));
}
function calculateResidue(assertion, exploreObj) {
    return assertion.properties.filter((prop) => !exploreObj.some((obj) => obj.sentence === prop.sentence && obj.valence === prop.valence));
}
function calculateSecondaryResidues(residue, exploreObj) {
    return residue
        .map((obj) => obj.sentence)
        .filter((sentence) => !exploreObj.some((obj) => obj.sentence === sentence));
}
