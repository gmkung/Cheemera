"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exploreBeliefSet = exports.returnAssertionSet = void 0;
const deCheemInternalUtils_1 = require("../utils/deCheemInternalUtils");
const deCheemExploreUtils_1 = require("../utils/deCheemExploreUtils");
const returnAssertionSet = (req, res) => {
    try {
        const beliefSet = req.body;
        const normalisedBeliefSet = (0, deCheemInternalUtils_1.normaliseBeliefSet)(beliefSet);
        console.log(JSON.stringify(normalisedBeliefSet));
        const assertionSet = (0, deCheemInternalUtils_1.generateAssertions)(normalisedBeliefSet);
        res.json(assertionSet);
    }
    catch (error) {
        res
            .status(500)
            .send("An error occurred while processing the request: " + error);
    }
};
exports.returnAssertionSet = returnAssertionSet;
const exploreBeliefSet = (req, res) => {
    try {
        const explore = req.body.explore;
        const beliefSet = req.body.beliefSet;
        //Normalise to 'LET' scenarios
        const normalisedBeliefSet = (0, deCheemInternalUtils_1.normaliseBeliefSet)(beliefSet);
        //Create assertions
        const assertionSet = (0, deCheemInternalUtils_1.generateAssertions)(normalisedBeliefSet);
        //Explore assertions using 'explore'
        const exploreResults = (0, deCheemExploreUtils_1.exploreAssertions)(explore, assertionSet);
        res.json(exploreResults);
    }
    catch (error) {
        res
            .status(500)
            .send("An error occurred while processing the request: " + error);
    }
};
exports.exploreBeliefSet = exploreBeliefSet;
