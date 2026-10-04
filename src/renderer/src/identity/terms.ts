import { useTranslation } from "react-i18next";
import type { SportTerms } from "../../../sim";

type Kind = keyof SportTerms;

/** The plain terms, for text shown before a campaign exists. */
export const PLAIN_TERMS: SportTerms = { score: "score", match: "match", season: "season" };

/**
 * The sport's own nouns for a score, a match and a season (GDD v1.18), for interpolating into
 * complete templates: `noun("score", 3)` is "goals" for a sport that calls a score a goal.
 */
export function useTerms(terms: SportTerms) {
  const { t } = useTranslation();
  const key = (kind: Kind) => `identity.terms.${kind}.${terms[kind]}`;
  return {
    noun: (kind: Kind, count = 1) => t(key(kind), { count }),
    title: (kind: Kind) => t(`${key(kind)}_title`),
    titlePlural: (kind: Kind) => t(`${key(kind)}_titlePlural`),
  };
}

/**
 * Every noun variable the league's templates use, in the right number: `score` and `match` are the
 * counts the nouns describe, `seasons` the number of seasons (plural unless 1).
 */
export function useTermVars(terms: SportTerms) {
  const { noun, title } = useTerms(terms);
  return (counts: { score?: number; match?: number; seasons?: number } = {}) => ({
    seasonNoun: noun("season", 1),
    SeasonNoun: title("season"),
    seasonsNoun: noun("season", counts.seasons ?? 2),
    matchOne: noun("match", 1),
    matchNoun: noun("match", counts.match ?? 2),
    matchesNoun: noun("match", 2),
    scoreNoun: noun("score", counts.score ?? 2),
    scoresNoun: noun("score", 2),
  });
}
