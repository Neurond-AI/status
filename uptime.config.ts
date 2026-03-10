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
  maintenances: {
    upcomingColor: 'gray',
  },
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
      'prod_docs_neurond',
    ],
    'Staging': [
      'staging_assistant_neurond',
      'staging_assistant_neurond_api',
      'staging_document_intelligent',
      'staging_meeting_agent',
      'staging_proposal',
      'staging_proposal_api',
      'staging_docs_neurond',
    ],
  },
}

// =============================================
// Microsoft Teams Notification Configuration
// =============================================

// MS Teams Webhook URL is stored as a Cloudflare Worker secret (env.TEAMS_WEBHOOK_URL)
// Managed via GitHub secret → Terraform variable → Worker secret_text binding (see deploy.tf)
// Supports both old O365 connector (webhook.office.com) and Workflows (Power Automate) URLs

// Grace period in minutes before sending DOWN notification
// Must match the notification.gracePeriod value below
const NOTIFICATION_GRACE_PERIOD = 5

// Monitor IDs to exclude from Teams notifications
const SKIP_NOTIFICATION_IDS: string[] = []

// Map each monitor ID to its maintainers for @mentions in Teams
// The 'email' field must be the person's UPN registered in your Microsoft 365 tenant
const MINH = { name: 'Minh Vo Ngoc Quang', email: 'minh.vo@orientsoftware.com' }
const QUYEN = { name: 'Quyen Do Duc', email: 'quyen.do@orientsoftware.com' }
const QUYEN_B = { name: 'Quyen Bui', email: 'quyen.bui@orientsoftware.com' }
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
  // --- Production: Docs ---
  'prod_docs_neurond': [MINH, QUYEN, QUYEN_B],
  // --- Staging: Docs ---
  'staging_docs_neurond': [MINH, QUYEN, QUYEN_B],
  // --- Fallback ---
  'default': [MINH, QUYEN],
}

// Notification queue: accumulates events during a single cron cycle, flushed by onAllChecksComplete
type NotificationQueueItem = {
  monitor: MonitorTarget
  isUp: boolean
  timeIncidentStart: number
  timeNow: number
  reason: string
}
let notificationQueue: NotificationQueueItem[] = []

// Track monitors with an active DOWN notification to deduplicate.
// The UptimeFlare framework fires onStatusChange not only on UP↔DOWN transitions,
// but also when the error reason changes while still DOWN (e.g. "timeout" → "connection refused").
// Without this guard, every error-reason change sends a new DOWN notification.
const notifiedDownMonitors = new Set<string>()

// Build the Adaptive Card payload for MS Teams.
// Supports both old Incoming Webhook connectors and new Workflows / Power Automate webhooks.
// Old connectors: wrap card in { type: "message", attachments: [...] }
// New Workflows:  send the Adaptive Card directly as the body
function buildTeamsPayload(
  webhookUrl: string,
  body: any[],
  actions: any[],
  mentionEntities: any[],
) {
  const card = {
    type: 'AdaptiveCard',
    $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body,
    actions,
    msteams: {
      entities: mentionEntities,
    },
  }

  // Old Incoming Webhook connector URLs contain '/IncomingWebhook/' on the
  // legacy *.webhook.office.com host (not outlook.webhook.office.com).
  // New Workflows webhooks (outlook.webhook.office.com or *.logic.azure.com)
  // expect the Adaptive Card directly.
  const isLegacyConnector =
    webhookUrl.includes('.webhook.office.com/') &&
    !webhookUrl.includes('outlook.webhook.office.com/')

  if (isLegacyConnector) {
    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: card,
        },
      ],
    }
  }

  return card
}

