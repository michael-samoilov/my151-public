type GenderForm = 'male' | 'female';

const MALE_FORM_IDS = new Set([32, 415, 449, 450, 521, 592, 593, 668, 678, 876, 902, 916]);

export const GENDER_MARKS: Record<GenderForm, string> = { male: '♂', female: '♀' };

export function genderFormOf(appId: number, slug: string): GenderForm | null {
  if (appId === 29 || /-female(?:-|$)/u.test(slug)) return 'female';
  if (MALE_FORM_IDS.has(appId) || /-male(?:-|$)/u.test(slug)) return 'male';
  return null;
}
