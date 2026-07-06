# Step 2 (Python): replay every case from z3diff.json in the Z3 SMT solver with
# SHUFFLED assertion order and demand exact agreement with Cheemera on (a) the
# possible/impossible verdict and (b) the full set of deduced literals.
# Then a 59-rule chain test (forward and contrapositive, shuffled order).
#
# Requires: pip install z3-solver
# Run: node test/z3-differential/generate.js && python3 test/z3-differential/compare.py
import json, os, random, sys
from z3 import Bool, Not, And, Solver, sat

data = json.load(open(os.path.join(os.path.dirname(__file__), "z3diff.json")))
SENT = data["sentences"]
random.seed(7)

def tolit(tok, V):  # "+s3" -> s3, "-s3" -> Not(s3)
    return V[tok[1:]] if tok[0] == "+" else Not(V[tok[1:]])

mismatch = 0
for idx, case in enumerate(data["cases"]):
    V = {s: Bool(s) for s in SENT}
    # each Cheemera nogood {l1..ln} == Z3 constraint Not(And(l1..ln))
    constraints = [Not(And([tolit(t, V) for t in ng])) for ng in case["nogoods"]]
    random.shuffle(constraints)               # <-- sequence-agnosticism under test
    s = Solver()
    for c in constraints:
        s.add(c)

    assumptions = [tolit(t, V) for t in case["explore"]]
    res, cons = s.consequences(assumptions, [V[x] for x in SENT])

    # (a) verdict must match
    if (res == sat) != case["possible"]:
        mismatch += 1; print("VERDICT MISMATCH case", idx); continue
    if res != sat:
        continue  # both say impossible; no deduction sets to compare

    # (b) deduced sets must match EXACTLY (over sentences not fixed by explore)
    fixed = {t[1:] for t in case["explore"]}
    got = set()
    for c in cons:                            # each: Implies(<premises>, <literal>)
        lit = c.children()[1]
        if lit.decl().name() == "not":
            name, val = lit.children()[0].decl().name(), "-"
        else:
            name, val = lit.decl().name(), "+"
        if name not in fixed:
            got.add(val + name)
    want = set(case["deduced"])
    if got != want:
        mismatch += 1
        print("DEDUCTION MISMATCH case", idx, "z3:", sorted(got), "cheemera:", sorted(want))

print(f"\n{len(data['cases'])} random cases (shuffled order): {mismatch} mismatches vs Cheemera")

# ---- 59-rule chain: multi-hop chaining, both directions, shuffled order ----
V = {f"c{i}": Bool(f"c{i}") for i in range(60)}
chain = [Not(And(V[f"c{i}"], Not(V[f"c{i+1}"]))) for i in range(59)]   # c_i -> c_{i+1}
chain_fail = 0
for label, assume, expect in [
    ("forward  (given c0)",   V["c0"],        59),
    ("backward (given ¬c59)", Not(V["c59"]),  59),
]:
    random.shuffle(chain)
    s = Solver()
    for c in chain:
        s.add(c)
    res, cons = s.consequences([assume], list(V.values()))
    # len(cons) includes the assumption's own trivial self-consequence -> expect+1
    n = len(cons) - 1
    if n != expect or res != sat:
        chain_fail += 1
    print(f"chain {label}: {n} chained deductions (expect {expect}), sat={res == sat}")

sys.exit(1 if (mismatch or chain_fail) else 0)
