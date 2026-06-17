import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import broadcastersRouter from "./broadcasters";
import broadcastsRouter from "./broadcasts";
import recordingsRouter from "./recordings";
import statsRouter from "./stats";
import storageRouter from "./storage";
import commentsRouter from "./comments";
import transcriptionRouter from "./transcription";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(broadcastersRouter);
router.use(broadcastsRouter);
router.use(recordingsRouter);
router.use(statsRouter);
router.use(storageRouter);
router.use(commentsRouter);
router.use(transcriptionRouter);
router.use(adminRouter);

export default router;
