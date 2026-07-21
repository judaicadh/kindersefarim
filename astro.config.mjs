import { defineConfig } from 'astro/config';

// Static site generation: the Google Sheet is read once at build time and the
// whole catalog is baked into HTML. A rebuild (Netlify build hook, triggered by
// a Google Apps Script edit handler) is what publishes sheet changes.
export default defineConfig({
  output: 'static',
  // If you ever host under a sub-path, set `site` and `base` here.
});