// Build and send an Adaptive Card notification to MS Teams with @mentions (single monitor)
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

  // Detect environment from monitor ID
  const environment = monitor.id.startsWith('staging_') ? 'Staging' : 'Production'

  // Build Adaptive Card body
  const body: any[] = []

  // Header container with colored background — "Production - Service Name" shown prominently
  body.push({
    type: 'Container',
    style: isUp ? 'good' : 'attention',
    bleed: true,
    items: [
      {
        type: 'TextBlock',
        size: 'Large',
        weight: 'Bolder',
        text: isUp
          ? `✅ ${environment} — ${monitor.name} Recovered`
          : `🚨 ${environment} — ${monitor.name} Down`,
        wrap: true,
      },
    ],
  })

  // Details section
  if (isUp) {
    body.push({
      type: 'FactSet',
      separator: true,
      spacing: 'Medium',
      facts: [
        { title: 'Service', value: `${environment} - ${monitor.name}` },
        { title: 'Status', value: '🟢 Recovered' },
        { title: 'Downtime', value: `${downtimeDuration} min` },
        { title: 'Recovered at', value: timeNowFormatted },
        { title: 'Incident start', value: timeStartFormatted },
      ],
    })
  } else {
    body.push({
      type: 'FactSet',
      separator: true,
      spacing: 'Medium',
      facts: [
        { title: 'Service', value: `${environment} - ${monitor.name}` },
        { title: 'Status', value: '🔴 DOWN' },
        { title: 'Since', value: timeStartFormatted },
        { title: 'Duration', value: `${downtimeDuration} min` },
        { title: 'Issue', value: reason || 'Unknown' },
      ],
    })
  }

  // @mentions section
  if (mentionText) {
    body.push({
      type: 'TextBlock',
      wrap: true,
      separator: true,
      spacing: 'Medium',
      text: `**Maintainers:** ${mentionText}`,
    })
  }

  // Assemble actions (status page button)
  const actions: any[] = []
  if (monitor.statusPageLink) {
    actions.push({
      type: 'Action.OpenUrl',
      title: 'View Status Page',
      url: monitor.statusPageLink,
    })
  }

  const payload = buildTeamsPayload(webhookUrl, body, actions, mentionEntities)

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
// This serves as defense-in-depth — the scheduler (index.ts) also checks maintenance centrally
function shouldSkipTeamsNotification(monitorId: string, timeNow: number): boolean {
  if (SKIP_NOTIFICATION_IDS.includes(monitorId)) {
    return true
  }
  const now = new Date(timeNow * 1000)
  const inMaintenance = maintenances.some(
    (m) =>
      now >= new Date(m.start) &&
      (!m.end || now <= new Date(m.end)) &&
      (!m.monitors || m.monitors.length === 0 || m.monitors.includes(monitorId)),
  )
  return inMaintenance
}

