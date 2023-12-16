"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.yourControllerFunction = void 0;
const utility_1 = require("../utils/utility");
const yourControllerFunction = (req, res) => {
    // Use your utility functions here
    const result = (0, utility_1.someUtilityFunction)(req.body);
    res.json(result);
};
exports.yourControllerFunction = yourControllerFunction;
