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

// 11. Case-split "Z either way": (A -> Z) and (not-A -> Z) entail Z
{
  const beliefs = [
    ifThen("r1", [P("A")], [P("Z")]),
    ifThen("r2", [P("A", false)], [P("Z")]),
  ];
  const a = generateAssertions(normaliseBeliefSet(bs(beliefs)));
  const noSplit = exploreAssertions([], a, 0);
  const withSplit = exploreAssertions([], a, 1);
  check("11: depth 0 does NOT deduce Z", !has(deduced(noSplit), "Z", true));
  check("11: depth 1 deduces Z", has(deduced(withSplit), "Z", true), deduced(withSplit));
  check("11: Z step marked CaseSplit", withSplit.results.reasoningSteps.some((s) => s.inferenceStepType === "CaseSplit" && (s.deducedProperty || []).some((p) => p.sentence === "Z")));
  check("11: still possible", withSplit.results.possible === true);
}

// 12. Failed-literal: (A -> C) and (A -> not-C) make A impossible => deduce not-A
{
  const beliefs = [
    ifThen("r1", [P("A")], [P("C")]),
    ifThen("r2", [P("A")], [P("C", false)]),
  ];
  const a = generateAssertions(normaliseBeliefSet(bs(beliefs)));
  const r = exploreAssertions([], a, 1);
  check("12: deduces not-A", has(deduced(r), "A", false), deduced(r));
}

// 13. maxDepth 0 path is identical to the default (no-arg) call
{
  const beliefs = [ifThen("r1", [P("A")], [P("B")]), ifThen("r2", [P("A", false)], [P("Z")])];
  const a = generateAssertions(normaliseBeliefSet(bs(beliefs)));
  const def = exploreAssertions([P("A")], a);
  const zero = exploreAssertions([P("A")], a, 0);
  check("13: depth 0 == default", JSON.stringify(def) === JSON.stringify(zero));
}

// ---------------------------------------------------------------------------
// Input-hole regressions
// ---------------------------------------------------------------------------
const {
  ValidationError,
  validateExplore,
  validateBeliefSet,
  validateMaxCaseSplitDepth,
} = require("../dist/utils/validation.js");
const throwsValidation = (fn) => {
  try { fn(); return false; } catch (e) { return e instanceof ValidationError; }
};

// 14. Contradictory explore (A and NOT A) => impossible, no exception, labelled step
{
  const a = generateAssertions(normaliseBeliefSet(bs([ifThen("r1", [P("X")], [P("Y")])])));
  const r0 = exploreAssertions([P("A"), P("A", false)], a, 0);
  const r2 = exploreAssertions([P("A"), P("A", false)], a, 2);
  check("14: impossible at depth 0", r0.results.possible === false);
  check("14: impossible at depth 2", r2.results.possible === false);
  check("14: PremiseContradiction step", r0.results.reasoningSteps.some((s) => s.inferenceStepType === "PremiseContradiction"));
}

// 15. Unknown modal throws instead of silently dropping the rule
{
  let threw = false, msg = "";
  try {
    generateAssertions(normaliseBeliefSet(bs([ifThen("r1", [P("A")], [P("B")], "Sometimes")])));
  } catch (e) { threw = true; msg = e.message; }
  check("15: unknown modal throws", threw && /Sometimes/.test(msg) && /r1/.test(msg), msg);
}

// 16. Degenerate belief compiling to an empty assertion throws (would mark everything impossible)
{
  const degenerate = {
    beliefUniqueId: "d1", originatingRuleSystemName: "t", originatingRuleSystemUuid: "u",
    scenario: { type: "IF_THEN", antecedents: [[]], consequences: [{ modal: "Never", properties: [] }] },
  };
  let threw = false;
  try { generateAssertions(normaliseBeliefSet(bs([degenerate]))); } catch (e) { threw = true; }
  check("16: empty assertion throws", threw);
}

// 17. validateExplore: shape enforcement
{
  check("17: accepts empty array", (() => { validateExplore([]); return true; })());
  check("17: rejects non-array", throwsValidation(() => validateExplore(undefined)));
  check("17: rejects string valence", throwsValidation(() => validateExplore([{ sentence: "A", valence: "true" }])));
  check("17: rejects empty sentence", throwsValidation(() => validateExplore([{ sentence: "  ", valence: true }])));
}

// 18. validateBeliefSet: antecedents [] rejected, [[]] allowed and means unconditional
{
  const mk = (ant) => bs([{ beliefUniqueId: "r1", originatingRuleSystemName: "t", originatingRuleSystemUuid: "u",
    scenario: { type: "IF_THEN", antecedents: ant, consequences: [{ modal: "Always", properties: [P("C")] }] } }]);
  check("18: antecedents [] rejected", throwsValidation(() => validateBeliefSet(mk([]))));
  check("18: antecedents [[]] accepted", (() => { validateBeliefSet(mk([[]])); return true; })());
  const a = generateAssertions(normaliseBeliefSet(mk([[]])));
  const r = exploreAssertions([], a, 0);
  check("18: [[]] deduces C unconditionally", has(deduced(r), "C", true));
  check("18: unknown modal rejected by validation", throwsValidation(() =>
    validateBeliefSet(bs([ifThen("r1", [P("A")], [P("B")], "Sometimes")]))));
  check("18: empty consequence properties rejected", throwsValidation(() =>
    validateBeliefSet(bs([{ beliefUniqueId: "r1", originatingRuleSystemName: "t", originatingRuleSystemUuid: "u",
      scenario: { type: "IF_THEN", antecedents: [[P("A")]], consequences: [{ modal: "Never", properties: [] }] } }]))));
}

