// Step 1 (Node): generate 400 random rule sets + explores, record Cheemera's
// answers (complete case-split mode), dump to z3diff.json for compare.py.
// Run: node test/z3-differential/generate.js   (after `yarn build`)
const path = require("path");
const { exploreAssertions } = require(path.join(__dirname, "../../dist/utils/deCheemExploreUtils.js"));
const clone = (x) => JSON.parse(JSON.stringify(x));

// Seeded PRNG -> the whole experiment is reproducible.
let seed = 424242;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (n) => Math.floor(rnd() * n);
const pick = (a) => a[ri(a.length)];

const SENT = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"]; // 8 variables
const lit = () => ({ sentence: pick(SENT), valence: rnd() < 0.5 });
const list = (a, b) => Array.from({ length: a + ri(b - a + 1) }, lit);

const cases = [];
for (let i = 0; i < 400; i++) {
  // 5..30 random nogoods of 1..3 literals each (dozens of rules, heavy overlap)
  const assertions = Array.from({ length: 5 + ri(26) }, (_, j) =>
    ({ properties: list(1, 3), sourceBeliefId: "a" + j }));
  // random explore over distinct sentences (~30% of vars, random valence)
  const explore = SENT.filter(() => rnd() < 0.3)
    .map((s) => ({ sentence: s, valence: rnd() < 0.5 }));

  // Cheemera's answer, caseSplit=true (complete backbone mode)
  const r = exploreAssertions(clone(explore), { assertions: clone(assertions) }, true);
  const deduced = r.results.reasoningSteps
    .flatMap((s) => s.deducedProperty || [])
    .map((p) => (p.valence ? "+" : "-") + p.sentence);

  cases.push({
    nogoods: assertions.map((a) => a.properties.map((p) => (p.valence ? "+" : "-") + p.sentence)),
    explore: explore.map((p) => (p.valence ? "+" : "-") + p.sentence),
    possible: r.results.possible,
    deduced: deduced.sort(),
  });
}
require("fs").writeFileSync(path.join(__dirname, "z3diff.json"), JSON.stringify({ sentences: SENT, cases }));
console.log("dumped", cases.length, "cases; avg rules/case:",
  (cases.reduce((s, c) => s + c.nogoods.length, 0) / cases.length).toFixed(1));
