// Deterministic property/regression suite for the deCheem engine.
// Run with `yarn test` (builds first) or `node test/engine.test.js` against an
// existing build in dist/. Exits non-zero on any failure.
const {
  generateAssertions,
  normaliseBeliefSet,
} = require("../dist/utils/deCheemInternalUtils.js");
const { exploreAssertions, propagate } = require("../dist/utils/deCheemExploreUtils.js");

let pass = 0,
  fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log("  FAIL:", name, extra !== undefined ? JSON.stringify(extra) : "");
  }
}
const P = (sentence, valence = true) => ({ sentence, valence });
function ifThen(id, antecedent, consequenceProps, modal = "Always") {
  return {
    beliefUniqueId: id,
    originatingRuleSystemName: "t",
    originatingRuleSystemUuid: "u",
    scenario: {
      type: "IF_THEN",
      antecedents: [antecedent],
      consequences: [{ modal, properties: consequenceProps }],
    },
  };
}
function bs(beliefs) {
  return {
    beliefs,
    beliefSetName: "t",
    beliefSetOwner: "t",
    beliefSetVersion: "1",
    blindReferenceExternalIdArray: [],
  };
}
const deduced = (r) => r.results.reasoningSteps.flatMap((s) => s.deducedProperty || []);
const has = (props, s, v) => props.some((p) => p.sentence === s && p.valence === v);

// 1. Explicit forward deduction: A & B -> C, D
{
  const a = generateAssertions(normaliseBeliefSet(bs([ifThen("r1", [P("A"), P("B")], [P("C"), P("D")])])));
  const r = exploreAssertions([P("A"), P("B")], a);
  check("1: possible", r.results.possible === true);
  check("1: C deduced", has(deduced(r), "C", true));
  check("1: D deduced", has(deduced(r), "D", true));
}

// 2. Implicit contrapositive: A & B -> C ; explore A, not-C => not-B
{
  const a = generateAssertions(normaliseBeliefSet(bs([ifThen("r1", [P("A"), P("B")], [P("C")])])));
  const r = exploreAssertions([P("A"), P("C", false)], a);
  check("2: B deduced false", has(deduced(r), "B", false), deduced(r));
}

// 3. Multi-pass chain: A->B, B->C ; explore A => B and C
{
  const a = generateAssertions(normaliseBeliefSet(bs([ifThen("r1", [P("A")], [P("B")]), ifThen("r2", [P("B")], [P("C")])])));
  const r = exploreAssertions([P("A")], a);
  check("3: B deduced", has(deduced(r), "B", true));
  check("3: C deduced (2nd pass)", has(deduced(r), "C", true));
}

// 4. Contradiction (Never): A & B impossible
{
  const a = generateAssertions(normaliseBeliefSet(bs([ifThen("r1", [P("A")], [P("B")], "Never")])));
  const r = exploreAssertions([P("A"), P("B")], a);
  check("4: impossible", r.results.possible === false);
  check("4: contradiction names belief", r.results.reasoningSteps.some((s) => s.sourceBeliefId === "r1" && !s.deducedProperty));
}

// 5. Stuck case -> secondary residues, no false deduction, deduped
{
  const a = generateAssertions(normaliseBeliefSet(bs([ifThen("r1", [P("A"), P("B")], [P("C")])])));
  const r = exploreAssertions([P("A")], a);
  check("5: nothing deduced", deduced(r).length === 0, deduced(r));
  check("5: secondary residues present", r.results.arrayOfSecondaryResidues.length > 0);
  check("5: secondary residues deduped", new Set(r.results.arrayOfSecondaryResidues).size === r.results.arrayOfSecondaryResidues.length);
}

// 6. Purity / reentrancy: same assertionSet explored twice => identical, inputs untouched
{
  const a = generateAssertions(normaliseBeliefSet(bs([ifThen("r1", [P("A")], [P("B")]), ifThen("r2", [P("B")], [P("C")])])));
  const lenBefore = a.assertions.length;
  const explore = [P("A")];
  const exploreCopy = JSON.stringify(explore);
  const r1 = exploreAssertions(explore, a);
  const r2 = exploreAssertions(explore, a);
  check("6: assertionSet not mutated", a.assertions.length === lenBefore);
  check("6: explore not mutated", JSON.stringify(explore) === exploreCopy);
  check("6: second run identical", JSON.stringify(r1) === JSON.stringify(r2));
}

// 7. Rule-order agnostic
{
  const fwd = bs([ifThen("r1", [P("A")], [P("B")]), ifThen("r2", [P("B")], [P("C")])]);
  const rev = bs([ifThen("r2", [P("B")], [P("C")]), ifThen("r1", [P("A")], [P("B")])]);
  const df = deduced(exploreAssertions([P("A")], generateAssertions(normaliseBeliefSet(fwd)))).map((p) => p.sentence + ":" + p.valence).sort();
  const dr = deduced(exploreAssertions([P("A")], generateAssertions(normaliseBeliefSet(rev)))).map((p) => p.sentence + ":" + p.valence).sort();
  check("7: order-agnostic deductions", JSON.stringify(df) === JSON.stringify(dr), { df, dr });
}

// 8. Unknown scenario type throws
{
  const bad = {
    beliefUniqueId: "x",
    originatingRuleSystemName: "t",
    originatingRuleSystemUuid: "u",
    scenario: { type: "LET", antecedents: [[P("A")]], consequences: [{ modal: "Always", properties: [P("B")] }] },
  };
  let threw = false,
    msg = "";
  try {
    normaliseBeliefSet(bs([bad]));
  } catch (e) {
    threw = true;
    msg = e.message;
  }
  check("8: throws on unknown type", threw, msg);
  check("8: message names type+belief", /LET/.test(msg) && /x/.test(msg), msg);
}

// 9. Bug regression: "if S then always not-S" => S impossible
{
  const a = generateAssertions(normaliseBeliefSet(bs([ifThen("r1", [P("S")], [P("S", false)], "Always")])));
  const r = exploreAssertions([P("S")], a);
  check("9: S impossible", r.results.possible === false);
}

// 10. propagate() low-level contract
{
  const a = generateAssertions(normaliseBeliefSet(bs([ifThen("r1", [P("A")], [P("B")])])));
  const res = propagate([P("A")], a.assertions);
  check("10: no contradiction", res.contradiction === false);
  check("10: B discovered", has(res.discoveries, "B", true), res.discoveries);
  check("10: keeps original A", has(res.discoveries, "A", true));
}

console.log(`engine.test.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
