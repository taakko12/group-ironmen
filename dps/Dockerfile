FROM node:20-slim
WORKDIR /app

# git is needed at build time: scripts/vendor.mjs fetches the calculator from
# its pinned commit rather than committing GPL sources into this repo.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Whole-context copy rather than file-by-file, and `npm install` rather than
# `npm ci`: Railway's uploader drops package-lock.json from the build context
# even though git tracks it, and a COPY of a missing file fails with a
# checksum error that says nothing useful. Reproducibility that matters lives
# in scripts/vendor.mjs's pinned commit, not in this lockfile.
COPY . .
RUN npm install --no-audit --no-fund

# Vendor and validate in the image build. Upstream's own suite runs against
# the vendored copy, so a bad pin fails the deploy instead of quietly serving
# wrong numbers.
RUN npm test

ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
