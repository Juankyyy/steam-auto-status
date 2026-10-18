# Release notes

Convención (ver SPEC §9):

- Las notas se escriben **en inglés y con emojis**.
- Si al cortar un tag `vX.Y.Z` existe `release-notes/vX.Y.Z.md`, el workflow
  (`.github/workflows/release.yml`) lo publica **tal cual** como cuerpo del release: el
  archivo y el cuerpo publicado deben ser idénticos.
- Si no existe, el workflow autogenera las notas desde los commits convencionales
  (`feat:`, `fix:`…) desde el tag anterior.

Ejemplo: `release-notes/v0.1.0.md`.
