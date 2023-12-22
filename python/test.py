import json
from typing import NamedTuple, List
from Cheemera import *


# Function to create Property instances
def create_property(data):
    return Property(valence=data['valence'], sentence=data['sentence'])

# Function to create Consequence instances
def create_consequence(data):
    return Consequence(modal=data['modal'], properties=[create_property(p) for p in data['properties']])

# Function to create Scenario instances
def create_scenario(data):
    return Scenario(
        type=data['type'],
        consequences=[create_consequence(c) for c in data['consequences']],
        antecedents=[[create_property(p) for p in antecedent] for antecedent in data['antecedents']]
    )

# Function to create Belief instances
def create_belief(data):
    return Belief(
        beliefUniqueId=data['beliefUniqueId'],
        originatingRuleSystemName=data['originatingRuleSystemName'],
        originatingRuleSystemUuid=data['originatingRuleSystemUuid'],
        scenario=create_scenario(data['scenario'])
    )

# JSON data as a string
json_data = '''
{
  "beliefSet": {
    "beliefs": [
      {
        "beliefUniqueId": "1",
        "originatingRuleSystemName": "UserQuery",
        "originatingRuleSystemUuid": "1",
        "scenario": {
          "type": "IF_THEN",
          "consequences": [
            {
              "modal": "Always",
              "properties": [
                {
                  "valence": true,
                  "sentence": "D is true"
                },
                {
                  "valence": true,
                  "sentence": "E is true"
                }
              ]
            }
          ],
          "antecedents": [
            [
              {
                "valence": true,
                "sentence": "A is true"
              },
              {
                "valence": true,
                "sentence": "B is true"
              }
            ],
            [
              {
                "valence": true,
                "sentence": "C is true"
              }
            ]
          ]
        }
      },
      {
        "beliefUniqueId": "2",
        "originatingRuleSystemName": "UserQuery",
        "originatingRuleSystemUuid": "2",
        "scenario": {
          "type": "MUTUAL_EXCLUSION",
          "consequences": [
            {
              "modal": "Always",
              "properties": [
                {
                  "valence": true,
                  "sentence": "G is true"
                }
              ]
            },
            {
              "modal": "Never",
              "properties": [
                {
                  "valence": true,
                  "sentence": "H is true"
                }
              ]
            }
          ],
          "antecedents": [
            [
              {
                "valence": true,
                "sentence": "L is true"
              }],
              [{
                "valence": true,
                "sentence": "F is true"
              }
            ]
          ]
        }
      },
      {
        "beliefUniqueId": "3",
        "originatingRuleSystemName": "UserQuery",
        "originatingRuleSystemUuid": "3",
        "scenario": {
          "type": "IF_THEN",
          "consequences": [
            {
              "modal": "Never",
              "properties": [
                {
                  "valence": true,
                  "sentence": "A is true"
                },
                {
                  "valence": true,
                  "sentence": "F is true"
                }
              ]
            }
          ],
          "antecedents": [
            [
              {
                "valence": true,
                "sentence": "B is true"
              },
              {
                "valence": true,
                "sentence": "H is true"
              }
            ]
          ]
        }
      }
    ],
    "beliefSetName": "UserQueryInference",
    "beliefSetOwner": "Cheemera",
    "beliefSetVersion": "1.0"
  },
  "explore": [
    {
      "valence": true,
      "sentence": "C is true"
    },
    {
      "valence": true,
      "sentence": "H is true"
    }
  ]
}
'''

# Parse the JSON data
parsed_data = json.loads(json_data)

# Create the BeliefSet instance
belief_set_data = parsed_data['beliefSet']
belief_set = BeliefSet(
    beliefs=[create_belief(belief) for belief in belief_set_data['beliefs']],
    beliefSetName=belief_set_data['beliefSetName'],
    beliefSetOwner=belief_set_data['beliefSetOwner'],
    beliefSetVersion=belief_set_data['beliefSetVersion'],
    blindReferenceExternalIdArray='123123123'
)

# Create the explore list
explore = [create_property(p) for p in parsed_data['explore']]

print (explore_belief_set({"explore": explore, "beliefSet": belief_set}))
# Now, 'belief_set' and 'explore' can be used as input for your exploreBeliefSet function
