// This is a simplified example config file for quickstart
// Some not frequently used features are omitted/commented out here
// For a full-featured example, please refer to `uptime.config.full.ts`

// Don't edit this line
import { MaintenanceConfig, MonitorTarget, PageConfig, WorkerConfig } from './types/config'

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
      'prod_proposal',
      'prod_proposal_api',
    ],
    'Staging': [
      'staging_assistant_neurond',
      'staging_assistant_neurond_api',
      'staging_document_intelligent',
      'staging_meeting_agent',
      'staging_proposal',
      'staging_proposal_api',
    ],
  },
}

// =============================================
// Microsoft Teams Notification Configuration
// =============================================

// MS Teams Incoming Webhook URL is stored as a Cloudflare Worker secret (env.TEAMS_WEBHOOK_URL)
// Managed via GitHub secret → Terraform variable → Worker secret_text binding (see deploy.tf)

// Grace period in minutes before sending DOWN notification
// Must match the notification.gracePeriod value below
const NOTIFICATION_GRACE_PERIOD = 5

// Monitor IDs to exclude from Teams notifications
const SKIP_NOTIFICATION_IDS: string[] = []

// Map each monitor ID to its maintainers for @mentions in Teams
// The 'email' field must be the person's UPN registered in your Microsoft 365 tenant
const MINH = { name: 'Minh Vo Ngoc Quang', email: 'minh.vo@orientsoftware.com' }
const QUYEN = { name: 'Quyen Do Duc', email: 'quyen.do@orientsoftware.com' }
const TRI = { name: 'Tri Le Duc', email: 'tri.le@orientsoftware.com' }
const SON = { name: 'Son Tran Van', email: 'son.tran@orientsoftware.com' }

const MONITOR_MENTIONS: Record<string, Array<{ name: string; email: string }>> = {
  // --- Production: Assistant Neurond AI ---
  'prod_assistant_neurond': [MINH, QUYEN],
  'prod_assistant_neurond_api': [MINH, QUYEN],
  // --- Production: Assistant Atlas ---
  'prod_assistant_atlas': [MINH, QUYEN],
  // --- Production: Document Intelligent (+ Son) ---
  'prod_document_intelligent': [MINH, QUYEN, SON],
  // --- Production: Meeting Agent (+ Tri) ---
  'prod_meeting_agent': [MINH, QUYEN, TRI],
  // --- Production: Proposal (+ Son) ---
  'prod_proposal': [MINH, QUYEN, SON],
  'prod_proposal_api': [MINH, QUYEN, SON],
  // --- Staging: Assistant Neurond AI ---
  'staging_assistant_neurond': [MINH, QUYEN],
  'staging_assistant_neurond_api': [MINH, QUYEN],
  // --- Staging: Document Intelligent (+ Son) ---
  'staging_document_intelligent': [MINH, QUYEN, SON],
  // --- Staging: Meeting Agent (+ Tri) ---
  'staging_meeting_agent': [MINH, QUYEN, TRI],
  // --- Staging: Proposal (+ Son) ---
  'staging_proposal': [MINH, QUYEN, SON],
  'staging_proposal_api': [MINH, QUYEN, SON],
  // --- Fallback ---
  'default': [MINH, QUYEN],
}

