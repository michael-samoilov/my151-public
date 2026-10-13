/**
 * The npm package list the Acknowledgements panel shows. Only types: the
 * build writes the list (see `scripts/acknowledgements-build.ts`), and the
 * panel fetches it when the entry opens.
 */

/** An npm package as the panel lists it. */
export interface NpmPackage {
  name: string;
  /** Absent for a notice with no version of its own (modern-normalize ships inside Tailwind CSS). */
  version?: string;
  license: string;
}

/**
 * `licenses/npm-packages.json`, which the build writes
 * (`scripts/acknowledgements-build.ts`): every package, and which license
 * file holds each notice, such as "react" or "echarts NOTICE".
 */
export interface NpmPackageIndex {
  packages: NpmPackage[];
  files: { file: string; holds: string[] }[];
}
