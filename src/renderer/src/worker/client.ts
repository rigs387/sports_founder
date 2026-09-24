import { wrap } from "comlink";
import type { SimWorkerApi } from "./api";

const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });

/** Calls into the simulation worker. Every call is async because it crosses a thread boundary. */
export const sim = wrap<SimWorkerApi>(worker);
