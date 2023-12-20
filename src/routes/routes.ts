import express from "express";
import {
  returnAssertionSet,
  exploreBeliefSet,
} from "../controllers/beliefController";

const router = express.Router();

router.use("/static", express.static("public"));
router.post("/returnAssertionSet", returnAssertionSet);
router.post("/exploreBeliefSet", exploreBeliefSet);

export default router;
