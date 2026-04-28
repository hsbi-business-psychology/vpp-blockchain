"""Reproduce the SUS analysis reported in Section 4 of the VPP paper.

Run from the repository root with no arguments. The script reads the
anonymised data file in the same directory and prints all numbers
reported in the paper (overall SUS, two-wave comparison, item means,
Cronbach's alpha on re-poled items, Welch's t-test, Cohen's d, and the
Spearman correlation with self-reported digital confidence).

The raw response scale used in the survey is the inverse of the
classical SUS scale (1 = strongly agree, 5 = strongly disagree). The
SUS scoring procedure below applies the standard inverse-coding
correctly for both polarities. Cronbach's alpha is computed on the
recoded items so that all ten items measure usability in the same
direction.

Tested with Python 3.13, NumPy 2.0, SciPy 1.13.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

DATA_FILE = Path(__file__).with_name("sus_anonymized.csv")

POS_ITEMS = ["sus_01", "sus_03", "sus_05", "sus_07", "sus_09"]
NEG_ITEMS = ["sus_02", "sus_04", "sus_06", "sus_08", "sus_10"]
ALL_ITEMS = POS_ITEMS + NEG_ITEMS


def sus_score_inverse_scale(row: pd.Series) -> float:
    """Apply the standard SUS scoring on the inverted Likert scale.

    Positively phrased items (1, 3, 5, 7, 9) contribute (5 - x).
    Negatively phrased items (2, 4, 6, 8, 10) contribute (x - 1).
    The sum is multiplied by 2.5 to obtain a 0-100 score.
    """
    if row[ALL_ITEMS].isna().any():
        return np.nan
    pos = sum(5 - row[c] for c in POS_ITEMS)
    neg = sum(row[c] - 1 for c in NEG_ITEMS)
    return (pos + neg) * 2.5


def cronbach_alpha(items_df: pd.DataFrame) -> float:
    items_df = items_df.dropna()
    if len(items_df) < 2:
        return float("nan")
    item_var = items_df.var(axis=0, ddof=1)
    total_var = items_df.sum(axis=1).var(ddof=1)
    n = items_df.shape[1]
    if total_var == 0:
        return float("nan")
    return n / (n - 1) * (1 - item_var.sum() / total_var)


def recode_to_common_polarity(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for c in POS_ITEMS:
        out[c + "_rec"] = 5 - out[c]
    for c in NEG_ITEMS:
        out[c + "_rec"] = out[c] - 1
    return out


def sus_grade(score: float) -> str:
    """Return Sauro/Lewis (2016) grade letters."""
    if pd.isna(score):
        return "n/a"
    if score >= 80.3:
        return "A"
    if score >= 68:
        return "B/C"
    if score >= 51:
        return "D"
    return "F"


def report(df_subset: pd.DataFrame, label: str) -> None:
    valid = df_subset[df_subset[ALL_ITEMS].notna().all(axis=1)].copy()
    n_valid = len(valid)
    print(f"\n{label}")
    print("-" * len(label))
    print(f"  N (valid SUS responses)  = {n_valid}")
    if n_valid == 0:
        return
    sus = valid["sus_score"]
    sem = sus.std() / np.sqrt(n_valid)
    print(f"  M (SD)                   = {sus.mean():.2f} ({sus.std():.2f})")
    print(f"  Mdn (IQR)                = {sus.median():.2f} "
          f"({sus.quantile(0.25):.2f}, {sus.quantile(0.75):.2f})")
    print(f"  95% CI                   = [{sus.mean() - 1.96 * sem:.2f}, "
          f"{sus.mean() + 1.96 * sem:.2f}]")
    print(f"  Sauro/Lewis grade        = {sus_grade(sus.mean())}")
    rec = recode_to_common_polarity(valid)
    rec_items = [c + "_rec" for c in ALL_ITEMS]
    print(f"  Cronbach's alpha (poled) = {cronbach_alpha(rec[rec_items]):.3f}")


def main() -> None:
    df = pd.read_csv(DATA_FILE)

    if "sus_score" not in df.columns or df["sus_score"].isna().all():
        df["sus_score"] = df.apply(sus_score_inverse_scale, axis=1)

    print("=" * 78)
    print("VPP Usability Evaluation — Reproduction of paper numbers")
    print("=" * 78)
    print(f"Source: {DATA_FILE}")
    print(f"Total rows in file: {len(df)}")
    print(f"Wave 1 / Wave 2 / other: "
          f"{(df['wave'] == 'wave1').sum()} / "
          f"{(df['wave'] == 'wave2').sum()} / "
          f"{(df['wave'] == 'other').sum()}")

    report(df, "Combined sample")
    report(df[df["wave"] == "wave1"], "Wave 1 (introduction)")
    report(df[df["wave"] == "wave2"], "Wave 2 (re-engagement)")

    w1 = df[(df["wave"] == "wave1") & df["sus_score"].notna()]["sus_score"]
    w2 = df[(df["wave"] == "wave2") & df["sus_score"].notna()]["sus_score"]
    if len(w1) > 1 and len(w2) > 1:
        t, p = stats.ttest_ind(w1, w2, equal_var=False)
        pooled_sd = np.sqrt(((len(w1) - 1) * w1.var() + (len(w2) - 1) * w2.var())
                            / (len(w1) + len(w2) - 2))
        d = (w1.mean() - w2.mean()) / pooled_sd
        print("\nWave 1 vs Wave 2 (Welch's t-test)")
        print("-" * 32)
        print(f"  t({len(w1) + len(w2) - 2})            = {t:.2f}")
        print(f"  p (two-tailed)        = {p:.4f}")
        print(f"  Cohen's d (pooled SD) = {d:.2f}")

    sub = df.dropna(subset=["sus_score", "digital_confidence"])
    if len(sub) > 5:
        rho, p = stats.spearmanr(sub["sus_score"], sub["digital_confidence"])
        print("\nSpearman correlation: SUS score x digital_confidence")
        print("-" * 52)
        print(f"  rho = {rho:.3f}, p = {p:.4f}, N = {len(sub)}")
        print("  Note: digital_confidence is on an inverse scale "
              "(1 = very confident, 5 = not at all confident).")

    print("\nItem-level mean responses (1 = strongly agree, 5 = strongly disagree)")
    print("-" * 70)
    item_label = {
        "sus_01": "1 +  Would use frequently",
        "sus_02": "2 -  Unnecessarily complex",
        "sus_03": "3 +  Easy to use",
        "sus_04": "4 -  Need technical support",
        "sus_05": "5 +  Functions well integrated",
        "sus_06": "6 -  Too much inconsistency",
        "sus_07": "7 +  Most people would learn quickly",
        "sus_08": "8 -  Cumbersome to use",
        "sus_09": "9 +  Felt confident using it",
        "sus_10": "10 - Need to learn a lot up front",
    }
    for c in ALL_ITEMS:
        sub = df.dropna(subset=[c])
        w1 = sub[sub["wave"] == "wave1"][c]
        w2 = sub[sub["wave"] == "wave2"][c]
        print(f"  {item_label[c]:38s} "
              f"W1: M={w1.mean():.2f} (SD={w1.std():.2f}, N={len(w1)})  "
              f"W2: M={w2.mean():.2f} (SD={w2.std():.2f}, N={len(w2)})")

    print()
    print("=" * 78)
    print("Done. All numbers in Section 4 of the paper can be located above.")
    print("=" * 78)


if __name__ == "__main__":
    main()