// 19. validateMaxCaseSplitDepth
{
  check("19: undefined -> 0", validateMaxCaseSplitDepth(undefined) === 0);
  check("19: 3 -> 3", validateMaxCaseSplitDepth(3) === 3);
  check("19: rejects string", throwsValidation(() => validateMaxCaseSplitDepth("2")));
  check("19: rejects negative", throwsValidation(() => validateMaxCaseSplitDepth(-1)));
  check("19: rejects fraction", throwsValidation(() => validateMaxCaseSplitDepth(1.5)));
}

// 20. Case-split budget: exhaustion degrades gracefully (sound, fast), never wrong
{
  // interlocked rules with many candidates: expensive at depth 3
  const beliefs = [];
  for (let i = 0; i < 12; i++) {
    beliefs.push(ifThen("n" + i, [P("x" + i), P("x" + ((i + 1) % 12))], [P("y" + i)]));
  }
  const a = generateAssertions(normaliseBeliefSet(bs(beliefs)));
  const t = process.hrtime.bigint();
  const r = exploreAssertions([], a, 3, { used: 0, max: 50 }); // tiny budget
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  check("20: tiny budget returns quickly", ms < 500, ms);
  check("20: result still sound (possible)", r.results.possible === true);
  const dedLits = deduced(r);
  check("20: no unsound deduction under budget", dedLits.length === 0, dedLits);
  check("20: exhaustion reported in resultReason", /budget/i.test(r.resultReason), r.resultReason);
}

// 21. Completeness: any depth >= 1 finds ALL entailed literals, regardless of
// how many nested cases the entailment needs (backbone-based analysis).
{
  const combos = (factors, conclusion, skip = -1) => {
    const beliefs = [];
    for (let m = 0; m < 1 << factors.length; m++) {
      if (m === skip) continue;
      beliefs.push(ifThen("c" + m, factors.map((f, j) => P(f, !!(m & (1 << j)))), [P(conclusion)]));
    }
    return beliefs;
  };
  for (const factors of [["a", "b"], ["a", "b", "c"], ["a", "b", "c", "d"]]) {
    const a = generateAssertions(normaliseBeliefSet(bs(combos(factors, "Z"))));
    const r = exploreAssertions([], a, 1);
    check(`21: degree-${factors.length} entailment found at depth 1`, has(deduced(r), "Z", true));
    check(`21: degree-${factors.length} step is CaseSplit`, r.results.reasoningSteps.some((s) => s.inferenceStepType === "CaseSplit" && (s.deducedProperty || []).some((p) => p.sentence === "Z")));
  }
  // Negative control: one uncovered combination -> Z must never be deduced.
  const a = generateAssertions(normaliseBeliefSet(bs(combos(["a", "b", "c"], "Z", 5))));
  const r = exploreAssertions([], a, 1);
  check("21: negative control never deduces Z", !has(deduced(r), "Z", true), deduced(r));
}

// 22. Hidden impossibility: jointly unsatisfiable rules, invisible to unit
// propagation, detected by case-split with a CaseSplitContradiction step.
{
  const beliefs = [
    ifThen("r1", [P("A")], [P("B")]),
    ifThen("r2", [P("A")], [P("B", false)]),
    ifThen("r3", [P("A", false)], [P("B")]),
    ifThen("r4", [P("A", false)], [P("B", false)]),
  ];
  const a = generateAssertions(normaliseBeliefSet(bs(beliefs)));
  const r0 = exploreAssertions([], a, 0);
  const r1 = exploreAssertions([], a, 1);
  check("22: propagation alone misses it", r0.results.possible === true);
  check("22: case-split detects impossibility", r1.results.possible === false);
  check("22: CaseSplitContradiction step present", r1.results.reasoningSteps.some((s) => s.inferenceStepType === "CaseSplitContradiction"));
}

// 23. Component isolation: a deep deduction stays fast amid unrelated rules.
{
  const beliefs = [];
  for (let m = 0; m < 16; m++) {
    beliefs.push(ifThen("z" + m, ["a", "b", "c", "d"].map((f, j) => P(f, !!(m & (1 << j)))), [P("Z")]));
  }
  for (let i = 0; i < 40; i++) beliefs.push(ifThen("n" + i, [P("p" + i), P("q" + i)], [P("r" + i)]));
  const a = generateAssertions(normaliseBeliefSet(bs(beliefs)));
  const t = process.hrtime.bigint();
  const r = exploreAssertions([], a, 1);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  check("23: degree-4 deduction found amid 40 noise rules", has(deduced(r), "Z", true));
  check("23: completes fast (<250ms)", ms < 250, ms);
}

// 24. Unicode/whitespace canonicalisation: visually identical sentences must
// match after validation, even with different byte encodings (NFC vs NFD).
{
  const nfc = "café is open";        // é as one codepoint
  const nfd = "café is open  ";     // e + combining accent, trailing spaces
  const beliefSet = validateBeliefSet(bs([ifThen("r1", [{ sentence: nfc, valence: true }], [P("B")])]));
  const explore = validateExplore([{ sentence: nfd, valence: true }]);
  const a = generateAssertions(normaliseBeliefSet(beliefSet));
  const r = exploreAssertions(explore, a, 0);
  check("24: NFC/NFD + whitespace still matches", has(deduced(r), "B", true), deduced(r));
}

console.log(`engine.test.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
