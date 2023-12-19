"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAssertions = exports.normaliseBeliefSet = exports.breakdownBelief = exports.createAlwaysAssertions = exports.invertValences = exports.deduplicateProperties = void 0;
const lodash_1 = __importDefault(require("lodash"));
function deduplicateProperties(properties) {
    return lodash_1.default.uniqWith(properties, (a, b) => {
        return a.sentence === b.sentence && a.valence === b.valence;
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
            const result = CompoundBelief.scenario.filterPhrases.map((filterPhrase, i) => (Object.assign(Object.assign({}, CompoundBelief), { scenario: Object.assign(Object.assign({}, CompoundBelief.scenario), { type: "LET", filterPhrases: [filterPhrase], modalPhrases: CompoundBelief.scenario.filterPhrases
                        .filter((_, v) => i !== v)
                        .map((fp) => ({ modal: modalType, properties: fp })) }) })));
            return result;
        default:
            return [CompoundBelief];
    }
}
exports.breakdownBelief = breakdownBelief;
function normaliseBeliefSet(beliefSet) {
    let normalisedBeliefSet = {
        beliefs: [],
        beliefSetName: beliefSet.beliefSetName,
        beliefSetOwner: beliefSet.beliefSetOwner,
        beliefSetVersion: beliefSet.beliefSetVersion,
        blindReferenceExternalIdArray: beliefSet.blindReferenceExternalIdArray,
    };
    for (let i = 0; i < beliefSet.beliefs.length; i++) {
        const currentBelief = beliefSet.beliefs[i];
        const type = currentBelief.scenario.type;
        if (type === "LET") {
            normalisedBeliefSet.beliefs.push(currentBelief);
        }
        else if (type === "MUTUAL_EXCLUSION" || type === "MUTUAL_INCLUSION") {
            normalisedBeliefSet.beliefs = normalisedBeliefSet.beliefs.concat(breakdownBelief(currentBelief));
        }
    }
    return normalisedBeliefSet;
}
exports.normaliseBeliefSet = normaliseBeliefSet;
function generateAssertions(beliefSet) {
    let assertionSet = { assertions: [] };
    beliefSet.beliefs.forEach((belief) => {
        if (belief.scenario.type === "LET") {
            belief.scenario.filterPhrases.forEach((filterPhrase) => {
                belief.scenario.modalPhrases.forEach((modalPhrase) => {
                    if (modalPhrase.modal === "Always") {
                        let toExclude = createAlwaysAssertions(filterPhrase, modalPhrase.properties.filter((obj) => !filterPhrase.map((fp) => fp.sentence).includes(obj.sentence)));
                        toExclude.forEach((item) => {
                            let assertObj = {
                                exclude: true, //Always set to exclude. This line can be removed in the future to speed up the program, as I'm not generating 'possible' cases anymore to save memory.
                                properties: item,
                                sourceBeliefId: belief.beliefUniqueId,
                            };
                            assertionSet.assertions.push(assertObj);
                        });
                    }
                    else if (modalPhrase.modal === "Never") {
                        let assertObj = {
                            exclude: true, //Always set to exclude. This line can be removed in the future to speed up the program, as I'm not generating 'possible' cases anymore to save memory.
                            properties: filterPhrase.concat(modalPhrase.properties),
                            sourceBeliefId: belief.beliefUniqueId,
                        };
                        assertionSet.assertions.push(assertObj);
                    }
                });
            });
        }
    });
    return assertionSet;
}
exports.generateAssertions = generateAssertions;
