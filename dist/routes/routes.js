"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const beliefController_1 = require("../controllers/beliefController");
const router = express_1.default.Router();
router.post("/returnAssertionSet", beliefController_1.returnAssertionSet);
router.post("/exploreBeliefSet", beliefController_1.exploreBeliefSet);
exports.default = router;
