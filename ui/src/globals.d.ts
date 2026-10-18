/** App version injected at build time by Vite (see vite.config.ts). */
declare const __APP_VERSION__: string

/** Vite resolves asset imports to their URL. */
declare module '*.svg' {
  const url: string
  export default url
}
