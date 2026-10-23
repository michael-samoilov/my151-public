export interface NpmPackage {
  name: string;
  version?: string;
  license: string;
}

export interface NpmPackageIndex {
  packages: NpmPackage[];
  files: { file: string; holds: string[] }[];
}
