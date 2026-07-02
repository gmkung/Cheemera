// Randomized invariant guard for the deCheem engine.
//
// Default mode (no env): generates many complex, sentence-overlapping belief
// sets and asserts engine INVARIANTS that must always hold. The central guard
// is DETERMINISM/PURITY -- the same belief set is explored twice and the
// results must be byte-identical. This is exactly what breaks if the
// mutate-in-place side effects removed from exploreAssertions are ever
// reintroduced.
//
// Differential mode: set DIFF_IMPL to the path of another compiled module that
// exports exploreAssertions (e.g. a build of an older commit) to compare the
// current engine against it on every generated case. Nothing old is stored in
// the tree -- check out the old commit, build it elsewhere, and point DIFF_IMPL
// at it:
//
//   git worktree add /tmp/old <old-commit> && (cd /tmp/old && yarn build)
//   DIFF_IMPL=/tmp/old/dist/utils/deCheemExploreUtils.js node test/fuzz.js
//
// Env knobs: SEED (default 123456789), FUZZ_N (default 3000).
const {
  generateAssertions,
  normaliseBeliefSet,
} = require("../dist/utils/deCheemInternalUtils.js");
const { exploreAssertions } = require("../dist/utils/deCheemExploreUtils.js");

const diffImpl = process.env.DIFF_IMPL ? require(process.env.DIFF_IMPL).exploreAssertions : null;
const N = parseInt(process.env.FUZZ_N || "3000", 10);

let seed = parseInt(process.env.SEED || "123456789", 10);
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const ri = (n) => Math.floor(rnd() * n);
const pick = (arr) => arr[ri(arr.length)];
const clone = (x) => JSON.parse(JSON.stringify(x));

const SENTENCES = ["s0", "s1", "s2", "s3", "s4", "s5"]; // small pool -> heavy overlap
const randProp = () => ({ sentence: pick(SENTENCES), valence: rnd() < 0.5 });
function randPropList(min, max) {
  const n = min + ri(max - min + 1);
  return Array.from({ length: n }, randProp);
}
function randBelief(id) {
  const t = pick(["IF_THEN", "IF_THEN", "IF_THEN", "MUTUAL_EXCLUSION", "MUTUAL_INCLUSION"]);
  if (t === "IF_THEN") {
    return {
      beliefUniqueId: id, originatingRuleSystemName: "t", originatingRuleSystemUuid: "u",
      scenario: { type: "IF_THEN", antecedents: [randPropList(1, 3)], consequences: [{ modal: pick(["Always", "Never"]), properties: randPropList(1, 3) }] },
    };
  }
  const groups = Array.from({ length: 2 + ri(3) }, () => randPropList(1, 2));
  return { beliefUniqueId: id, originatingRuleSystemName: "t", originatingRuleSystemUuid: "u", scenario: { type: t, antecedents: groups, consequences: [] } };
}
function randBeliefSet() {
  const beliefs = Array.from({ length: 3 + ri(10) }, (_, i) => randBelief("b" + i));
  return { beliefs, beliefSetName: "t", beliefSetOwner: "t", beliefSetVersion: "1", blindReferenceExternalIdArray: [] };
}
// Explore with DISTINCT sentences (no self-conflicting literals), so every
// explore is representable as a partial world and the oracle stays exact.
function randExplore() {
  const out = [];
  for (const s of SENTENCES) if (rnd() < 0.35) out.push({ sentence: s, valence: rnd() < 0.5 });
  return out;
}

// Brute-force ground truth over all 2^|SENTENCES| worlds. A world violates an
// assertion (nogood) when every literal in it matches; a world is consistent
// when it matches the explore and violates no assertion.
function oracle(assertions, explore) {
  const consistent = [];
  for (let m = 0; m < (1 << SENTENCES.length); m++) {
    const w = {};
    SENTENCES.forEach((s, j) => (w[s] = (m & (1 << j)) !== 0));
    if (!explore.every((p) => w[p.sentence] === p.valence)) continue;
    const violated = assertions.some((a) => a.properties.every((p) => w[p.sentence] === p.valence));
    if (!violated) consistent.push(w);
  }
  return consistent;
}
// A literal deduced by the engine = any deducedProperty across reasoning steps.
const engineDeduced = (r) => r.results.reasoningSteps.flatMap((s) => s.deducedProperty || []);

