import { setDollarsPerCash } from "../i18n";
import { mapSettings } from "../map/model";
import { sim } from "../worker/client";
import { createGameStore } from "./create-game-store";

export const useGameStore = createGameStore(sim, mapSettings.historyLimit, window.saveFiles);

// Money strings read the dollar rate from the snapshot (GDD v1.34). Zustand calls this as the
// snapshot is set, before React renders it.
useGameStore.subscribe((state) => {
  if (state.snapshot) setDollarsPerCash(state.snapshot.dollarsPerCash);
});
