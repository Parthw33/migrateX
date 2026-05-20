/**
 * Type declarations for Vite virtual modules and special query suffixes
 * used in this project.
 */

// UnoCSS virtual stylesheet — direct import for side-effects
declare module 'virtual:uno.css' {
  const content: string;
  export default content;
}

// UnoCSS virtual stylesheet — ?url import returns the compiled asset URL
declare module 'virtual:uno.css?url' {
  const url: string;
  export default url;
}
