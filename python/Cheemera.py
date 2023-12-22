from typing import NamedTuple, List, Optional, Any, Dict,Set
import json
import hashlib

def explore_belief_set(request_body: Dict[str, Any]):
    try:
        explore = request_body['explore']
        belief_set = request_body['beliefSet']

        # Normalise to 'LET' scenarios
        normalised_belief_set = normalise_belief_set(belief_set)
        # Create assertions
        assertion_set = generate_assertions(normalised_belief_set)
        # Explore assertions using 'explore'
        explore_results = explore_assertions(explore, assertion_set)
        
        return explore_results
    except Exception as error:
        # Simulate a 500 response
        return f"An error occurred while processing the request: {error}"

# Define Python equivalent classes for TypeScript interfaces

class Property(NamedTuple):
    valence: bool
    sentence: str

class Consequence(NamedTuple):
    modal: str  # ModalType in TypeScript
    properties: List[Property]

class Scenario(NamedTuple):
    type: str  # ScenarioType in TypeScript
    consequences: List[Consequence]
    antecedents: List[List[Property]]

class Belief(NamedTuple):
    scenario: Scenario
    beliefUniqueId: str
    originatingRuleSystemName: str
    originatingRuleSystemUuid: str

class BeliefSet(NamedTuple):
    beliefs: List[Belief]
    beliefSetName: str
    beliefSetOwner: str
    beliefSetVersion: str
    blindReferenceExternalIdArray: List[Any]

class Assertion(NamedTuple):
    exclude: bool
    properties: List[Property]
    sourceBeliefId: Optional[str] = None

class AssertionSet(NamedTuple):
    assertions: List[Assertion]

class ReasoningStep(NamedTuple):
    inferenceStepType: str
    sourceBeliefId: Optional[str] = None
    deducedProperty: Optional[List[Property]] = None

class ExploreResult(NamedTuple):
    resultCode: str
    resultReason: str
    results: Dict[str, Any]


# Assume the invertValences function has been ported over to Python as well
def invert_valences(properties: List[Property]) -> List[Property]:
    # Implement the logic to invert valences
    pass

# Helper functions
def is_assertion_excluded(assertion: Assertion, explore_obj: List[Property]) -> bool:
    return assertion.exclude and all(
        any(obj.sentence == prop.sentence and obj.valence == prop.valence for obj in explore_obj)
        for prop in assertion.properties
    )

def calculate_residue(assertion: Assertion, explore_obj: List[Property]) -> List[Property]:
    return [prop for prop in assertion.properties if not any(
        obj.sentence == prop.sentence and obj.valence == prop.valence for obj in explore_obj
    )]

def is_new_property(property: Property, explore_obj: List[Property]) -> bool:
    return all(obj.sentence != property.sentence for obj in explore_obj)

def calculate_secondary_residues(residue: List[Property], explore_obj: List[Property]) -> List[str]:
    return [obj.sentence for obj in residue if not any(
        obj.sentence == sentence for sentence in explore_obj
    )]

# Main function
def explore_assertions(explore: List[Property], assertion_set: AssertionSet) -> ExploreResult:
    discoveries = explore.copy()

    result_obj = ExploreResult(
        resultCode="Success",
        resultReason="Successful with no errors found",
        results={
            "possible": True,
            "reasoningSteps": [],
            "arrayOfSecondaryResidues": [],
        }
    )

    turn = 1
    previous_md5 = None

    while hashlib.md5(json.dumps(discoveries, sort_keys=True).encode()).hexdigest() != previous_md5 or turn == 1:
        previous_md5 = hashlib.md5(json.dumps(discoveries, sort_keys=True).encode()).hexdigest()
        turn += 1

        for assertion in assertion_set.assertions[:]:  # Create a shallow copy to iterate over
            reasoning_step = ReasoningStep(inferenceStepType="Deductive")

            if is_assertion_excluded(assertion, discoveries):
                reasoning_step = reasoning_step._replace(sourceBeliefId=assertion.sourceBeliefId)
                result_obj.results['reasoningSteps'].append(reasoning_step)
                result_obj.results['possible'] = False
                return result_obj
            else:
                residue_obj = calculate_residue(assertion, discoveries)

                if len(residue_obj) == 1 and is_new_property(residue_obj[0], discoveries):
                    deduced = invert_valences(residue_obj)
                    reasoning_step = reasoning_step._replace(deducedProperty=deduced)
                    reasoning_step = reasoning_step._replace(sourceBeliefId=assertion.sourceBeliefId)
                    result_obj.results['reasoningSteps'].append(reasoning_step)
                    discoveries.extend(deduced)
                    assertion_set = AssertionSet(assertions=[a for a in assertion_set.assertions if a != assertion])
                else:
                    result_obj.results['arrayOfSecondaryResidues'].extend(
                        calculate_secondary_residues(residue_obj, discoveries)
                    )

    return result_obj



