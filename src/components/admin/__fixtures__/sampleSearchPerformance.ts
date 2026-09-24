import type { SearchDailyPoint, SearchPerformanceSnapshot } from '@/lib/searchPerformance';
import { buildSearchIntelligenceView } from '@/lib/searchIntelligence';

function sampleDaily(provider: 'google' | 'bing'): SearchDailyPoint[] {
  const end = Date.UTC(2026, 8, provider === 'google' ? 19 : 21);
  return Array.from({ length: 90 }, (_, index) => {
    const phase = index / 7;
    const base = provider === 'google' ? 82 : 31;
    const impressions = Math.max(4, Math.round(base + index * (provider === 'google' ? 1.35 : 0.48) + Math.sin(phase) * 24));
    const clicks = Math.max(0, Math.round(impressions * (provider === 'google' ? 0.061 : 0.047) + Math.sin(index) * 1.5));
    return {
      date: new Date(end - (89 - index) * 86_400_000).toISOString().slice(0, 10),
      impressions,
      clicks,
      ctr: clicks / impressions,
      position: (provider === 'google' ? 11.8 : 15.2) - index * 0.035 + Math.sin(phase) * 0.7,
    };
  });
}

export const sampleSearchPerformance: SearchPerformanceSnapshot = {
  generatedAt: '2026-09-22T15:30:00.000Z',
  providers: {
    google: {
      provider: 'google',
      status: 'ready',
      fetchedAt: '2026-09-22T15:30:00.000Z',
      dataThrough: '2026-09-19',
      daily: sampleDaily('google'),
      pages: [
        { key: 'https://my151.app/', clicks: 58, impressions: 812, ctr: 58 / 812, position: 8.4 },
        { key: 'https://my151.app/pokedex-builder', clicks: 41, impressions: 693, ctr: 41 / 693, position: 9.7 },
        { key: 'https://my151.app/custom-gym-leader', clicks: 23, impressions: 344, ctr: 23 / 344, position: 12.1 },
      ],
      previousPages: [
        { key: 'https://my151.app/', clicks: 70, impressions: 970, ctr: 70 / 970, position: 7.9 },
        { key: 'https://my151.app/pokedex-builder', clicks: 22, impressions: 420, ctr: 22 / 420, position: 12.8 },
        { key: 'https://my151.app/custom-gym-leader', clicks: 31, impressions: 610, ctr: 31 / 610, position: 9.4 },
      ],
      queries: [
        { key: 'pokemon team builder', clicks: 28, impressions: 381, ctr: 28 / 381, position: 7.6 },
        { key: 'personal pokemon 151', clicks: 19, impressions: 224, ctr: 19 / 224, position: 5.2 },
        { key: 'pokemon gym leader maker', clicks: 16, impressions: 197, ctr: 16 / 197, position: 8.8 },
      ],
      pageQueries: [
        { page: 'https://my151.app/', query: 'personal pokemon 151', clicks: 19, impressions: 224, ctr: 19 / 224, position: 5.2 },
        { page: 'https://my151.app/pokedex-builder', query: 'pokemon team builder', clicks: 28, impressions: 381, ctr: 28 / 381, position: 7.6 },
        { page: 'https://my151.app/custom-gym-leader', query: 'pokemon gym leader maker', clicks: 16, impressions: 197, ctr: 16 / 197, position: 8.8 },
      ],
    },
    bing: {
      provider: 'bing',
      status: 'ready',
      fetchedAt: '2026-09-22T15:30:00.000Z',
      dataThrough: '2026-09-21',
      message: 'Bing page and query detail may update less often than the daily totals.',
      daily: sampleDaily('bing'),
      pages: [
        { key: 'https://my151.app/', clicks: 18, impressions: 303, ctr: 18 / 303, position: 11.7 },
        { key: 'https://my151.app/custom-gym-leader', clicks: 9, impressions: 151, ctr: 9 / 151, position: 13.4 },
      ],
      queries: [
        { key: 'pokemon 151 builder', clicks: 11, impressions: 174, ctr: 11 / 174, position: 9.1 },
        { key: 'make a gym leader team', clicks: 7, impressions: 96, ctr: 7 / 96, position: 10.6 },
      ],
    },
  },
};

export const sampleSearchIntelligence = buildSearchIntelligenceView(sampleSearchPerformance, {
  environment: 'preview',
  gitRef: 'codex/search-intelligence',
  gitSha: 'abcdef12',
  gitMessage: 'feat(admin): add search intelligence',
  url: 'preview.my151.app',
  deploymentHistory: 'unavailable',
});

