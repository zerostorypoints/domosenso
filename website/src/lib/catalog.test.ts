import {evidenceLabel} from './catalog';
test('field evidence preserves unknown, zero and positive home counts',()=>{
 expect(evidenceLabel(null)).toBe('Field evidence not recorded');
 expect(evidenceLabel(0)).toBe('Not field-tested');
 expect(evidenceLabel(1)).toBe('Tested in 1 home');
 expect(evidenceLabel(2)).toBe('Tested in 2 homes');
});
