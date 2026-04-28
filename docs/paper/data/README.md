# SUS evaluation data set (de-identified)

This directory contains the de-identified usability evaluation data and the
analysis script that reproduces every numerical result reported in
Section&nbsp;4 of the VPP paper.

## Files

| File                 | Purpose                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| `sus_anonymized.csv` | De-identified item-level SUS data, two waves combined ($N = 111$ rows, 99 valid SUS). |
| `sus_analysis.py`    | Python 3 script that reads the CSV and prints all numbers reported in the paper.      |
| `README.md`          | This file.                                                                            |

The same files are archived under a persistent DOI together with the
full source code on Zenodo at
[10.5281/zenodo.19845636](https://doi.org/10.5281/zenodo.19845636)
(version DOI for the BRM submission snapshot, GitHub tag `paper-v1`).
That archive is the citable version of record for both the data and
the software.

## Data dictionary

The file `sus_anonymized.csv` has one row per respondent with the
following columns.

| Column                | Type   | Values / unit                                                                                                                                                                                                               |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | string | Synthetic identifier of the form `Pnnn` (no link to a real identity).                                                                                                                                                       |
| `wave`                | string | `wave1` (introduction session, 20--21 April 2026), `wave2` (re-engagement session, 23--24 April 2026), or `other`.                                                                                                          |
| `gender`              | string | `f` (female), `m` (male), `nb` (non-binary), `na` (not specified).                                                                                                                                                          |
| `age`                 | int    | Self-reported age in years.                                                                                                                                                                                                 |
| `system_known`        | string | `yes`, `no`, `unsure`, `na` (only collected in Wave 2).                                                                                                                                                                     |
| `digital_confidence`  | int    | Self-reported confidence in handling digital systems on the scale 1 = very confident to 5 = not at all confident.                                                                                                           |
| `sus_01` ... `sus_10` | int    | Response to the standard 10-item SUS on the scale 1 = strongly agree to 5 = strongly disagree (note: this is the inverse of the canonical SUS presentation).                                                                |
| `sus_score`           | float  | SUS score on the 0-100 scale, computed using the standard scoring procedure on the inverted Likert scale (positively phrased items contribute $5 - x$, negatively phrased items contribute $x - 1$, sum multiplied by 2.5). |
| `finished`            | float  | 1 if the respondent completed the questionnaire, otherwise blank.                                                                                                                                                           |

## Anonymisation procedure

The CSV was produced from the raw SoSci~Survey export by

1. dropping all timestamp fields (only the wave categorisation is kept),
2. dropping the open free-text fields (`FB01`, `FB02`) because comments
   may contain incidental personal references; the paper reports only
   aggregated themes derived from those texts,
3. assigning synthetic identifiers `P001`, `P002`, ... in the order in
   which respondents appear in the source file,
4. recoding the categorical demographic variables to the short labels
   documented in the data dictionary above.

No directly identifying field is retained. The remaining demographic
variables (gender, age, wave, digital confidence) are sufficient to
reproduce all aggregate analyses in the paper while remaining
non-identifying for any individual respondent.

## Reproducing the paper numbers

```bash
python -m venv .venv
source .venv/bin/activate
pip install pandas numpy scipy
python sus_analysis.py
```

The script prints every number reported in Section&nbsp;4 (overall mean,
two-wave comparison, item-level table, Cronbach's alpha on re-poled
items, Welch's $t$-test, Cohen's $d$, and the Spearman correlation).
It is deterministic. Re-running it on the same input file yields the
same output bit for bit.

## License

The data and the analysis script are released under the Creative
Commons Attribution 4.0 International license (CC BY 4.0). Reuse is
permitted with attribution to the VPP paper and the OSF DOI.
