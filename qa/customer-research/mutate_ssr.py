"""Plant each defect test_ssr.py names into a copy of ssr.py; each must turn it red.

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


def run(module_dir: str) -> int:
    env = dict(os.environ, SSR_MODULE_DIR=module_dir)
    return subprocess.run([sys.executable, "-m", "unittest", "-q", "test_ssr"], cwd=HERE, env=env,
                          capture_output=True, text=True).returncode


def main() -> int:
    if run(str(HERE)) != 0:
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
    return 1 if survivors else 0


if __name__ == "__main__":
    sys.exit(main())
