import configText from "../../../../content/config.yaml?raw";
import countriesText from "../../../../content/countries.yaml?raw";
import eventsText from "../../../../content/events.yaml?raw";
import genomeText from "../../../../content/genome.yaml?raw";
import growthTreeText from "../../../../content/growth-tree.yaml?raw";
import identityText from "../../../../content/identity.yaml?raw";
import namesText from "../../../../content/names.yaml?raw";
import placesText from "../../../../content/places.yaml?raw";
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
    events: { path: "content/events.yaml", text: eventsText },
    identity: { path: "content/identity.yaml", text: identityText },
    names: { path: "content/names.yaml", text: namesText },
    places: { path: "content/places.yaml", text: placesText },
    sources: { path: "content/sources.yaml", text: sourcesText },
    config: { path: "content/config.yaml", text: configText },
  });
}
