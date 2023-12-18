//1. interfaces for structuring beliefs and assertions
export interface Property {
  valence: boolean;
  sentence: string;
}

export interface ModalPhrase {
  modal: string;
  properties: Property[];
}

export interface Scenario {
  // previously a 'Case'
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
  //previously a 'beliefBase'
  beliefs: Belief[];
  beliefSetName: string;
  beliefSetOwner: string;
  beliefSetVersion: string;
  blindReferenceExternalIdArray: any[]; // Replace 'any' with a more specific type if possible
}

export interface Assertion {
  exclude: boolean;
  properties: Property[];
  sourceBeliefId?: string;
}

export interface AssertionSet {
  assertions: Assertion[];
}


//Below are explore specific.
export interface ExploreResult {
    resultCode: string;
    resultReason: string;
    results: {
        possible: boolean;
        reasoningSteps: ReasoningStep[];
        arrayOfSecondaryResidues: string[];
    };
}

export interface ReasoningStep {
    deducedProperty?: Property[];
    inferenceStepType: string;
    sourceBeliefId?: string;
}