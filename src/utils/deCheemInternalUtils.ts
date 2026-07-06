import {
  ScenarioType,
  Belief,
  ModalType,
  BeliefSet,
  Consequence,
  Property,
  AssertionSet,
  Assertion,
} from "../types/interfaces";

export function deduplicateProperties(properties: Property[]): Property[] {
  const seen = new Set<string>();
  return properties.filter((p) => {
    const key = p.sentence + (p.valence ? "+" : "-");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function invertValences(properties: Property[]): Property[] {
  return properties.map((property) => ({
    ...property,
    valence: !property.valence,
  }));
}

export function createAlwaysAssertions(
  filters: Property[],
  adjectives: Property[]
): Property[][] {
  return adjectives.map((adj) => {
    // Create a copy of the adjective with an inverted valence
    const modifiedAdjective = { ...adj, valence: !adj.valence };
    // Combine the filters with the modified adjective
    return [...filters, modifiedAdjective];
  });
}

export function breakdownBelief(CompoundBelief: Belief): Belief[] {
  switch (CompoundBelief.scenario.type) {
    case "MUTUAL_EXCLUSION":
    //fall-through to next case
    case "MUTUAL_INCLUSION":
      const modalType =
        CompoundBelief.scenario.type === "MUTUAL_EXCLUSION"
          ? "Never"
          : ("Always" as ModalType);
      const result = CompoundBelief.scenario.antecedents.map(
        (antecedent, i) => ({
          ...CompoundBelief,
          scenario: {
            ...CompoundBelief.scenario,
            type: "IF_THEN" as ScenarioType,
            antecedents: [antecedent],
            consequences: CompoundBelief.scenario.antecedents
              .filter((_, v) => i !== v)
              .map(
                (fp) => ({ modal: modalType, properties: fp } as Consequence)
              ),
          },
        })
      );
      return result;
    case "IF_THEN":
      return [CompoundBelief];
    default:
      // Fail loudly instead of silently dropping unrecognised scenario types,
      // which would otherwise yield an empty assertion set and misleading
      // "everything is possible" results.
      throw new Error(
        `Unknown scenario type "${CompoundBelief.scenario.type}" in belief "${CompoundBelief.beliefUniqueId}"`
      );
  }
}

export function normaliseBeliefSet(beliefSet: BeliefSet): BeliefSet {
  return {
    ...beliefSet,
    beliefs: beliefSet.beliefs.flatMap(breakdownBelief),
  };
}

export function generateAssertions(beliefSet: BeliefSet): AssertionSet {
  let assertionSet: AssertionSet = { assertions: [] };

  beliefSet.beliefs.forEach((belief: Belief) => {
    if (belief.scenario.type === "IF_THEN") {
      belief.scenario.antecedents.forEach((antecedent: Property[]) => {
        belief.scenario.consequences.forEach((consequence) => {
          if (consequence.modal === "Always") {
            let toExclude = createAlwaysAssertions(
              antecedent,
              // Drop a consequence only when it is an exact tautology of an
              // antecedent (same sentence AND valence). Matching on sentence
              // alone would wrongly discard opposite-valence consequences such
              // as "if S then always not-S", losing a real deduction.
              consequence.properties.filter(
                (obj) =>
                  !antecedent.some(
                    (fp) =>
                      fp.sentence === obj.sentence && fp.valence === obj.valence
                  )
              )
            );
            toExclude.forEach((item: Property[]) => {
              let assertObj: Assertion = {
                properties: deduplicateProperties(item),
                sourceBeliefId: belief.beliefUniqueId,
              };
              assertionSet.assertions.push(assertObj);
            });
          } else if (consequence.modal === "Never") {
            let assertObj: Assertion = {
              properties: deduplicateProperties(
                antecedent.concat(consequence.properties)
              ),
              sourceBeliefId: belief.beliefUniqueId,
            };
            assertionSet.assertions.push(assertObj);
          } else {
            // Fail loudly instead of silently dropping the rule, which would
            // make its scenario look permissible.
            throw new Error(
              `Unknown modal "${consequence.modal}" in belief "${belief.beliefUniqueId}"`
            );
          }
        });
      });
    }
  });

  // An empty assertion would be vacuously matched by every explore, marking
  // everything impossible. Reachable only via degenerate beliefs (e.g. empty
  // antecedent group with an empty Never consequence), so treat it as input
  // corruption rather than a valid nogood.
  for (const assertion of assertionSet.assertions) {
    if (assertion.properties.length === 0) {
      throw new Error(
        `Belief "${assertion.sourceBeliefId}" compiles to an empty assertion (no properties); ` +
          `check for empty antecedent and consequence combinations`
      );
    }
  }

  return assertionSet;
}
