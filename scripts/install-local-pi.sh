#!/usr/bin/env bash
set -euo pipefail

log() {
	printf '\n==> %s\n' "$*"
}

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/pi-local-pack.XXXXXX")"
cleanup() {
	rm -rf "$tmpdir"
}
trap cleanup EXIT

log "Repo: $repo_root"

log "Discovering local pi workspace dependency closure"
workspaces=()
while IFS= read -r workspace; do
	workspaces+=("$workspace")
done < <(
	node <<'NODE'
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = process.cwd();
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const workspacePatterns = rootPkg.workspaces ?? [];

function packageDirsForPattern(pattern) {
	if (!pattern.endsWith("/*")) return [join(root, pattern)];

	const base = join(root, pattern.slice(0, -2));
	if (!existsSync(base)) return [];

	return readdirSync(base, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(base, entry.name));
}

const packages = new Map();

for (const pattern of workspacePatterns) {
	for (const dir of packageDirsForPattern(pattern)) {
		const packageJson = join(dir, "package.json");
		if (!existsSync(packageJson)) continue;

		const pkg = JSON.parse(readFileSync(packageJson, "utf8"));
		if (!pkg.name) continue;

		packages.set(pkg.name, { dir, pkg });
	}
}

const cliWorkspace = [...packages.values()].find(({ pkg }) => pkg.bin?.pi);
if (!cliWorkspace) {
	throw new Error("Could not find local workspace that provides the `pi` binary");
}

const selected = new Set();

function visit(name) {
	if (selected.has(name)) return;
	const entry = packages.get(name);
	if (!entry) return;

	selected.add(name);

	const deps = {
		...entry.pkg.dependencies,
		...entry.pkg.optionalDependencies,
	};

	for (const depName of Object.keys(deps)) {
		if (packages.has(depName)) visit(depName);
	}
}

visit(cliWorkspace.pkg.name);

for (const name of selected) {
	console.log(name);
}
NODE
)

if ((${#workspaces[@]} == 0)); then
	printf 'No local pi workspaces found\n' >&2
	exit 1
fi

printf '  %s\n' "${workspaces[@]}"

log "Building local packages"
npm run build

log "Packing local workspace tarballs"
tarballs=()
for workspace in "${workspaces[@]}"; do
	log "Packing $workspace"
	pack_output="$(npm pack --silent --ignore-scripts --pack-destination "$tmpdir" --workspace "$workspace")"
	tarball_name="$(printf '%s\n' "$pack_output" | tail -n 1)"
	tarballs+=("$tmpdir/$tarball_name")
done

log "Installing local tarballs globally"
npm install -g --ignore-scripts "${tarballs[@]}"

log "Verifying installed pi"
which pi
pi --version

log "Verifying installed package files match local build"
global_root="$(npm root -g)"

for workspace in "${workspaces[@]}"; do
	local_pkg_json="$(
		node -e '
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const name = process.argv[1];
const root = process.cwd();
const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

for (const pattern of rootPkg.workspaces ?? []) {
	if (!pattern.endsWith("/*")) continue;
	const base = join(root, pattern.slice(0, -2));
	if (!existsSync(base)) continue;

	for (const entry of readdirSync(base)) {
		const path = join(base, entry, "package.json");
		if (!existsSync(path)) continue;
		const pkg = JSON.parse(readFileSync(path, "utf8"));
		if (pkg.name === name) {
			console.log(path);
			process.exit(0);
		}
	}
}

process.exit(1);
' "$workspace"
	)"

	package_dir="$(dirname "$local_pkg_json")"
	main_file="$(
		node -e '
const { readFileSync } = require("node:fs");
const pkg = JSON.parse(readFileSync(process.argv[1], "utf8"));
console.log(pkg.main || "dist/index.js");
' "$local_pkg_json"
	)"

	local_file="$package_dir/$main_file"
	installed_file="$global_root/$workspace/$main_file"

	if [[ -f "$local_file" && -f "$installed_file" ]]; then
		shasum "$local_file" "$installed_file"
	fi
done

log "Done"
