import { type DemoSource, DemoType, Game } from 'csdm/common/types/counter-strike';
import type { Demo } from 'csdm/common/types/demo';
import type { HandlerContext } from 'csdm/server/messages/handler';
import { getDemoFromFilePath } from 'csdm/node/demo/get-demo-from-file-path';
import { fetchMatchChecksums } from 'csdm/node/database/matches/fetch-match-checksums';
import { db } from 'csdm/node/database/database';
import { analysesListener } from 'csdm/server/analyses-listener';
import { ensureDatabaseConnection } from 'csdm/server/ensure-database-connection';
import { server } from 'csdm/server/server';
import { handleError } from '../handle-error';
import { SupportedDemoSourcesPerGame } from 'csdm/common/counter-strike/supported-demo-sources';

export type AddDemoPathsToAnalysesPayload = {
  demoPaths: string[];
  force: boolean;
  analyzePositions: boolean;
  source?: DemoSource;
};

export type AddDemoPathsToAnalysesResult = {
  addedDemos: { checksum: string; demoPath: string }[];
  skippedDemoPaths: string[];
  skippedChecksums: Record<string, string>;
  unsupportedDemos: { demoPath: string; source: DemoSource; reason: 'source' | 'pov' }[];
};

export async function addDemoPathsToAnalysesHandler(
  payload: AddDemoPathsToAnalysesPayload,
  context?: HandlerContext,
): Promise<AddDemoPathsToAnalysesResult> {
  try {
    await ensureDatabaseConnection();
    const checksums = await fetchMatchChecksums();
    const demos: Demo[] = [];
    const addedDemos: AddDemoPathsToAnalysesResult['addedDemos'] = [];
    const skippedChecksums: Record<string, string> = {};
    const skippedDemoPaths: string[] = [];
    const unsupportedDemos: AddDemoPathsToAnalysesResult['unsupportedDemos'] = [];
    for (const demoPath of payload.demoPaths) {
      const demo = await getDemoFromFilePath(demoPath);
      if (payload.source !== undefined) {
        demo.source = payload.source;
      }
      if (!SupportedDemoSourcesPerGame[demo.game].includes(demo.source)) {
        unsupportedDemos.push({ demoPath, source: demo.source, reason: 'source' });
        continue;
      }
      if (demo.type === DemoType.POV && demo.game !== Game.CSGO) {
        unsupportedDemos.push({ demoPath, source: demo.source, reason: 'pov' });
        continue;
      }
      if (!payload.force && checksums.includes(demo.checksum)) {
        const positions = payload.analyzePositions
          ? await db
              .selectFrom('player_positions')
              .select('round_number')
              .where('match_checksum', '=', demo.checksum)
              .limit(1)
              .executeTakeFirst()
          : true;
        if (positions) {
          skippedDemoPaths.push(demoPath);
          skippedChecksums[demoPath] = demo.checksum;
          continue;
        }
      }
      // The same demo may be given several times (duplicated path argument or identical copies in different folders),
      // queue it only once.
      const isDuplicate = addedDemos.some((addedDemo) => addedDemo.checksum === demo.checksum);
      if (isDuplicate) {
        continue;
      }
      demos.push(demo);
      // Demos already in the pending analyses are reported as added: the CLI tracks their completion through the
      // AnalysisUpdated push messages, whether they were queued by the CLI or the GUI.
      addedDemos.push({ checksum: demo.checksum, demoPath });
    }

    // The CLI gives up on the request after a timeout and disconnects, which released the demos it queued.
    // Queueing them now would analyze demos no client waits for.
    if (context?.clientId !== undefined && !server.isCliClientConnected(context.clientId)) {
      logger.warn('The CLI client disconnected before its demos were queued for analysis, ignoring them');
      return { addedDemos: [], skippedDemoPaths, skippedChecksums, unsupportedDemos };
    }

    // ! Not awaited: it would resolve only once the whole analyses queue completed and the CLI request would
    // time out. The CLI tracks completion through the AnalysisUpdated push messages.
    analysesListener
      .addDemosToAnalyses(demos, {
        analyzePositions: payload.analyzePositions,
        clientId: context?.clientId,
      })
      .catch((error: unknown) => {
        logger.error('Error while processing the analyses queue');
        logger.error(error);
      });

    return { addedDemos, skippedDemoPaths, skippedChecksums, unsupportedDemos };
  } catch (error) {
    return handleError(error, 'Error while adding demo paths to analyses');
  }
}
