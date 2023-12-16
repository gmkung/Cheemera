import { Request, Response } from 'express';
import * from '../utils/deduplicateProperties';

export const yourControllerFunction = (req: Request, res: Response) => {
  // Use your utility functions here
  const result = someUtilityFunction(req.body);
  res.json(result);
};