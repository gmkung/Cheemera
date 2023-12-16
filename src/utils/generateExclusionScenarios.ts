// utils/generateExclusionScenarios.ts
import { Belief, Scenario } from '../types/interfaces';

export function generateExclusionScenarios(belief: Belief): Scenario[] {
    const exclusionScenarios: Scenario[] = [];
    const { scenario } = belief;

    scenario.filterPhrases.forEach((filterPhrase, i) => {
        const newScenario: Scenario = {
            type: scenario.type,
            modalPhrases: [],
            filterPhrases: [filterPhrase]
        };

        scenario.filterPhrases.forEach((fp, v) => {
            if (i !== v) {
                newScenario.modalPhrases.push({
                    modal: "Never",
                    properties: fp
                });
            }
        });

        exclusionScenarios.push(newScenario);
    });

    return exclusionScenarios;
}
