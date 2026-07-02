"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exploreBeliefSet = exports.returnAssertionSet = void 0;
const deCheemInternalUtils_1 = require("../utils/deCheemInternalUtils");
const deCheemExploreUtils_1 = require("../utils/deCheemExploreUtils");
const validation_1 = require("../utils/validation");
function sendError(res, error) {
    if (error instanceof validation_1.ValidationError) {
        res.status(400).send("Invalid request: " + error.message);
    }
    else {
        res
            .status(500)
            .send("An error occurred while processing the request: " + error);
    }
}
const returnAssertionSet = (req, res) => {
    try {
        const beliefSet = (0, validation_1.validateBeliefSet)(req.body);
        const normalisedBeliefSet = (0, deCheemInternalUtils_1.normaliseBeliefSet)(beliefSet);
        const assertionSet = (0, deCheemInternalUtils_1.generateAssertions)(normalisedBeliefSet);
        res.json(assertionSet);
    }
    catch (error) {
        sendError(res, error);
    }
};
exports.returnAssertionSet = returnAssertionSet;
const exploreBeliefSet = (req, res) => {
    try {
        const explore = (0, validation_1.validateExplore)(req.body.explore);
        const beliefSet = (0, validation_1.validateBeliefSet)(req.body.beliefSet);
        // Optional reasoning-by-cases depth. 0 (default) = plain unit propagation,
        // preserving the original behaviour. Higher values enable case-split
        // deductions; runtime is bounded by an internal compute budget rather than
        // by depth.
        const maxCaseSplitDepth = (0, validation_1.validateMaxCaseSplitDepth)(req.body.maxCaseSplitDepth);
        //Normalise to 'IF_THEN' scenarios
        const normalisedBeliefSet = (0, deCheemInternalUtils_1.normaliseBeliefSet)(beliefSet);
        //Create assertions
        const assertionSet = (0, deCheemInternalUtils_1.generateAssertions)(normalisedBeliefSet);
        //Explore assertions using 'explore'
        const exploreResults = (0, deCheemExploreUtils_1.exploreAssertions)(explore, assertionSet, maxCaseSplitDepth);
        res.json(exploreResults);
    }
    catch (error) {
        sendError(res, error);
    }
};
exports.exploreBeliefSet = exploreBeliefSet;
