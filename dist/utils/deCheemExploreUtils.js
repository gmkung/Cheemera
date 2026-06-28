"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exploreAssertions = exports.propagate = void 0;
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
function exploreAssertions(explore, assertionSet) {
    const { contradiction, contradictionSourceBeliefId, reasoningSteps, secondaryResidues } = propagate(explore, assertionSet.assertions);
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
exports.exploreAssertions = exploreAssertions;
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