# Assuming Property, Belief, BeliefSet, Assertion, AssertionSet are already defined based on previous conversation

# Helper functions to replace lodash functionalities
def deduplicate_properties(properties: List[Property]) -> List[Property]:
    # Using a set comprehension to deduplicate based on a tuple of the property's attributes
    unique_properties = {prop.sentence: prop for prop in properties}.values()
    return list(unique_properties)

def invert_valences(properties: List[Property]) -> List[Property]:
    return [Property(sentence=prop.sentence, valence=not prop.valence) for prop in properties]

def create_always_assertions(filters: List[Property], adjectives: List[Property]) -> List[List[Property]]:
    return [[*filters, Property(sentence=adj.sentence, valence=not adj.valence)] for adj in adjectives]

def breakdown_belief(compound_belief: Belief) -> List[Belief]:
    if compound_belief.scenario.type in ["MUTUAL_EXCLUSION", "MUTUAL_INCLUSION"]:
        modal_type = "Never" if compound_belief.scenario.type == "MUTUAL_EXCLUSION" else "Always"
        return [
            Belief(
                scenario=Scenario(
                    type="IF_THEN",
                    consequences=[
                        Consequence(modal=modal_type, properties=fp) 
                        for j, fp in enumerate(compound_belief.scenario.antecedents) if i != j
                    ],
                    antecedents=[antecedent]
                ),
                beliefUniqueId=compound_belief.beliefUniqueId,
                originatingRuleSystemName=compound_belief.originatingRuleSystemName,
                originatingRuleSystemUuid=compound_belief.originatingRuleSystemUuid,
            )
            for i, antecedent in enumerate(compound_belief.scenario.antecedents)
        ]
    else:
        return [compound_belief]

def normalise_belief_set(belief_set: BeliefSet) -> BeliefSet:
    normalised_beliefs = []
    for belief in belief_set.beliefs:
        if belief.scenario.type == "IF_THEN":
            normalised_beliefs.append(belief)
        elif belief.scenario.type in ["MUTUAL_EXCLUSION", "MUTUAL_INCLUSION"]:
            normalised_beliefs.extend(breakdown_belief(belief))
    
    return BeliefSet(
        beliefs=normalised_beliefs,
        beliefSetName=belief_set.beliefSetName,
        beliefSetOwner=belief_set.beliefSetOwner,
        beliefSetVersion=belief_set.beliefSetVersion,
        blindReferenceExternalIdArray=belief_set.blindReferenceExternalIdArray,
    )

def generate_assertions(belief_set: BeliefSet) -> AssertionSet:
    assertions = []
    for belief in belief_set.beliefs:
        if belief.scenario.type == "IF_THEN":
            for antecedent in belief.scenario.antecedents:
                for consequence in belief.scenario.consequences:
                    if consequence.modal == "Always":
                        to_exclude = create_always_assertions(
                            antecedent,
                            [prop for prop in consequence.properties if prop.sentence not in {fp.sentence for fp in antecedent}]
                        )
                        for item in to_exclude:
                            assertions.append(Assertion(exclude=True, properties=item, sourceBeliefId=belief.beliefUniqueId))
                    elif consequence.modal == "Never":
                        assertions.append(Assertion(
                            exclude=True,
                            properties=antecedent + consequence.properties,
                            sourceBeliefId=belief.beliefUniqueId
                        ))
    return AssertionSet(assertions=assertions)