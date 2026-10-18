# Release notes

Convención (ver SPEC §9):

- Las notas se escriben **en inglés**, con emojis solo en los **títulos de sección**.
- Estructura de `release-notes/vX.Y.Z.md`:
  1. **Primera línea**: comentario HTML oculto con el título de la release, formato
     `<!-- title: vX.Y.Z - The <Tema> Update -->` (el workflow lo lee para titular la
     release; no se ve en GitHub).
  2. **Contexto breve** de la actualización (1–2 frases).
  3. **Sección destacada** `## <emoji> <título descriptivo>` con lo más importante:
     relacionada con el `<Tema>` del título pero sin repetirlo (p. ej. título "The Settings
     Update" → sección "⚙️ Settings module"), seguida de un párrafo y bullets con formato
     `- **Nombre**: descripción`.
  4. **`## ✨ What's new`** con el resto de novedades (mismo formato de bullets).
- Instalación, datos, requisitos y actualización viven en el [README](../README.md), no en
  cada release.
- Si al cortar un tag `vX.Y.Z` existe `release-notes/vX.Y.Z.md`, el workflow
  (`.github/workflows/release.yml`) lo publica **tal cual** como cuerpo del release: el
  archivo y el cuerpo publicado deben ser idénticos.
- Si no existe, el workflow autogenera las notas desde los commits convencionales
  (`feat:`, `fix:`…) desde el tag anterior.

Ejemplo: `release-notes/v0.2.0.md`.