// Build and send an Adaptive Card notification to MS Teams with @mentions
async function sendTeamsNotification(
  webhookUrl: string,
  monitor: MonitorTarget,
  isUp: boolean,
  timeIncidentStart: number,
  timeNow: number,
  reason: string,
) {
  const maintainers = MONITOR_MENTIONS[monitor.id] || MONITOR_MENTIONS['default'] || []

  // Build @mention entities for Adaptive Card
  const mentionEntities = maintainers.map((m) => ({
    type: 'mention',
    text: `<at>${m.name}</at>`,
    mentioned: { id: m.email, name: m.name },
  }))
  const mentionText = maintainers.map((m) => `<at>${m.name}</at>`).join(', ')

  // Format timestamps in Vietnam timezone
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  })

  const downtimeDuration = Math.round((timeNow - timeIncidentStart) / 60)
  const timeNowFormatted = dateFormatter.format(new Date(timeNow * 1000))
  const timeStartFormatted = dateFormatter.format(new Date(timeIncidentStart * 1000))

  // Build Adaptive Card body
  const body: any[] = []

  if (isUp) {
    body.push(
      {
        type: 'TextBlock',
        size: 'Large',
        weight: 'Bolder',
        text: '✅ Service Recovered',
        color: 'Good',
        wrap: true,
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Service', value: monitor.name },
          { title: 'Status', value: 'UP - Recovered' },
          { title: 'Downtime', value: `${downtimeDuration} minutes` },
          { title: 'Recovered at', value: timeNowFormatted },
        ],
      },
    )
  } else {
    body.push(
      {
        type: 'TextBlock',
        size: 'Large',
        weight: 'Bolder',
        text: '🔴 Service Down',
        color: 'Attention',
        wrap: true,
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Service', value: monitor.name },
          { title: 'Status', value: 'DOWN' },
          { title: 'Since', value: timeStartFormatted },
          { title: 'Duration', value: `${downtimeDuration} minutes` },
          { title: 'Issue', value: reason || 'unspecified' },
        ],
      },
    )
  }

  // Add @mentions section
  if (mentionText) {
    body.push({
      type: 'TextBlock',
      wrap: true,
      separator: true,
      text: `**Maintainers:** ${mentionText}`,
    })
  }

  // Add status page link
  if (monitor.statusPageLink) {
    body.push({
      type: 'TextBlock',
      wrap: true,
      text: `[View Status Page](${monitor.statusPageLink})`,
    })
  }

  // Assemble full Adaptive Card payload for MS Teams webhook
  const payload = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          type: 'AdaptiveCard',
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.4',
          body,
          msteams: {
            entities: mentionEntities,
          },
        },
      },
    ],
  }

  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) {
      console.log(`Teams webhook error for ${monitor.name}: ${resp.status} - ${await resp.text()}`)
    } else {
      console.log(`Teams notification sent for ${monitor.name}: ${resp.status}`)
    }
  } catch (e) {
    console.log(`Teams notification error for ${monitor.name}: ${e}`)
  }
}

// Helper: check if notification should be skipped for a monitor
function shouldSkipTeamsNotification(monitorId: string, timeNow: number): boolean {
  if (SKIP_NOTIFICATION_IDS.includes(monitorId)) {
    return true
  }
  const now = new Date(timeNow * 1000)
  const inMaintenance = maintenances.some(
    (m) =>
      now >= new Date(m.start) &&
      (!m.end || now <= new Date(m.end)) &&
      m.monitors?.includes(monitorId),
  )
  return inMaintenance
}

// You can define multiple maintenances here
// During maintenance, an alert will be shown at status page
// Also, related downtime notifications will be skipped (if any)
// Of course, you can leave it empty if you don't need this feature
const maintenances: MaintenanceConfig[] = []

