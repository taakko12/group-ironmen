FROM node:20-slim
WORKDIR /app

# git is needed at build time: scripts/vendor.mjs fetches the calculator from
# its pinned commit rather than committing GPL sources into this repo.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vitest.config.ts ./
COPY scripts ./scripts
COPY src ./src
COPY test ./test

# Vendor and validate in the image build. Upstream's own suite runs against
# the vendored copy, so a bad pin fails the deploy instead of quietly serving
# wrong numbers.
RUN npm test

ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
