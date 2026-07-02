"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAssertions = exports.normaliseBeliefSet = exports.breakdownBelief = exports.createAlwaysAssertions = exports.invertValences = exports.deduplicateProperties = void 0;
function deduplicateProperties(properties) {
    const seen = new Set();
    return properties.filter((p) => {
        const key = p.sentence + (p.valence ? "+" : "-");
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
exports.deduplicateProperties = deduplicateProperties;
function invertValences(properties) {
    return properties.map((property) => (Object.assign(Object.assign({}, property), { valence: !property.valence })));
}
exports.invertValences = invertValences;
function createAlwaysAssertions(filters, adjectives) {
    return adjectives.map((adj) => {
        // Create a copy of the adjective with an inverted valence
        const modifiedAdjective = Object.assign(Object.assign({}, adj), { valence: !adj.valence });
        // Combine the filters with the modified adjective
        return [...filters, modifiedAdjective];
    });
}
exports.createAlwaysAssertions = createAlwaysAssertions;
function breakdownBelief(CompoundBelief) {
    switch (CompoundBelief.scenario.type) {
        case "MUTUAL_EXCLUSION":
        //fall-through to next case
        case "MUTUAL_INCLUSION":
            const modalType = CompoundBelief.scenario.type === "MUTUAL_EXCLUSION"
                ? "Never"
                : "Always";
            const result = CompoundBelief.scenario.antecedents.map((antecedent, i) => (Object.assign(Object.assign({}, CompoundBelief), { scenario: Object.assign(Object.assign({}, CompoundBelief.scenario), { type: "IF_THEN", antecedents: [antecedent], consequences: CompoundBelief.scenario.antecedents
                        .filter((_, v) => i !== v)
                        .map((fp) => ({ modal: modalType, properties: fp })) }) })));
            return result;
        case "IF_THEN":
            return [CompoundBelief];
        default:
            // Fail loudly instead of silently dropping unrecognised scenario types,
            // which would otherwise yield an empty assertion set and misleading
            // "everything is possible" results.
            throw new Error(`Unknown scenario type "${CompoundBelief.scenario.type}" in belief "${CompoundBelief.beliefUniqueId}"`);
    }
}
exports.breakdownBelief = breakdownBelief;
function normaliseBeliefSet(beliefSet) {
    return Object.assign(Object.assign({}, beliefSet), { beliefs: beliefSet.beliefs.flatMap(breakdownBelief) });
}
exports.normaliseBeliefSet = normaliseBeliefSet;
function generateAssertions(beliefSet) {
    let assertionSet = { assertions: [] };
    beliefSet.beliefs.forEach((belief) => {
        if (belief.scenario.type === "IF_THEN") {
            belief.scenario.antecedents.forEach((antecedent) => {
                belief.scenario.consequences.forEach((consequence) => {
                    if (consequence.modal === "Always") {
                        let toExclude = createAlwaysAssertions(antecedent, 
                        // Drop a consequence only when it is an exact tautology of an
                        // antecedent (same sentence AND valence). Matching on sentence
                        // alone would wrongly discard opposite-valence consequences such
                        // as "if S then always not-S", losing a real deduction.
                        consequence.properties.filter((obj) => !antecedent.some((fp) => fp.sentence === obj.sentence && fp.valence === obj.valence)));
                        toExclude.forEach((item) => {
                            let assertObj = {
                                properties: deduplicateProperties(item),
                                sourceBeliefId: belief.beliefUniqueId,
                            };
                            assertionSet.assertions.push(assertObj);
                        });
                    }
                    else if (consequence.modal === "Never") {
                        let assertObj = {
                            properties: deduplicateProperties(antecedent.concat(consequence.properties)),
                            sourceBeliefId: belief.beliefUniqueId,
                        };
                        assertionSet.assertions.push(assertObj);
                    }
                    else {
                        // Fail loudly instead of silently dropping the rule, which would
                        // make its scenario look permissible.
                        throw new Error(`Unknown modal "${consequence.modal}" in belief "${belief.beliefUniqueId}"`);
                    }
                });
            });
        }
    });
    // An empty assertion would be vacuously matched by every explore, marking
    // everything impossible. Reachable only via degenerate beliefs (e.g. empty
    // antecedent group with an empty Never consequence), so treat it as input
    // corruption rather than a valid nogood.
    for (const assertion of assertionSet.assertions) {
        if (assertion.properties.length === 0) {
            throw new Error(`Belief "${assertion.sourceBeliefId}" compiles to an empty assertion (no properties); ` +
                `check for empty antecedent and consequence combinations`);
        }
    }
    return assertionSet;
}
exports.generateAssertions = generateAssertions;
