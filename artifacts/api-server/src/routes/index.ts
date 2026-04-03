import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import storiesRouter from "./stories";
import projectsRouter from "./projects";
import voicesRouter from "./voices";
import invitesRouter from "./invites";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(storiesRouter);
router.use(projectsRouter);
router.use(voicesRouter);
router.use(invitesRouter);

export default router;
