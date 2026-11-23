const uuid = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const seasonPath = new RegExp('^/teams/imported/' + uuid + '/' + uuid + '/heatmap$', 'i');
export function isSeasonHeatmapPath(value: string | undefined): value is `/teams/imported/${string}` {
  return typeof value === 'string' && seasonPath.test(value);
}
