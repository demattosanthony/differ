import path from "path";

type UiAssetsOptions = {
  uiDir: string;
  distDir: string;
  isCompiledRuntime: boolean;
};

export async function ensureUiAssets({ uiDir, distDir, isCompiledRuntime }: UiAssetsOptions) {
  const distIndex = path.join(distDir, "index.html");
  if (isCompiledRuntime) {
    if (!(await Bun.file(distIndex).exists())) {
      throw new Error(
        `differ: UI assets missing at ${distDir}. Run "bun run build" to generate them next to the executable.`
      );
    }
    return;
  }

  const uiIndex = path.join(uiDir, "index.html");
  if (!(await Bun.file(uiIndex).exists())) {
    throw new Error(`differ: UI source missing at ${uiDir}.`);
  }

  await Bun.build({
    entrypoints: [uiIndex],
    outdir: distDir,
    minify: false,
  });
}
