# Publishing the SUS data set on OSF

This file is the short version of `docs/paper/PUBLISH.md` Section 2,
kept here so it sits next to the data files themselves.

## What gets uploaded

| File                 | Size   | Contents                                    |
| -------------------- | ------ | ------------------------------------------- |
| `sus_anonymized.csv` | ~12 KB | 111 rows, de-identified item-level SUS.     |
| `sus_analysis.py`    | ~5 KB  | Reproduces every paper number from the CSV. |
| `README.md`          | ~3 KB  | Data dictionary and reproduction notes.     |

## How

1. Sign in at <https://osf.io/>.
2. Open (or create) the project `Verifiable Participant Points`.
3. **Add Component → Data**, name it `SUS evaluation data (BRM paper)`.
4. In the new component, upload all three files from this directory.
5. Paste the contents of `README.md` into the component's **Wiki**.
6. **Settings → Make Public**.
7. **Create DOI** on the component landing page.

Copy the resulting DOI (form `10.17605/OSF.IO/XXXXX`) and replace the
placeholders in:

- `docs/paper/latex/sections/07_open_practices.tex`
- `docs/paper/latex/sections/08_declarations.tex`

Then rebuild the manuscript:

```bash
cd docs/paper/latex
make
```
