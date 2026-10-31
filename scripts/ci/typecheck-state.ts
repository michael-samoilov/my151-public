// npm runs this before `npm run build` (the `prebuild` script). See dropTypecheckStateAfterDependencyChange.
import { dropTypecheckStateAfterDependencyChange } from './cache';

if (dropTypecheckStateAfterDependencyChange(process.cwd())) console.log('Type check starts cold: installed dependencies changed.');
