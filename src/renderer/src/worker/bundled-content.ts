import configText from "../../../../content/config.yaml?raw";
import countriesText from "../../../../content/countries.yaml?raw";
import genomeText from "../../../../content/genome.yaml?raw";
import growthTreeText from "../../../../content/growth-tree.yaml?raw";
import namesText from "../../../../content/names.yaml?raw";
import sourcesText from "../../../../content/sources.yaml?raw";
import sportsText from "../../../../content/sports.yaml?raw";
import { loadWorld, type World } from "../../../content";

/** Browser host: content YAML is bundled into the worker at build time, then validated at load. */
export function loadBundledWorld(): World {
  return loadWorld({
    countries: { path: "content/countries.yaml", text: countriesText },
    sports: { path: "content/sports.yaml", text: sportsText },
    genome: { path: "content/genome.yaml", text: genomeText },
    growthTree: { path: "content/growth-tree.yaml", text: growthTreeText },
    names: { path: "content/names.yaml", text: namesText },
    sources: { path: "content/sources.yaml", text: sourcesText },
    config: { path: "content/config.yaml", text: configText },
  });
}
