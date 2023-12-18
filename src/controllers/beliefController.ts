import express, { Request, Response } from "express";
import { BeliefSet, AssertionSet } from "../types/interfaces";
import {
  normaliseBeliefSet,
  generateAssertions,
} from "../utils/deCheemInternalUtils";

export const returnAssertionSet = (req: Request, res: Response) => {
  try {
    const beliefSet: BeliefSet = req.body;
    const normalisedBeliefSet = normaliseBeliefSet(beliefSet);
    const assertionSet: AssertionSet = generateAssertions(normalisedBeliefSet);
    res.json(assertionSet);
  } catch (error) {
    res
      .status(500)
      .send("An error occurred while processing the request: " + error);
  }
};
