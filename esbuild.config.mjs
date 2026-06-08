import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { build, context } from 'esbuild';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'dist');
const manifestPath = path.join(rootDir, 'manifest.json');
const watch = process.argv.includes('--watch');
const cleanOnly = process.argv.includes('--clean');
const validateOnly = process.argv.includes('--validate-manifest');
const communityApiUrl = process.env.AAM_COMMUNITY_API_URL ?? '';
const communityPublishableKey = process.env.AAM_COMMUNITY_PUBLISHABLE_KEY ?? '';

const requiredManifestFields = [
  'manifest_version',
  'name',
  'version',
  'background',
  'action',
  'content_scripts',
];

async function pathExists(relativePath, baseDir = rootDir) {
  try {
    await stat(path.join(baseDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

function collectManifestResources(manifest) {
  const resources = new Set([
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_page,
    manifest.side_panel?.default_path,
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
  ]);

  for (const contentScript of manifest.content_scripts ?? []) {
    for (const resource of [...(contentScript.js ?? []), ...(contentScript.css ?? [])]) {
      resources.add(resource);
    }
  }

  return [...resources].filter(Boolean);
}

async function validateManifest(baseDir = rootDir) {
  const manifest = JSON.parse(await readFile(path.join(baseDir, 'manifest.json'), 'utf8'));
  const errors = [];

  if (manifest.manifest_version !== 3) {
    errors.push('manifest_version must be 3');
  }

  if (baseDir === rootDir) {
    const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
    if (packageJson.version !== manifest.version) {
      errors.push('package.json version must match the authoritative manifest version');
    }
  }

  for (const field of requiredManifestFields) {
    if (manifest[field] === undefined) {
      errors.push(`missing required field: ${field}`);
    }
  }

  for (const resource of collectManifestResources(manifest)) {
    if (!(await pathExists(resource, baseDir))) {
      errors.push(`referenced resource does not exist: ${resource}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Manifest validation failed:\n- ${errors.join('\n- ')}`);
  }

  console.log(`Validated MV3 manifest and ${collectManifestResources(manifest).length} resources.`);
}

async function copyStaticAssets() {
  await Promise.all([
    cp(manifestPath, path.join(outDir, 'manifest.json')),
    cp(path.join(rootDir, 'icons'), path.join(outDir, 'icons'), { recursive: true }),
    cp(path.join(rootDir, 'src'), path.join(outDir, 'src'), {
      recursive: true,
      filter: source =>
        !source.startsWith(path.join(rootDir, 'src', 'domain')) &&
        !source.endsWith('.js') &&
        !source.endsWith('.ts'),
    }),
  ]);
}

const staticAssetsPlugin = {
  name: 'copy-extension-static-assets',
  setup(buildApi) {
    buildApi.onStart(async () => {
      await mkdir(outDir, { recursive: true });
      await copyStaticAssets();
    });
    buildApi.onEnd(async result => {
      if (result.errors.length === 0) {
        await validateManifest(outDir);
      }
    });
  },
};

async function getJavaScriptEntryPoints() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestScripts = collectManifestResources(manifest).filter(resource =>
    resource.endsWith('.js')
  );

  const pageScripts = [
    'src/options/options.js',
    'src/popup/popup.js',
    'src/sidepanel/sidepanel.js',
  ];
  return [...new Set([...manifestScripts, ...pageScripts])];
}

async function runBuild() {
  await rm(outDir, { recursive: true, force: true });

  /** @type {import('esbuild').BuildOptions} */
  const options = {
    entryPoints: await getJavaScriptEntryPoints(),
    outbase: '.',
    outdir: 'dist',
    bundle: false,
    platform: 'browser',
    target: ['chrome114'],
    sourcemap: watch,
    define: {
      AAM_COMMUNITY_API_URL: JSON.stringify(communityApiUrl),
      AAM_COMMUNITY_PUBLISHABLE_KEY: JSON.stringify(communityPublishableKey),
    },
    plugins: [staticAssetsPlugin],
    logLevel: 'info',
  };

  if (watch) {
    const buildContext = await context(options);
    await buildContext.watch();
    console.log('Watching extension sources...');
    return;
  }

  await build(options);
}

if (cleanOnly) {
  await rm(outDir, { recursive: true, force: true });
} else if (validateOnly) {
  await validateManifest();
} else {
  await validateManifest();
  await runBuild();
}
