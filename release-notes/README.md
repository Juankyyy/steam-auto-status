# Notas de release

Si al cortar un tag `vX.Y.Z` existe un archivo `vX.Y.Z.md` en esta carpeta, el workflow
(`.github/workflows/release.yml`) lo usa **tal cual** como notas de la release. Si no
existe, las autogenera desde los commits convencionales (`feat:`, `fix:`…) desde el tag
anterior.

Ejemplo: `release-notes/v0.1.0.md`.
