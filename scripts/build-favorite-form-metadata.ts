/** Supplies saved-ID-preserving catalog identities to the offline Python auditor. */
import { allPickerMons, pickerDexId } from '../src/favorites/model/catalog';
process.stdout.write(JSON.stringify(allPickerMons().map(mon=>({...mon,dexId:pickerDexId(mon)}))));
