/**
 * Moves the repo to a newer OpenCode release. The client package and the server image's base
 * tag have to match, and the app version moves with them because the bump ships as its own
 * app release.
 *
 *   node scripts/bump-opencode.mjs [version]
 *
 * With no version it takes the newest release that has been out for MIN_AGE_HOURS and already
 * has a server image upstream, and does nothing when the repo is already on it.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const PACKAGE = "@opencode/client";
const DOCKERFILE = "docker/opencode/Dockerfile";

// pnpm holds back packages published within the last day, and answers an explicit request for
// one by writing an exclusion into pnpm-workspace.yaml. The extra hour keeps the client's own
// dependencies, published minutes after it, past that guard as well.
const MIN_AGE_HOURS = 25;

process.chdir(new URL("..", import.meta.url).pathname);

const readPackage = () => JSON.parse(readFileSync("package.json", "utf8"));

function compareStable(a, b) {
  const [x, y] = [a, b].map((version) => version.split(".").map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

async function hasServerImage(image, version) {
  const [registry, ...path] = image.split("/");
  const repository = path.join("/");
  if (registry !== "ghcr.io") throw new Error(`Don't know how to query ${registry} for ${image}`);
  const auth = await fetch(`https://ghcr.io/token?scope=repository:${repository}:pull`);
  const { token } = await auth.json();
  const manifest = await fetch(`https://ghcr.io/v2/${repository}/manifests/${version}`, {
    method: "HEAD",
    headers: {
      authorization: `Bearer ${token}`,
      accept:
        "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json",
    },
  });
  if (manifest.status !== 200 && manifest.status !== 404) {
    throw new Error(`${image}:${version} lookup failed with HTTP ${manifest.status}`);
  }
  return manifest.status === 200;
}

async function newestEligible(current, image) {
  const response = await fetch(`https://registry.npmjs.org/${PACKAGE.replace("/", "%2F")}`);
  if (!response.ok) throw new Error(`npm registry answered HTTP ${response.status}`);
  const { time } = await response.json();
  const cutoff = Date.now() - MIN_AGE_HOURS * 60 * 60 * 1000;
  // Upstream also publishes 0.0.0-dev-* and 0.0.0-beta-* builds several times a day.
  const candidates = Object.keys(time)
    .filter((version) => /^\d+\.\d+\.\d+$/.test(version))
    .filter((version) => compareStable(version, current) > 0 && Date.parse(time[version]) <= cutoff)
    .sort(compareStable)
    .reverse();
  for (const version of candidates) {
    if (await hasServerImage(image, version)) return version;
  }
  return null;
}

/** `1.1.0` becomes `1.1.1`; a prerelease counts up instead: `1.2.0-alpha01` becomes `1.2.0-alpha02`. */
function nextAppVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(version);
  if (!match) throw new Error(`package.json version ${version} is not X.Y.Z or X.Y.Z-prerelease`);
  const [, major, minor, patch, prerelease] = match;
  if (!prerelease) return `${major}.${minor}.${Number(patch) + 1}`;
  const counter = /\d+$/.exec(prerelease)?.[0];
  if (!counter) return `${version}.1`;
  const next = String(Number(counter) + 1).padStart(counter.length, "0");
  return `${major}.${minor}.${patch}-${prerelease.slice(0, -counter.length)}${next}`;
}

function output(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, lines.join(""));
}

const dockerfile = readFileSync(DOCKERFILE, "utf8");
const image = /^ARG BASE_IMAGE=(.+)$/m.exec(dockerfile)?.[1];
if (!image || !/^ARG OPENCODE_VERSION=.+$/m.test(dockerfile)) {
  throw new Error(`${DOCKERFILE} has no BASE_IMAGE or OPENCODE_VERSION argument`);
}

const current = readPackage().dependencies[PACKAGE];
const target = process.argv[2] ?? (await newestEligible(current, image));

if (!target || target === current) {
  console.log(`OpenCode ${current} is already the newest eligible release.`);
  output({ changed: false });
  process.exit(0);
}

// First, because it is the step that can fail: nothing else is touched when it does.
execFileSync("pnpm", ["add", "--save-exact", `${PACKAGE}@${target}`], { stdio: "inherit" });

writeFileSync(
  DOCKERFILE,
  dockerfile.replace(/^ARG OPENCODE_VERSION=.+$/m, `ARG OPENCODE_VERSION=${target}`),
);

const pkg = readPackage();
const previousApp = pkg.version;
pkg.version = nextAppVersion(previousApp);
pkg.versionCode += 1;
writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`OpenCode ${current} -> ${target}, app ${previousApp} -> ${pkg.version}`);
output({
  changed: true,
  opencode: target,
  previous_opencode: current,
  app: pkg.version,
  previous_app: previousApp,
});
