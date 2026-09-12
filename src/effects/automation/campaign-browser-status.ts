import type { IssueAuthoringSessionV2 } from '../../core/automation/issue-batch';

export type CampaignBrowserResultStatus = IssueAuthoringSessionV2['browser_status'] | 'surface_blocked';

/** Campaign records have no Create-specific blocked state; it is a failure, never completion. */
export function toCampaignBrowserStatus(status: CampaignBrowserResultStatus): IssueAuthoringSessionV2['browser_status'] {
  return status === 'surface_blocked' ? 'failed' : status;
}
