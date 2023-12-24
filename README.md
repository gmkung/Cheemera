The repo of the Cheemera Service, an Express app that serves a Typescript implementation of the deCheem inference engine. 

## Structure:
The structure of the various entities in deCheem are defined in /src/types/interfaces.ts.
Basically, systems of thought and beliefs are represented by Belief Sets. Each Belief Set is a collection of Beliefs, which are made up of antecedents (basically IFs) and consequences (THENs).  

An Explore is a question made up of a set of properties, and can be used to explore a Belief Set to find out what the consequences are of these starting points.
Beliefs are transposed and broken down into its underlying assertions, which are used to compute the implications and deductions of the starting point.

For examples on how to structure beliefs, refer to this [doc](https://joyous-talos-902.notion.site/Cheemera-belief-structuring-examples-7a5810796cd342e2a77be5694cc94ebd?pvs=4).

## Functionalities
The deCheem inference engine is able to make both explicit and implicit deductions, which is a big distinction from other logic programming frameworks.

For example, consider this rule "_If A and B are true, then C and D must be true._"

When A and B are true, deCheem will of course be able to deduce that C and D are true.
But when exploring the situation when C is not true and A is, it will also be able to deduce that B cannot be true (an implicit deduction). 

It can do this for tens of thousands of rules on consumer hardware in a second, and potentially even more with more efficient implementations of the engine in the future.

It is also:
* Rule-sequence agnostic
* Back-chaining and forward-chaining are both supported (in deCheem is a matter of semantics)
* Allows for reasoning across any number of domains and languages (due to it not depending on (data)types or predefined data structures), working just with human language. Basically anything that is a 'string' can be put in a Belief.

## Instructions:
- /exploreBeliefSet: THe primary endpoint to use. takes in an Explore and a Belief Set, and returns deductions and reasoning steps for the Explore.
- /returnAssertionSet: this is more for troubleshooting, and returns the intermediate assertion set used to perform the exploration.

Implementations:
- A basic Heroku deployment of this Cheemera Service can be accessed at https://cheemera-8cd49e85c8f5.herokuapp.com. 
- [Cheemera](https://chat.openai.com/g/g-7JIMFzSAI-cheemera), the Custom GPT that extends ChatGPT's capabilities with the deCheem inference engine.
- Postman example of how to use the Cheemera backend service can be found in /public