// Build and send a grouped Adaptive Card for multiple monitors sharing the same maintainers
async function sendGroupedTeamsNotification(
  webhookUrl: string,
  items: NotificationQueueItem[],
) {
  const isUp = items[0].isUp
  const firstMonitor = items[0].monitor

  const maintainers = MONITOR_MENTIONS[firstMonitor.id] || MONITOR_MENTIONS['default'] || []

  const mentionEntities = maintainers.map((m) => ({
    type: 'mention',
    text: `<at>${m.name}</at>`,
    mentioned: { id: m.email, name: m.name },
  }))
  const mentionText = maintainers.map((m) => `<at>${m.name}</at>`).join(', ')

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  })

  const environments = Array.from(new Set(items.map((item) =>
    item.monitor.id.startsWith('staging_') ? 'Staging' : 'Production'
  )))
  const environmentLabel = environments.length === 1 ? environments[0] : environments.join(' & ')

  const body: any[] = []

  // Header — environment and service names shown prominently
  const monitorNamesList = items.map((i) => i.monitor.name).join(', ')
  body.push({
    type: 'Container',
    style: isUp ? 'good' : 'attention',
    bleed: true,
    items: [
      {
        type: 'TextBlock',
        size: 'Large',
        weight: 'Bolder',
        text: isUp
          ? `✅ ${environmentLabel} — ${items.length} Services Recovered`
          : `🚨 ${environmentLabel} — ${items.length} Services Down`,
        wrap: true,
      },
      {
        type: 'TextBlock',
        text: monitorNamesList,
        wrap: true,
        spacing: 'Small',
      },
    ],
  })

  // Per-monitor detail blocks
  for (const item of items) {
    const downtimeDuration = Math.round((item.timeNow - item.timeIncidentStart) / 60)
    const environment = item.monitor.id.startsWith('staging_') ? 'Staging' : 'Production'

    if (isUp) {
      body.push({
        type: 'Container',
        separator: true,
        spacing: 'Medium',
        items: [
          {
            type: 'TextBlock',
            weight: 'Bolder',
            text: `${environment} - ${item.monitor.name}`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Downtime', value: `${downtimeDuration} min` },
              { title: 'Recovered at', value: dateFormatter.format(new Date(item.timeNow * 1000)) },
            ],
          },
        ],
      })
    } else {
      body.push({
        type: 'Container',
        separator: true,
        spacing: 'Medium',
        items: [
          {
            type: 'TextBlock',
            weight: 'Bolder',
            text: `${environment} - ${item.monitor.name}`,
            wrap: true,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Since', value: dateFormatter.format(new Date(item.timeIncidentStart * 1000)) },
              { title: 'Duration', value: `${downtimeDuration} min` },
              { title: 'Issue', value: item.reason || 'Unknown' },
            ],
          },
        ],
      })
    }
  }

  // @mentions
  if (mentionText) {
    body.push({
      type: 'TextBlock',
      wrap: true,
      separator: true,
      spacing: 'Medium',
      text: `**Maintainers:** ${mentionText}`,
    })
  }

  // Actions: single status page button if all monitors share the same link
  const actions: any[] = []
  const statusPageLinks = Array.from(new Set(
    items.map((item) => item.monitor.statusPageLink).filter(Boolean) as string[]
  ))
  if (statusPageLinks.length === 1) {
    actions.push({
      type: 'Action.OpenUrl',
      title: 'View Status Page',
      url: statusPageLinks[0],
    })
  }

  const payload = buildTeamsPayload(webhookUrl, body, actions, mentionEntities)

  const monitorNames = items.map((i) => i.monitor.name).join(', ')
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) {
      console.log(`Teams grouped webhook error for [${monitorNames}]: ${resp.status} - ${await resp.text()}`)
    } else {
      console.log(`Teams grouped notification sent for [${monitorNames}]: ${resp.status}`)
    }
  } catch (e) {
    console.log(`Teams grouped notification error for [${monitorNames}]: ${e}`)
  }
}

