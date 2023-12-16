// types.ts

export interface Property {
    valence: boolean;
    sentence: string;
}

export interface ModalPhrase {
    modal: string;
    properties: Property[];
}

export interface Scenario {
    type: string;
    modalPhrases: ModalPhrase[];
    filterPhrases: Property[][];
}

export interface Belief {
    scenario: Scenario;
    beliefUniqueId: string;
    originatingRuleSystemName: string;
    originatingRuleSystemUuid: string;
}

export interface BeliefSet {
    beliefs: Belief[];
    beliefSetName: string;
    beliefSetOwner: string;
    beliefSetVersion: string;
    blindReferenceExternalIdArray: any[]; // Replace 'any' with a more specific type if possible
}
