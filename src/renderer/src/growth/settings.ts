import text from "../../../../content/growth-view.yaml?raw";
import { parseGrowthView } from "./model";

export const growthView = parseGrowthView(text);