// You can define multiple maintenances here
// During maintenance, an alert will be shown at status page
// Also, related downtime notifications will be skipped (if any)
//
// Schedule (GMT+7 / Asia/Ho_Chi_Minh):
//   Monday–Friday:  6:00 PM → 8:00 AM next day
//   Weekend:        Friday 6:00 PM → Monday 8:00 AM (all day Saturday & Sunday)
const maintenances: MaintenanceConfig[] = [
  ...(function () {
    const schedules: MaintenanceConfig[] = []
    const today = new Date()

    // Generate maintenance windows for -1 to +2 months
    const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const endDate = new Date(today.getFullYear(), today.getMonth() + 3, 0)

    const allStagingMonitors = [
      'staging_assistant_neurond',
      'staging_assistant_neurond_api',
      'staging_document_intelligent',
      'staging_meeting_agent',
      'staging_proposal',
      'staging_proposal_api',
      'staging_docs_neurond',
    ]

    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay() // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

      if (dow >= 1 && dow <= 4) {
        // Monday–Thursday: 6 PM → next day 8 AM
        const next = new Date(d)
        next.setDate(next.getDate() + 1)

        schedules.push({
          monitors: allStagingMonitors,
          title: 'Nightly Maintenance',
          body: 'Scheduled nightly maintenance window (6:00 PM – 8:00 AM GMT+7)',
          start: `${fmt(d)}T18:00:00+07:00`,
          end: `${fmt(next)}T08:00:00+07:00`,
          color: 'blue',
        })
      } else if (dow === 5) {
        // Friday: 6 PM → Monday 8 AM (covers entire weekend)
        const monday = new Date(d)
        monday.setDate(monday.getDate() + 3)

        schedules.push({
          monitors: allStagingMonitors,
          title: 'Weekend Maintenance',
          body: 'Scheduled weekend maintenance window (Friday 6:00 PM – Monday 8:00 AM GMT+7)',
          start: `${fmt(d)}T18:00:00+07:00`,
          end: `${fmt(monday)}T08:00:00+07:00`,
          color: 'blue',
        })
      }
      // Saturday & Sunday are covered by Friday's entry
    }

    return schedules
  })(),
]

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
    {
      id: 'prod_docs_neurond',
      name: 'Production Docs Neurond AI',
      method: 'GET',
      target: 'https://docs.neurond.com/',
      statusPageLink: 'https://docs.neurond.com/',
      timeout: 15000,
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
    {
      id: 'staging_docs_neurond',
      name: 'Staging Docs Neurond AI',
      method: 'GET',
      target: 'https://staging-docs.neurond.com/',
      statusPageLink: 'https://staging-docs.neurond.com/',
      timeout: 15000,
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
    // Queue DOWN and UP notifications on status change.
    // NOTE: The UptimeFlare framework fires onStatusChange not only on UP↔DOWN transitions
    // but also when the error reason changes while still DOWN. We use notifiedDownMonitors
    // to send exactly one DOWN notification per incident and clear it on recovery.
    onStatusChange: async (env, monitor, isUp, timeIncidentStart, timeNow, reason) => {
      if (shouldSkipTeamsNotification(monitor.id, timeNow)) {
        console.log(
          `Teams: skipping ${isUp ? 'UP' : 'DOWN'} notification for ${monitor.name} (skip/maintenance)`,
        )
        return
      }

      if (!isUp) {
        // Only send DOWN once per incident — skip error-reason-change duplicates
        if (notifiedDownMonitors.has(monitor.id)) {
          console.log(
            `Teams: skipping duplicate DOWN for ${monitor.name} (error reason changed, already notified)`,
          )
          return
        }
        notifiedDownMonitors.add(monitor.id)
      } else {
        // Clear the dedup flag on recovery
        notifiedDownMonitors.delete(monitor.id)
      }

      notificationQueue.push({ monitor, isUp, timeIncidentStart, timeNow, reason })
      console.log(`Teams: queued ${isUp ? 'UP' : 'DOWN'} notification for ${monitor.name}`)
    },

    // Flush all queued notifications as grouped Adaptive Cards
    onAllChecksComplete: async (env) => {
      if (notificationQueue.length === 0) return

      if (!env.TEAMS_WEBHOOK_URL) {
        console.log('Teams: TEAMS_WEBHOOK_URL secret not set, skipping all notifications')
        notificationQueue = []
        return
      }

      console.log(`Teams: processing ${notificationQueue.length} queued notification(s)`)

      // Group by (sorted maintainer emails + UP/DOWN direction)
      const groups: Record<string, NotificationQueueItem[]> = {}
      for (const item of notificationQueue) {
        const maintainers = MONITOR_MENTIONS[item.monitor.id] || MONITOR_MENTIONS['default'] || []
        const maintainerKey = maintainers.map((m) => m.email).sort().join(',')
        const groupKey = `${maintainerKey}|${item.isUp ? 'UP' : 'DOWN'}`

        if (!groups[groupKey]) {
          groups[groupKey] = []
        }
        groups[groupKey].push(item)
      }

      // Send one card per group
      const groupKeys = Object.keys(groups)
      for (const groupKey of groupKeys) {
        const items = groups[groupKey]
        try {
          if (items.length === 1) {
            // Single monitor: use existing card format (unchanged visual)
            const item = items[0]
            await sendTeamsNotification(
              env.TEAMS_WEBHOOK_URL,
              item.monitor,
              item.isUp,
              item.timeIncidentStart,
              item.timeNow,
              item.reason,
            )
          } else {
            // Multiple monitors: send grouped card
            await sendGroupedTeamsNotification(env.TEAMS_WEBHOOK_URL, items)
          }
        } catch (e) {
          console.log(`Teams: error sending notification for group [${groupKey}]: ${e}`)
        }
      }

      // Clear the queue
      notificationQueue = []
    },
  },
}

// Don't edit this line
export { maintenances, pageConfig, workerConfig }