function meaningful(r) {
  return JSON.stringify({
    possible: r.results.possible,
    deduced: r.results.reasoningSteps.flatMap((s) => (s.deducedProperty || []).map((p) => p.sentence + ":" + p.valence)),
    contradictionSources: r.results.reasoningSteps.filter((s) => !s.deducedProperty).map((s) => s.sourceBeliefId),
  });
}
const secondarySet = (r) => JSON.stringify([...new Set(r.results.arrayOfSecondaryResidues)].sort());

let fails = 0;
const report = (i, name, detail) => {
  fails++;
  if (fails <= 5) console.log(`  FAIL case#${i} [${name}] ${detail}`);
};

for (let i = 0; i < N; i++) {
  const beliefSet = randBeliefSet();
  let assertions;
  try {
    assertions = generateAssertions(normaliseBeliefSet(beliefSet));
  } catch (e) {
    report(i, "generate-threw", e.message);
    continue;
  }
  const explore = randExplore();

  // INVARIANT: determinism / purity -- two runs on the same inputs are identical.
  const r1 = exploreAssertions(clone(explore), { assertions: clone(assertions.assertions) });
  const r2 = exploreAssertions(clone(explore), { assertions: clone(assertions.assertions) });
  if (JSON.stringify(r1) !== JSON.stringify(r2)) report(i, "non-deterministic", "two runs differ -> a side effect leaked");

  // INVARIANT: secondary residues are deduplicated.
  const sr = r1.results.arrayOfSecondaryResidues;
  if (new Set(sr).size !== sr.length) report(i, "secondary-not-deduped", JSON.stringify(sr));

  // INVARIANT: impossible results carry a contradiction step (sourceBeliefId, no deduction).
  if (r1.results.possible === false && !r1.results.reasoningSteps.some((s) => !s.deducedProperty && s.sourceBeliefId !== undefined)) {
    report(i, "impossible-without-source", "");
  }

  // ---- Case-split EXACTNESS vs brute-force oracle (ground truth) ----
  // Backbone-based case-split is complete: the verdict and the deduced set
  // must EQUAL the oracle's, not merely be sound.
  const consistent = oracle(assertions.assertions, explore);
  const cs = exploreAssertions(clone(explore), { assertions: clone(assertions.assertions) }, 1);

  // determinism also holds with case-split on
  const cs2 = exploreAssertions(clone(explore), { assertions: clone(assertions.assertions) }, 1);
  if (JSON.stringify(cs) !== JSON.stringify(cs2)) report(i, "case-split-non-deterministic", "");

  if (cs.results.possible !== consistent.length > 0) {
    report(i, "WRONG-verdict", `oracle ${consistent.length > 0 ? "SAT" : "UNSAT"} but engine says possible=${cs.results.possible}`);
  } else if (consistent.length > 0) {
    // Oracle-entailed literals over sentences not fixed by the explore.
    const exSents = new Set(explore.map((p) => p.sentence));
    const want = new Set();
    for (const s of SENTENCES) {
      if (exSents.has(s)) continue;
      if (consistent.every((w) => w[s] === true)) want.add(s + ":true");
      if (consistent.every((w) => w[s] === false)) want.add(s + ":false");
    }
    const got = new Set(engineDeduced(cs).map((p) => p.sentence + ":" + p.valence));
    const exact = want.size === got.size && [...want].every((x) => got.has(x));
    if (!exact) report(i, "NOT-EXACT", `want=[${[...want]}] got=[${[...got]}]`);
  }

  // Optional differential: meaningful output + secondary SET must match the reference impl (depth 0 path).
  if (diffImpl) {
    // The pre-refactor implementation gated contradiction checks on the since-
    // removed `exclude` flag; reconstruct it for a faithful comparison.
    const withExclude = clone(assertions.assertions).map((a) => ({ ...a, exclude: true }));
    const rOld = diffImpl(clone(explore), { assertions: withExclude });
    if (meaningful(r1) !== meaningful(rOld)) report(i, "DIFF-meaningful", `new=${meaningful(r1)} old=${meaningful(rOld)}`);
    if (secondarySet(r1) !== secondarySet(rOld)) report(i, "DIFF-secondary-set", "");
  }
}

console.log(`fuzz.js: ${N} cases${diffImpl ? " (differential vs DIFF_IMPL)" : " (invariant mode)"}, ${fails} failure(s)`);
process.exit(fails ? 1 : 0);
