// @ts-check
import { defineConfig } from 'astro/config';

// Static output. The only client JS on the site is the intro's canvas island.
export default defineConfig({
  site: 'https://dsir.doonschool.com',
  output: 'static',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
