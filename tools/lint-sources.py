#!/usr/bin/env python3
"""Refuse tout JavaScript compilé posé à côté d'une source TypeScript.

Le piège, rencontré pour de vrai et payé une heure de débogage :

Nos imports ESM s'écrivent « from './radar2d.js' » — c'est la forme exigée par
Node et par `verbatimModuleSyntax`. Tant qu'il n'existe que `radar2d.ts`, Vite
résout vers la source. Mais dès qu'un `radar2d.js` compilé traîne à côté, Vite
sert CELUI-LÀ. Le navigateur affiche alors une photographie du code, figée à
l'instant de la compilation, et plus aucune modification n'a d'effet.

C'est le pire genre de bug : silencieux, et il transforme chaque correction
suivante en fausse piste. On a corrigé la cause (le script `check` émettait),
mais une cause corrigée se re-casse. Ce garde-fou, lui, tient.
"""

from pathlib import Path
import sys

RACINE = Path(__file__).resolve().parent.parent
DOSSIERS = ["packages", "apps"]
SUFFIXES = (".js", ".jsx", ".d.ts", ".tsbuildinfo")


def intrus() -> list[Path]:
    trouves: list[Path] = []

    # La racine aussi : `tsc -b` y dépose son `tsconfig.tsbuildinfo`, et un
    # fichier d'état de compilation commité fait diverger les machines.
    for chemin in RACINE.glob("*.tsbuildinfo"):
        if chemin.is_file():
            trouves.append(chemin)

    for dossier in DOSSIERS:
        base = RACINE / dossier
        if not base.is_dir():
            continue
        for chemin in base.rglob("*"):
            if "node_modules" in chemin.parts or not chemin.is_file():
                continue
            nom = chemin.name
            if nom.endswith(".d.ts") or nom.endswith(".tsbuildinfo"):
                trouves.append(chemin)
            elif nom.endswith((".js", ".jsx")):
                # Un .js légitime n'a pas de .ts du même nom à côté de lui.
                if chemin.with_suffix(".ts").exists() or chemin.with_suffix(".tsx").exists():
                    trouves.append(chemin)
    return sorted(trouves)


def main() -> int:
    fautifs = intrus()
    if not fautifs:
        print("✓ aucune source compilée à côté des sources")
        return 0

    print(f"✗ {len(fautifs)} artefact(s) de compilation posé(s) à côté des sources :\n")
    for f in fautifs[:20]:
        print(f"    {f.relative_to(RACINE)}")
    if len(fautifs) > 20:
        print(f"    … et {len(fautifs) - 20} autre(s)")
    print(
        "\n  Vite sert ces .js À LA PLACE des .ts, parce que nos imports"
        "\n  s'écrivent « ./machin.js ». Le navigateur affichera du code périmé."
        "\n"
        "\n  Pour les retirer :"
        "\n    find packages apps -name '*.js' -not -path '*/node_modules/*' -delete"
        "\n"
        "\n  Et vérifie quel script les a émis : un `tsc` sans `--noEmit`."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
