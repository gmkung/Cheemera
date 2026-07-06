# Z3 differential harness

Optional cross-check of the Cheemera engine against the Z3 SMT solver: 400
seeded random rule sets (5–30 interacting nogoods over 8 sentences, random
explores) must produce **exactly** the same possible/impossible verdict and the
same complete set of deduced literals in both engines, with Z3 receiving the
constraints in freshly shuffled order each case (sequence-agnosticism check).
Also includes a 59-rule implication chain, deduced fully in both directions
(forward and contrapositive) from a single starting fact.

The semantic bridge: a Cheemera assertion (nogood) `{l1..ln}` is the Z3
constraint `Not(And(l1..ln))`.

Not part of `yarn test` because it needs Python and the `z3-solver` package:

```sh
pip install z3-solver
yarn build
node test/z3-differential/generate.js && python3 test/z3-differential/compare.py
```

Exit code is non-zero on any mismatch. `z3diff.json` is a generated
intermediate (gitignored).
