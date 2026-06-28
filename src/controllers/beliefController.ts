import express, { Request, Response } from "express";
import {
  BeliefSet,
  AssertionSet,
  Property,
  ExploreResult,
} from "../types/interfaces";
import {
  normaliseBeliefSet,
  generateAssertions,
} from "../utils/deCheemInternalUtils";

import { exploreAssertions } from "../utils/deCheemExploreUtils";

export const returnAssertionSet = (req: Request, res: Response) => {
  try {
    const beliefSet: BeliefSet = req.body;
    const normalisedBeliefSet = normaliseBeliefSet(beliefSet);
    console.log(JSON.stringify(normalisedBeliefSet))
    const assertionSet: AssertionSet = generateAssertions(normalisedBeliefSet);
    res.json(assertionSet);
  } catch (error) {
    res
      .status(500)
      .send("An error occurred while processing the request: " + error);
  }
};

export const exploreBeliefSet = (req: Request, res: Response) => {
  try {
    const explore: Property[] = req.body.explore;

    const beliefSet: BeliefSet = req.body.beliefSet;
    // Optional reasoning-by-cases depth. 0 (default) = plain unit propagation,
    // preserving the original behaviour. Higher values enable case-split
    // deductions at the cost of more computation.
    const maxCaseSplitDepth: number = Math.max(
      0,
      Number(req.body.maxCaseSplitDepth) || 0
    );
    //Normalise to 'IF_THEN' scenarios
    const normalisedBeliefSet = normaliseBeliefSet(beliefSet);
    //Create assertions
    const assertionSet: AssertionSet = generateAssertions(normalisedBeliefSet);
    //Explore assertions using 'explore'
    const exploreResults: ExploreResult = exploreAssertions(
      explore,
      assertionSet,
      maxCaseSplitDepth
    );
    res.json(exploreResults);
  } catch (error) {
    res
      .status(500)
      .send("An error occurred while processing the request: " + error);
  }
};
