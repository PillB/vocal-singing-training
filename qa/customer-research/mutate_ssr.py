"""Plant each defect the tests name into a copy of the code; each must turn its test file red.

ssr.py mutants are judged by test_ssr.py; collect.py and analyze.py mutants by test_rules.py.
Run: python qa/customer-research/mutate_ssr.py   (exit 1 if a mutant survives)
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = (HERE / "ssr.py").read_text()

MUTANTS = {
    "no-min-subtraction": ("p = s - s[low]", "p = s.copy()"),
    "sign-flipped": ("p = s - s[low]", "p = s.max() - s"),
    "first-anchor-set-only": (
        "pm = np.mean([pmf_from_similarities(r, self.eps, self.temperature) for r in row], axis=0)",
        "pm = pmf_from_similarities(row[0], self.eps, self.temperature)",
    ),
    "temperature-inverted": ("np.power(p, 1.0 / temperature)", "np.power(p, temperature)"),
    "epsilon-ignored": ("p[low] += eps", "pass"),
    "ks-on-pmf-not-cdf": ("np.abs(np.cumsum(p) - np.cumsum(q))", "np.abs(np.asarray(p) - np.asarray(q))"),
}


RULE_MUTANTS = {
    "collect-ignores-the-round": (
        "collect.py",
        "meta = rounds[round_of(tag, rounds)][batch_id]",
        "meta = rounds[sorted(rounds)[0]][batch_id]",
    ),
    "split-half-on-three-cards": ("analyze.py", "if len(concepts) < MIN_SPLIT_CONCEPTS:", "if False:"),
    "not-worse-on-the-point-estimate": ("analyze.py", 'd["lo"] > NI_MARGIN', 'd["diff"] > NI_MARGIN'),
    "verdict-on-a-failed-question": ("analyze.py", "= verdict if valid else NOT_JUDGED", "= verdict"),
    "better-while-a-gate-failed": ("analyze.py", "if beats and all_gates else", "if beats else"),
}


def run(module_dir: str, tests: str = "test_ssr") -> int:
    env = dict(os.environ, SSR_MODULE_DIR=module_dir)
    return subprocess.run([sys.executable, "-m", "unittest", "-q", tests], cwd=HERE, env=env,
                          capture_output=True, text=True).returncode


def run_rule_mutant(name, file, old, new):
    """A copy of every module, one of them mutated, beside links to data/ and prompts/."""
    src = (HERE / file).read_text()
    if src.count(old) != 1:
        print(f"{name}: anchor text not found exactly once in {file}")
        return None
    with tempfile.TemporaryDirectory() as tmp:
        for f in HERE.glob("*.py"):
            Path(tmp, f.name).write_text(f.read_text())
        Path(tmp, file).write_text(src.replace(old, new))
        for d in ("data", "prompts"):
            os.symlink(HERE / d, Path(tmp, d))
        return run(tmp, "test_rules")


def main() -> int:
    if run(str(HERE)) != 0 or run(str(HERE), "test_rules") != 0:
        print("baseline is red: fix the tests before judging mutants")
        return 1
    survivors = []
    for name, (old, new) in MUTANTS.items():
        if SRC.count(old) != 1:
            print(f"{name}: anchor text not found exactly once in ssr.py")
            return 1
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "ssr.py").write_text(SRC.replace(old, new))
            code = run(tmp)
        status = "killed" if code != 0 else "SURVIVED"
        print(f"{name}: {status}")
        if code == 0:
            survivors.append(name)
        shutil.rmtree(Path(tmp), ignore_errors=True)
    for name, (file, old, new) in RULE_MUTANTS.items():
        code = run_rule_mutant(name, file, old, new)
        if code is None:
            return 1
        print(f"{name}: {'killed' if code != 0 else 'SURVIVED'}")
        if code == 0:
            survivors.append(name)
    return 1 if survivors else 0


if __name__ == "__main__":
    sys.exit(main())
