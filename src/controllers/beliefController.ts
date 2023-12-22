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
    //Normalise to 'LET' scenarios
    const normalisedBeliefSet = normaliseBeliefSet(beliefSet);
    //Create assertions
    const assertionSet: AssertionSet = generateAssertions(normalisedBeliefSet);
    //Explore assertions using 'explore'
    const exploreResults: ExploreResult = exploreAssertions(
      explore,
      assertionSet
    );
    res.json(exploreResults);
  } catch (error) {
    res
      .status(500)
      .send("An error occurred while processing the request: " + error);
  }
};
