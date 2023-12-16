import express from 'express';
import { yourControllerFunction } from '../controllers/controller';

const router = express.Router();

router.get('/some-endpoint', yourControllerFunction);

export default router;