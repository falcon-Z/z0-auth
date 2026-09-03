import path from "node:path";

type PackageManifest = {
  packageManager?: string;
  devDependencies?: Record<string, string>;
};

export type BunRuntimeQualification = {
  version: string;
  declarations: {
    packageManager: string;
    typeDefinitions: string;
    lockfileTypeDefinitions: string;
    dockerBuild: string;
    dockerRuntime: string;
  };
};

function declaredVersion(value: string | undefined, pattern: RegExp, label: string): string {
  const version = value?.match(pattern)?.[1];
  if (!version) throw new Error(`${label} must declare an exact Bun version`);
  return version;
}

export async function qualifyBunRuntime(
  projectRoot = process.cwd(),
): Promise<BunRuntimeQualification> {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const dockerfilePath = path.join(projectRoot, "Dockerfile");
  const lockfilePath = path.join(projectRoot, "bun.lock");
  const packageJson = await Bun.file(packageJsonPath).json() as PackageManifest;
  const dockerfile = await Bun.file(dockerfilePath).text();
  const lockfile = await Bun.file(lockfilePath).text();

  const packageManager = declaredVersion(
    packageJson.packageManager,
    /^bun@(\d+\.\d+\.\d+)$/,
    "package.json packageManager",
  );
  const typeDefinitions = declaredVersion(
    packageJson.devDependencies?.["@types/bun"],
    /^(\d+\.\d+\.\d+)$/,
    "package.json @types/bun",
  );
  const lockfileTypeDefinitions = declaredVersion(
    lockfile,
    /"@types\/bun":\s*"(\d+\.\d+\.\d+)"/,
    "bun.lock @types/bun",
  );
  const dockerBuild = declaredVersion(
    dockerfile,
    /^FROM oven\/bun:(\d+\.\d+\.\d+)-alpine(?:@sha256:[a-f0-9]{64})? AS build$/m,
    "Docker build stage",
  );
  const dockerRuntime = declaredVersion(
    dockerfile,
    /^FROM oven\/bun:(\d+\.\d+\.\d+)-alpine(?:@sha256:[a-f0-9]{64})? AS runtime$/m,
    "Docker runtime stage",
  );

  const declarations = {
    packageManager,
    typeDefinitions,
    lockfileTypeDefinitions,
    dockerBuild,
    dockerRuntime,
  };
  const mismatches = Object.entries(declarations)
    .filter(([, version]) => version !== packageManager)
    .map(([label, version]) => `${label}=${version}`);
  if (Bun.version !== packageManager) mismatches.push(`executingRuntime=${Bun.version}`);

  if (mismatches.length > 0) {
    throw new Error(
      `Bun runtime declarations must match packageManager=${packageManager}; `
      + mismatches.join(", "),
    );
  }

  return { version: packageManager, declarations };
}

if (import.meta.main) {
  try {
    const qualification = await qualifyBunRuntime();
    console.log(`Bun ${qualification.version} runtime contract qualified.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