const workerConfig: WorkerConfig = {
  monitors: [
    // === Production ===
    {
      id: 'prod_assistant_neurond',
      name: 'Production Assistant Neurond AI',
      method: 'GET',
      target: 'https://assistant.neurond.com/',
      statusPageLink: 'https://assistant.neurond.com/',
      timeout: 15000,
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'prod_assistant_neurond_api',
      name: 'Production Assistant Neurond AI - API',
      method: 'GET',
      target: 'https://assistant.neurond.com/api/health/ping',
      statusPageLink: 'https://assistant.neurond.com/',
      timeout: 15000,
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
      timeout: 15000,
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'prod_document_intelligent',
      name: 'Production Document Intelligent',
      method: 'GET',
      target: 'https://drparser.neurond.com/',
      statusPageLink: 'https://drparser.neurond.com/',
      timeout: 15000,
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'prod_meeting_agent',
      name: 'Production Meeting Agent',
      method: 'GET',
      target: 'https://meeting.neurond.com/',
      statusPageLink: 'https://meeting.neurond.com/',
      timeout: 15000,
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'prod_proposal',
      name: 'Production Proposal',
      method: 'GET',
      target: 'https://proposal.neurond.com/',
      statusPageLink: 'https://proposal.neurond.com/',
      timeout: 15000,
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'prod_proposal_api',
      name: 'Production Proposal - API',
      method: 'GET',
      target: 'https://proposal.neurond.com/api/v1/admin/system/health',
      statusPageLink: 'https://proposal.neurond.com/',
      timeout: 15000,
      expectedCodes: [200],
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    // === Staging ===
    {
      id: 'staging_assistant_neurond',
      name: 'Staging Assistant Neurond AI',
      method: 'GET',
      target: 'https://staging-assistant.neurond.com/',
      statusPageLink: 'https://staging-assistant.neurond.com/',
      timeout: 15000,
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'staging_assistant_neurond_api',
      name: 'Staging Assistant Neurond AI - API',
      method: 'GET',
      target: 'https://staging-assistant.neurond.com/api/health/ping',
      statusPageLink: 'https://staging-assistant.neurond.com/',
      timeout: 15000,
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
      timeout: 15000,
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'staging_meeting_agent',
      name: 'Staging Meeting Agent',
      method: 'GET',
      target: 'https://meeting-staging.neurond.com/',
      statusPageLink: 'https://meeting-staging.neurond.com/',
      timeout: 15000,
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'staging_proposal',
      name: 'Staging Proposal',
      method: 'GET',
      target: 'https://proposal-staging.neurond.com/',
      statusPageLink: 'https://proposal-staging.neurond.com/',
      timeout: 15000,
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
    {
      id: 'staging_proposal_api',
      name: 'Staging Proposal - API',
      method: 'GET',
      target: 'https://proposal-staging.neurond.com/api/v1/admin/system/health',
      statusPageLink: 'https://proposal-staging.neurond.com/',
      timeout: 15000,
      expectedCodes: [200],
      checkProxy: 'worker://apac',
      checkProxyFallback: true,
    },
  ],
  notification: {
    // Webhook removed — MS Teams notifications are handled via callbacks below
    // with per-monitor @mentions in Adaptive Cards
    timeZone: 'Asia/Ho_Chi_Minh',
    gracePeriod: NOTIFICATION_GRACE_PERIOD,
    skipNotificationIds: SKIP_NOTIFICATION_IDS,
  },
  callbacks: {
    // Send UP (recovery) notification to MS Teams
    onStatusChange: async (env, monitor, isUp, timeIncidentStart, timeNow, reason) => {
      if (!isUp) return // DOWN is handled by onIncident below

      if (!env.TEAMS_WEBHOOK_URL) {
        console.log('Teams: TEAMS_WEBHOOK_URL secret not set, skipping notification')
        return
      }

      // Only send recovery notification if the incident lasted longer than
      // the grace period (meaning we already sent a DOWN notification)
      if (timeNow - timeIncidentStart < (NOTIFICATION_GRACE_PERIOD + 1) * 60 - 30) {
        console.log(
          `Teams: skipping UP notification for ${monitor.name} (grace period not met for DOWN)`,
        )
        return
      }

      if (shouldSkipTeamsNotification(monitor.id, timeNow)) {
        console.log(`Teams: skipping UP notification for ${monitor.name} (skip/maintenance)`)
        return
      }

      await sendTeamsNotification(env.TEAMS_WEBHOOK_URL, monitor, true, timeIncidentStart, timeNow, reason)
    },

    // Send DOWN notification to MS Teams (respects grace period)
    // onIncident fires every minute while a monitor is down
    onIncident: async (env, monitor, timeIncidentStart, timeNow, reason) => {
      const downtimeSecs = timeNow - timeIncidentStart

      // Only send at the grace period boundary (±30s window for timing drift)
      // This ensures the notification fires exactly once, ~5 minutes after the incident starts
      if (
        downtimeSecs < NOTIFICATION_GRACE_PERIOD * 60 - 30 ||
        downtimeSecs >= NOTIFICATION_GRACE_PERIOD * 60 + 30
      ) {
        return
      }

      if (!env.TEAMS_WEBHOOK_URL) {
        console.log('Teams: TEAMS_WEBHOOK_URL secret not set, skipping notification')
        return
      }

      if (shouldSkipTeamsNotification(monitor.id, timeNow)) {
        console.log(`Teams: skipping DOWN notification for ${monitor.name} (skip/maintenance)`)
        return
      }

      await sendTeamsNotification(env.TEAMS_WEBHOOK_URL, monitor, false, timeIncidentStart, timeNow, reason)
    },
  },
}

// Don't edit this line
export { maintenances, pageConfig, workerConfig }
