import { mapSettings } from "../map/model";
import { sim } from "../worker/client";
import { createGameStore } from "./create-game-store";

export const useGameStore = createGameStore(sim, mapSettings.historyLimit);
