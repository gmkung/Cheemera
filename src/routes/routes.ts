import express from "express";
import { returnAssertionSet } from "../controllers/beliefController";

const router = express.Router();

router.get("/returnAssertionSet", returnAssertionSet);

export default router;
