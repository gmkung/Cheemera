"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deduceWithCaseSplit = exports.exploreAssertions = exports.propagate = void 0;
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
// Shapes the internal propagation/case-split result into the public
// ExploreResult. Kept in one place so the maxCaseSplitDepth === 0 path stays
// byte-for-byte identical to the original behaviour.
function formatResult(result) {
    if (result.contradiction) {
        return {
            resultCode: "Success",
            resultReason: "Successful with no errors found",
            results: {
                possible: false,
                reasoningSteps: [
                    ...result.reasoningSteps,
                    {
                        inferenceStepType: "Deductive",
                        sourceBeliefId: result.contradictionSourceBeliefId,
                    },
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
function exploreAssertions(explore, assertionSet, maxCaseSplitDepth = 0) {
    const result = maxCaseSplitDepth > 0
        ? deduceWithCaseSplit(explore, assertionSet.assertions, maxCaseSplitDepth, 0)
        : propagate(explore, assertionSet.assertions);
    return formatResult(result);
}
exports.exploreAssertions = exploreAssertions;
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
function isUndetermined(sentence, discoveries) {
    return !discoveries.some((d) => d.sentence === sentence);
}
function isNewLiteral(prop, discoveries) {
    return !discoveries.some((d) => d.sentence === prop.sentence && d.valence === prop.valence);
}
// Literals present (same sentence AND valence) in both property lists.
function intersectProperties(a, b) {
    return a.filter((pa) => b.some((pb) => pb.sentence === pa.sentence && pb.valence === pa.valence));
}
function deduceWithCaseSplit(explore, assertions, maxDepth, depth = 0) {
    var _a;
    // Start from the unit-propagation closure of the current facts.
    const base = propagate(explore, assertions);
    if (base.contradiction || depth >= maxDepth) {
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
        const candidates = [...new Set(secondaryResidues)].filter((s) => isUndetermined(s, discoveries));
        for (const sentence of candidates) {
            if (!isUndetermined(sentence, discoveries))
                continue; // determined mid-loop
            const asTrue = { sentence, valence: true };
            const asFalse = { sentence, valence: false };
            const branchTrue = deduceWithCaseSplit([...discoveries, asTrue], assertions, maxDepth, depth + 1);
            const branchFalse = deduceWithCaseSplit([...discoveries, asFalse], assertions, maxDepth, depth + 1);
            // What to add to the current facts as a result of this split.
            let forced = [];
            if (branchTrue.contradiction && branchFalse.contradiction) {
                // Neither value is viable: the current facts themselves are impossible.
                return {
                    contradiction: true,
                    contradictionSourceBeliefId: (_a = branchTrue.contradictionSourceBeliefId) !== null && _a !== void 0 ? _a : branchFalse.contradictionSourceBeliefId,
                    discoveries,
                    reasoningSteps,
                    secondaryResidues,
                };
            }
            else if (branchTrue.contradiction) {
                forced = [asFalse]; // P:true impossible => P:false forced
            }
            else if (branchFalse.contradiction) {
                forced = [asTrue]; // P:false impossible => P:true forced
            }
            else {
                // Both viable: anything true in both closures holds either way.
                forced = intersectProperties(branchTrue.discoveries, branchFalse.discoveries).filter((p) => isNewLiteral(p, discoveries));
            }
            if (forced.length === 0)
                continue;
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
exports.deduceWithCaseSplit = deduceWithCaseSplit;
//helper functions below:
function isAssertionExcluded(assertion, exploreObj) {
    return (assertion.exclude &&
        assertion.properties.every((prop) => exploreObj.some((obj) => obj.sentence === prop.sentence && obj.valence === prop.valence)));
}
function calculateResidue(assertion, exploreObj) {
    return assertion.properties.filter((prop) => !exploreObj.some((obj) => obj.sentence === prop.sentence && obj.valence === prop.valence));
}
function isNewProperty(property, exploreObj) {
    return !exploreObj.some((obj) => obj.sentence === property.sentence);
}
function calculateSecondaryResidues(residue, exploreObj) {
    return residue
        .map((obj) => obj.sentence)
        .filter((sentence) => !exploreObj.some((obj) => obj.sentence === sentence));
}
