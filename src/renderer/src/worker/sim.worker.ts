import { expose } from "comlink";
import { createSimWorkerApi } from "./api";
import { loadBundledWorld } from "./bundled-content";

// The simulation runs here, off the UI thread. The UI calls these functions through Comlink and
// receives plain snapshots after each action or turn.

expose(createSimWorkerApi(loadBundledWorld()));
