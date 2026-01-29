// This is a simplified example config file for quickstart
// Some not frequently used features are omitted/commented out here
// For a full-featured example, please refer to `uptime.config.full.ts`

// Don't edit this line
import { MaintenanceConfig, PageConfig, WorkerConfig } from './types/config'

const pageConfig: PageConfig = {
  title: 'Status Neurond AI',
  links: [
    { link: 'https://neurond.com', label: 'Neurond AI' },
    { link: 'https://github.com/Neurond-AI', label: 'GitHub' },
  ],
  customFooter: '',
  group: {
    'Production': [
      'prod_assistant_neurond',
      'prod_assistant_neurond_api',
      'prod_assistant_atlas',
      'prod_document_intelligent',
      'prod_meeting_agent',
      // 'prod_proposal',
    ],
    'Staging': [
      'staging_assistant_neurond',
      'staging_assistant_neurond_api',
      'staging_document_intelligent',
      'staging_meeting_agent',
      'staging_proposal',
    ],
  },
}

const workerConfig: WorkerConfig = {
  monitors: [
    // === Production ===
    {
      id: 'prod_assistant_neurond',
      name: 'Production Assistant Neurond AI',
      method: 'GET',
      target: 'https://assistant.neurond.com/',
      statusPageLink: 'https://assistant.neurond.com/',
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'prod_assistant_neurond_api',
      name: 'Production Assistant Neurond AI - API',
      method: 'GET',
      target: 'https://assistant.neurond.com/api/health/ping',
      statusPageLink: 'https://assistant.neurond.com/',
      responseKeyword: 'pong',
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'prod_assistant_atlas',
      name: 'Production Assistant Atlas',
      method: 'GET',
      target: 'https://ai.atlasindustries.com/',
      statusPageLink: 'https://ai.atlasindustries.com/',
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'prod_document_intelligent',
      name: 'Production Document Intelligent',
      method: 'GET',
      target: 'https://drparser.neurond.com/',
      statusPageLink: 'https://drparser.neurond.com/',
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'prod_meeting_agent',
      name: 'Production Meeting Agent',
      method: 'GET',
      target: 'https://meeting.neurond.com/',
      statusPageLink: 'https://meeting.neurond.com/',
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    // Temporarily disabled
    // {
    //   id: 'prod_proposal',
    //   name: 'Production Proposal',
    //   method: 'GET',
    //   target: 'https://proposal.neurond.com/',
    //   statusPageLink: 'https://proposal.neurond.com/',
    //   checkProxy: 'worker://apac',
    //   checkProxyFallback: true,
    // },
    // === Staging ===
    {
      id: 'staging_assistant_neurond',
      name: 'Staging Assistant Neurond AI',
      method: 'GET',
      target: 'https://staging-assistant.neurond.com/',
      statusPageLink: 'https://staging-assistant.neurond.com/',
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'staging_assistant_neurond_api',
      name: 'Staging Assistant Neurond AI - API',
      method: 'GET',
      target: 'https://staging-assistant.neurond.com/api/health/ping',
      statusPageLink: 'https://staging-assistant.neurond.com/',
      responseKeyword: 'pong',
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'staging_document_intelligent',
      name: 'Staging Document Intelligent',
      method: 'GET',
      target: 'https://drparser-staging.neurond.com/',
      statusPageLink: 'https://drparser-staging.neurond.com/',
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'staging_meeting_agent',
      name: 'Staging Meeting Agent',
      method: 'GET',
      target: 'https://meeting-staging.neurond.com/',
      statusPageLink: 'https://meeting-staging.neurond.com/',
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'staging_proposal',
      name: 'Staging Proposal',
      method: 'GET',
      target: 'https://proposal-staging.neurond.com/',
      statusPageLink: 'https://proposal-staging.neurond.com/',
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
  ],
  notification: {
    // Multiple webhooks: Microsoft Teams + Outlook Email (via Power Automate)
    webhook: [
      // Microsoft Teams - via Power Automate HTTP trigger
      {
        url: 'YOUR_TEAMS_POWER_AUTOMATE_FLOW_URL',
        method: 'POST',
        payloadType: 'json',
        payload: {
          title: 'Neurond AI - Service Alert',
          message: '$MSG',
        },
      },
      // Outlook Email - via Power Automate HTTP trigger
      {
        url: 'YOUR_POWER_AUTOMATE_EMAIL_FLOW_URL',
        method: 'POST',
        payloadType: 'json',
        payload: {
          to: 'your-team@neurond.com',
          subject: 'Neurond AI - Service Status Alert',
          body: '$MSG',
        },
      },
    ],
    timeZone: 'Asia/Ho_Chi_Minh',
    gracePeriod: 5,
  },
}

// You can define multiple maintenances here
// During maintenance, an alert will be shown at status page
// Also, related downtime notifications will be skipped (if any)
// Of course, you can leave it empty if you don't need this feature

// const maintenances: MaintenanceConfig[] = []

const maintenances: MaintenanceConfig[] = []

// Don't edit this line
export { maintenances, pageConfig, workerConfig }
