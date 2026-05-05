import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import broadcastersRouter from "./broadcasters";
import broadcastsRouter from "./broadcasts";
import recordingsRouter from "./recordings";
import statsRouter from "./stats";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(broadcastersRouter);
router.use(broadcastsRouter);
router.use(recordingsRouter);
router.use(statsRouter);
router.use(storageRouter);

export default router;
