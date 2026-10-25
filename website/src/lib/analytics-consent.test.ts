import { readAnalyticsChoice, encodeAnalyticsChoice, validMeasurementId, ANALYTICS_CHOICE_MAX_AGE } from './analytics-consent';

describe('analytics permission',()=>{
 const now=Date.UTC(2026,9,16);
 it('keeps analytics off for missing, corrupted, expired or future choices',()=>{
  for(const value of [null,'yes','{}','{"choice":"granted"}',JSON.stringify({choice:'granted',at:now+1}),JSON.stringify({choice:'granted',at:now-ANALYTICS_CHOICE_MAX_AGE-1})])expect(readAnalyticsChoice(value,now)).toBeNull();
 });
 it('preserves explicit acceptance and refusal across page visits',()=>{
  for(const choice of ['granted','denied'] as const)expect(readAnalyticsChoice(encodeAnalyticsChoice(choice,now),now+1000)).toBe(choice);
 });
 it('only accepts GA4 measurement identifiers as tag configuration',()=>{
  expect(validMeasurementId('G-DOMOTEST01')).toBe(true);
  for(const value of [undefined,'','GTM-123456','G-abc','G-<script>'])expect(validMeasurementId(value)).toBe(false);
 });
});
