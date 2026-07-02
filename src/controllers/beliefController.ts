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
import {
  ValidationError,
  validateBeliefSet,
  validateExplore,
  validateMaxCaseSplitDepth,
} from "../utils/validation";

function sendError(res: Response, error: unknown) {
  if (error instanceof ValidationError) {
    res.status(400).send("Invalid request: " + error.message);
  } else {
    res
      .status(500)
      .send("An error occurred while processing the request: " + error);
  }
}

export const returnAssertionSet = (req: Request, res: Response) => {
  try {
    const beliefSet: BeliefSet = validateBeliefSet(req.body);
    const normalisedBeliefSet = normaliseBeliefSet(beliefSet);
    const assertionSet: AssertionSet = generateAssertions(normalisedBeliefSet);
    res.json(assertionSet);
  } catch (error) {
    sendError(res, error);
  }
};

export const exploreBeliefSet = (req: Request, res: Response) => {
  try {
    const explore: Property[] = validateExplore(req.body.explore);
    const beliefSet: BeliefSet = validateBeliefSet(req.body.beliefSet);
    // Optional reasoning-by-cases depth. 0 (default) = plain unit propagation,
    // preserving the original behaviour. Higher values enable case-split
    // deductions; runtime is bounded by an internal compute budget rather than
    // by depth.
    const maxCaseSplitDepth: number = validateMaxCaseSplitDepth(
      req.body.maxCaseSplitDepth
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
    sendError(res, error);
  }
};
