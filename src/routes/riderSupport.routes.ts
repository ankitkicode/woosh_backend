import { Router } from 'express';
import { createRiderSupport } from '../controllers/riderSupport.controller';

const router = Router();

router.post('/', createRiderSupport);

export default router;
