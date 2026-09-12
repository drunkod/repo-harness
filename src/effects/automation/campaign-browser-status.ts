import type { BrowserSessionStatus } from '../../cli/chatgpt-browser/types';
import type { IssueAuthoringSessionV2 } from '../../core/automation/issue-batch';

/** Campaign records have no Create-specific blocked state; it is a failure, never completion. */
export function toCampaignBrowserStatus(status: BrowserSessionStatus): IssueAuthoringSessionV2['browser_status'] {
  return status === 'surface_blocked' ? 'failed' : status;
}
