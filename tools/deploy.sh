#!/bin/bash
# Runnin deploy: byg dist og skub til Cloudflare Pages (https://runnin.pages.dev)
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir dist
cp index.html manifest.webmanifest sw.js privatliv.html dist/ && cp -r css js data assets dist/
node tools/build-seo.mjs dist
npx wrangler pages deploy dist --project-name=runnin --branch=main
