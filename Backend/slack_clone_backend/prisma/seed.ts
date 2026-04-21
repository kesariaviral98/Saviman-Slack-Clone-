// ─────────────────────────────────────────────────────────────────────────────
// Seed script — creates a fully usable demo environment.
// Idempotent: safe to run multiple times without duplicates.
//
// Demo credentials:
//   admin@example.com  / Admin1234!   (platform admin)
//   user1@example.com  / User1234!    (Acme Corp member)
//   … through user15@example.com
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v5 as uuidv5 } from 'uuid';

const prisma = new PrismaClient();

// Deterministic UUID v5 namespace — ensures IDs are stable across seed runs.
const NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
function sid(key: string): string {
  return uuidv5(key, NS);
}

// ── Seed data definitions ────────────────────────────────────────────────────

const EMOJIS = ['👍', '❤️', '😂', '🎉', '🚀'];

const WORKSPACES = [
  { name: 'Acme Corp',   slug: 'acme-corp' },
  { name: 'Startup Inc', slug: 'startup-inc' },
  { name: 'Open Source', slug: 'open-source' },
] as const;

const CHANNEL_NAMES = ['general', 'random', 'dev', 'announcements'] as const;

// 15 workspace users (5 per workspace)
const WORKSPACE_USERS = Array.from({ length: 15 }, (_, i) => ({
  index: i + 1,
  email: `user${i + 1}@example.com`,
  displayName: [
    'Alice Johnson', 'Bob Martinez', 'Carol White', 'David Lee', 'Eva Brown',
    'Frank Chen', 'Grace Kim', 'Henry Park', 'Isabella Torres', 'Jack Wilson',
    'Kate Murphy', 'Liam Davis', 'Mia Anderson', 'Noah Taylor', 'Olivia Clark',
  ][i] as string,
}));

// Map workspace index (0,1,2) → user indices (1-indexed)
function workspaceUserIndices(wsIdx: number): number[] {
  return WORKSPACE_USERS.slice(wsIdx * 5, wsIdx * 5 + 5).map((u) => u.index);
}

// ── Message templates ─────────────────────────────────────────────────────────

const GENERAL_MESSAGES = [
  "Good morning everyone! Hope you all have a productive day ahead.",
  "Just a reminder that our team standup is at 10am today.",
  "Welcome to the team @newcomer! Great to have you with us.",
  "Has anyone reviewed the latest PRs in the queue? We need those merged before EOD.",
  "Quick poll: should we move our weekly sync to Thursdays instead of Mondays?",
  "The staging environment is back up after this morning's maintenance window.",
  "Really impressive work on the release last week. Smooth deployment!",
  "Don't forget to update your OKRs in the company wiki before Friday.",
  "Heads up: we'll be doing system maintenance this Saturday from 2-4am UTC.",
  "Anyone else think we should add more integration tests to the CI pipeline?",
  "The new onboarding flow is live in production. Let's monitor error rates closely.",
  "Great news: we hit our Q4 targets! More details in the all-hands tomorrow.",
  "Reminder to submit your time-off requests for the holidays by end of next week.",
  "The design team has shared updated brand guidelines. Please review when you can.",
  "Hot fix deployed — the payment processing issue has been resolved.",
  "API latency is back to normal after tweaking the connection pool settings.",
  "Just pushed the performance improvements. Load times are down 40%!",
  "Team lunch tomorrow at noon, we're trying the new Thai place nearby.",
  "Feature flags for the new dashboard are enabled for 10% of users.",
  "Thanks everyone for the great feedback in this week's retrospective!",
];

const RANDOM_MESSAGES = [
  "Anyone else watching the World Cup qualifiers tonight?",
  "Found a great new coffee shop near the office. Highly recommend!",
  "TIL you can pipe multiple commands in bash using xargs - mind blown.",
  "What's everyone's go-to keyboard shortcut that most people don't know about?",
  "Just finished reading Clean Architecture. Excellent book, highly recommend.",
  "It's a beautiful day outside, shame we're all staring at screens 😄",
  "Hot take: dark mode is objectively superior to light mode. Fight me.",
  "Anyone tried that new VSCode extension for AI-assisted coding?",
  "My cat just walked across my keyboard and somehow closed 3 applications.",
  "Friday vibes 🎉 Weekend plans anyone?",
  "Interesting article on the future of web development — dropping the link here.",
  "Just hit 1000 days streak on Duolingo! Language learning is addictive.",
  "Rate my setup: dual 4K monitors, mechanical keyboard, and way too much coffee.",
  "Does anyone have a good recommendation for a noise-cancelling headset?",
  "I made homemade pizza last night and it was 10/10. Highly recommend the hobby.",
  "Reminder that the gym in the building is available 24/7 if anyone wants to use it.",
  "Fun fact: the first computer bug was an actual moth found in a Harvard Mark II.",
  "Who else has been using Pomodoro technique? Game changer for focus.",
  "Anyone interested in organizing a team hiking trip this spring?",
  "Stack Overflow is down. We're all going home early.",
];

const DEV_MESSAGES = [
  "Just shipped the refactored auth module. RS256 JWT with proper refresh rotation.",
  "Reminder: no direct DB queries in route handlers. Always go through the service layer.",
  "PR #247 is up for review — the new rate limiting implementation using Redis sliding window.",
  "Found a memory leak in the WebSocket handler. Fixed in commit a3f9b21.",
  "Type safety improvement: replaced all `any` with proper generics in the API client.",
  "The test coverage for the messaging module is now at 87%. Getting close to 90%!",
  "Heads up: node_modules got corrupted on the CI runner. Cleared cache, should be fine now.",
  "We're upgrading to Prisma 5.x next sprint. Migration guide is in the wiki.",
  "Added Zod validation to all socket event handlers. No more silent type errors.",
  "Docker compose file updated — Redis now uses version 7-alpine for smaller image size.",
  "Question: should we split the messaging service into read and write handlers?",
  "The Bull queue for email notifications is processing much faster after the concurrency tweak.",
  "ESLint rule added: no-floating-promises. Found 12 unhandled promise rejections. Fixed them all.",
  "Profiling revealed N+1 queries in the channel member lookup. Fixed with a batch MGET.",
  "Running `prisma migrate dev` from a clean state takes about 8 seconds now. Much better.",
  "Implemented cursor-based pagination for messages — no more offset drift on concurrent inserts.",
  "WebRTC ICE candidates should always be buffered until the remote description is set.",
  "Reminder: all S3 downloads must go through the presign endpoint — no public bucket access.",
  "The cleanup job now runs every hour and prunes pending attachments older than 60 minutes.",
  "Added structured logging via pino. Much easier to query in production now.",
];

const ANNOUNCEMENT_MESSAGES = [
  "📢 Welcome to #announcements! This channel is for important team updates only.",
  "📋 Q4 roadmap has been finalized. Check the wiki for the full breakdown.",
  "🚀 v2.0.0 is now live in production! Release notes are in the changelog.",
  "🔒 Security reminder: please enable 2FA on all accounts by Friday.",
  "🎉 Congratulations to the team on shipping on time this quarter!",
  "📊 Monthly metrics are in: 99.97% uptime, response times p95 < 200ms.",
  "🛠 Planned maintenance window: Saturday 2:00 AM - 4:00 AM UTC.",
  "👋 Please welcome our newest team members joining next Monday!",
  "📝 Updated contribution guidelines are now in the README. Please review.",
  "⚡ Infrastructure upgrade complete — Redis cluster is now in HA mode.",
];

const MESSAGE_POOLS: Record<string, string[]> = {
  general:       GENERAL_MESSAGES,
  random:        RANDOM_MESSAGES,
  dev:           DEV_MESSAGES,
  announcements: ANNOUNCEMENT_MESSAGES,
};

// ── Thread reply templates ────────────────────────────────────────────────────

const THREAD_REPLIES = [
  ["Totally agree with this!", "Same here, well said.", "Thanks for sharing!"],
  ["I can take a look at that PR shortly.", "+1 from me, looks good to merge.", "Left some minor comments, otherwise LGTM."],
  ["Good catch! I'll fix that in the next commit.", "Already on it, should have a fix up soon.", "Opening an issue to track this."],
  ["Interesting approach. Did you consider using a different strategy?", "This is much cleaner than the previous impl.", "Nice! This should improve performance significantly."],
  ["Ha! Same thing happened to me yesterday 😂", "Classic developer moment.", "The struggle is real."],
  ["Thanks for the heads up, updating my environment now.", "Already done on my end!", "Will do after standup."],
  ["Voted 👍 for Thursday, works better for me.", "Either day works for me, I'll adapt.", "Monday is actually fine, no strong preference."],
  ["This is huge! Great work team 🎉", "Incredible effort, really proud of what we shipped.", "Smooth as butter, great job everyone."],
  ["I'll add that to the backlog for next sprint.", "Let's discuss this in the retro.", "Good idea, filing a ticket now."],
  ["Checked and confirmed — all green on my end.", "Same result here, looking good.", "Works perfectly in staging too."],
];

// ── Helper utilities ──────────────────────────────────────────────────────────

function randomDate(daysAgoMin: number, daysAgoMax: number): Date {
  const daysAgo = daysAgoMin + Math.random() * (daysAgoMax - daysAgoMin);
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(8 + Math.floor(Math.random() * 10));
  date.setMinutes(Math.floor(Math.random() * 60));
  date.setSeconds(Math.floor(Math.random() * 60));
  date.setMilliseconds(0);
  return date;
}

function pick<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) throw new Error('pick() called on empty array');
  return item;
}

// ── Main seed function ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱  Starting seed...\n');

  // ── 1. Platform admin ──────────────────────────────────────────────────────
  console.log('Creating platform admin...');
  const adminHash = await bcrypt.hash('Admin1234!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      id: sid('user:admin'),
      email: 'admin@example.com',
      displayName: 'Platform Admin',
      passwordHash: adminHash,
      isPlatformAdmin: true,
      statusText: 'Keeping the lights on',
    },
  });
  console.log(`  ✓ admin@example.com (${admin.id})`);

  // ── 2. Workspace users ─────────────────────────────────────────────────────
  console.log('\nCreating workspace users...');
  const userHash = await bcrypt.hash('User1234!', 12);
  const createdUsers: Array<{ id: string; email: string; displayName: string; index: number }> = [];

  for (const u of WORKSPACE_USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: sid(`user:${u.index}`),
        email: u.email,
        displayName: u.displayName,
        passwordHash: userHash,
        isPlatformAdmin: false,
        statusText: '',
      },
    });
    createdUsers.push({ id: user.id, email: user.email, displayName: user.displayName, index: u.index });
    console.log(`  ✓ ${u.email} — ${u.displayName}`);
  }

  // ── 3. Workspaces + members + channels ─────────────────────────────────────
  console.log('\nCreating workspaces, channels, and members...');

  for (let wsIdx = 0; wsIdx < WORKSPACES.length; wsIdx++) {
    const wsDef = WORKSPACES[wsIdx];
    if (!wsDef) continue;

    // Create workspace
    const workspace = await prisma.workspace.upsert({
      where: { slug: wsDef.slug },
      update: {},
      create: {
        id: sid(`workspace:${wsDef.slug}`),
        name: wsDef.name,
        slug: wsDef.slug,
        ownerId: admin.id,
        plan: 'pro',
      },
    });
    console.log(`\n  Workspace: ${wsDef.name} (${workspace.id})`);

    // Add admin as workspace admin member
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: admin.id } },
      update: {},
      create: {
        id: sid(`wm:${workspace.id}:${admin.id}`),
        workspaceId: workspace.id,
        userId: admin.id,
        role: 'admin',
      },
    });

    // Add 5 regular members to this workspace
    const memberIndices = workspaceUserIndices(wsIdx);
    const workspaceMembers: Array<{ id: string; displayName: string }> = [];

    for (let mIdx = 0; mIdx < memberIndices.length; mIdx++) {
      const userIdx = memberIndices[mIdx];
      if (userIdx === undefined) continue;
      const user = createdUsers.find((u) => u.index === userIdx);
      if (!user) continue;

      const role = mIdx === 0 ? 'admin' : 'member';
      await prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
        update: {},
        create: {
          id: sid(`wm:${workspace.id}:${user.id}`),
          workspaceId: workspace.id,
          userId: user.id,
          role,
        },
      });
      workspaceMembers.push(user);
    }

    console.log(`    Members: ${workspaceMembers.map((m) => m.displayName).join(', ')}`);

    // ── 4. Channels per workspace ──────────────────────────────────────────
    for (const channelName of CHANNEL_NAMES) {
      const isAnnouncement = channelName === 'announcements';
      const channel = await prisma.channel.upsert({
        where: { workspaceId_name: { workspaceId: workspace.id, name: channelName } },
        update: {},
        create: {
          id: sid(`channel:${workspace.id}:${channelName}`),
          workspaceId: workspace.id,
          name: channelName,
          isPrivate: false,
          isDm: false,
          type: isAnnouncement ? 'announcement' : 'text',
        },
      });

      // Add all workspace members (including admin) to all channels
      const allChannelUsers = [admin, ...workspaceMembers];
      for (const user of allChannelUsers) {
        await prisma.channelMember.upsert({
          where: { channelId_userId: { channelId: channel.id, userId: user.id } },
          update: {},
          create: {
            id: sid(`cm:${channel.id}:${user.id}`),
            channelId: channel.id,
            userId: user.id,
          },
        });
      }

      // ── 5. Messages per channel ──────────────────────────────────────────
      const pool = MESSAGE_POOLS[channelName] ?? GENERAL_MESSAGES;
      const channelUserIds = workspaceMembers.map((m) => m.id);

      // Generate 50 messages spread over 7 days, ensuring ascending timestamps
      const messageDates: Date[] = [];
      for (let i = 0; i < 50; i++) {
        // Day bucket: each ~7 messages per day
        const daysAgo = 7 - Math.floor(i / 7);
        messageDates.push(randomDate(daysAgo + 0.1, daysAgo));
      }
      // Sort ascending so earlier messages have earlier timestamps
      messageDates.sort((a, b) => a.getTime() - b.getTime());

      const createdMessages: string[] = [];
      for (let msgIdx = 0; msgIdx < 50; msgIdx++) {
        const msgId = sid(`msg:${channel.id}:${msgIdx}`);
        const senderId = pick(channelUserIds) ?? admin.id;
        const content = pool[msgIdx % pool.length] ?? 'Hello!';
        const createdAt = messageDates[msgIdx] ?? new Date();

        await prisma.message.upsert({
          where: { id: msgId },
          update: {},
          create: {
            id: msgId,
            channelId: channel.id,
            senderId,
            content,
            createdAt,
            metadata: {},
          },
        });
        createdMessages.push(msgId);
      }

      // ── 6. Thread reply chains (10 per workspace, distributed across channels) ──
      // Only add threads in general and dev channels
      if (channelName === 'general' || channelName === 'dev') {
        const replyBatchCount = 5; // 5 threads per eligible channel × 2 channels = 10 total per workspace
        for (let threadIdx = 0; threadIdx < replyBatchCount; threadIdx++) {
          const parentMsgId = createdMessages[threadIdx * 8]; // spread across channel
          if (!parentMsgId) continue;

          const replySet = THREAD_REPLIES[threadIdx % THREAD_REPLIES.length] ?? THREAD_REPLIES[0];
          if (!replySet) continue;

          for (let replyIdx = 0; replyIdx < replySet.length; replyIdx++) {
            const replyContent = replySet[replyIdx];
            if (!replyContent) continue;
            const senderId = pick(channelUserIds) ?? admin.id;
            const parentMsg = await prisma.message.findUnique({ where: { id: parentMsgId } });
            const parentDate = parentMsg?.createdAt ?? new Date();
            const replyDate = new Date(parentDate.getTime() + (replyIdx + 1) * 5 * 60_000); // 5 min apart

            await prisma.message.upsert({
              where: { id: sid(`reply:${channel.id}:${threadIdx}:${replyIdx}`) },
              update: {},
              create: {
                id: sid(`reply:${channel.id}:${threadIdx}:${replyIdx}`),
                channelId: channel.id,
                senderId,
                parentId: parentMsgId,
                content: replyContent,
                createdAt: replyDate,
                metadata: {},
              },
            });
          }
        }
      }

      // ── 7. Reactions (5 emoji reactions spread across 5 messages) ──────────
      const reactTargets = createdMessages.slice(0, 5);
      for (let reactIdx = 0; reactIdx < reactTargets.length; reactIdx++) {
        const targetMsgId = reactTargets[reactIdx];
        if (!targetMsgId) continue;
        const emoji = EMOJIS[reactIdx % EMOJIS.length] ?? '👍';

        // Have 2-3 users react to each message
        const reactors = channelUserIds.slice(0, Math.min(3, channelUserIds.length));
        for (const reactorId of reactors) {
          await prisma.reaction.upsert({
            where: {
              messageId_userId_emoji: {
                messageId: targetMsgId,
                userId: reactorId,
                emoji,
              },
            },
            update: {},
            create: {
              id: sid(`reaction:${targetMsgId}:${reactorId}:${emoji}`),
              messageId: targetMsgId,
              userId: reactorId,
              emoji,
            },
          });
        }
      }

      console.log(`    #${channelName}: 50 messages seeded`);
    }

    // ── 8. Unread notifications for non-admin workspace members ───────────
    console.log(`    Creating notifications for ${wsDef.name} members...`);
    for (const member of workspaceMembers) {
      // Mention notification
      const mentionMsgId = sid(`msg:${sid(`channel:${workspace.id}:general`)}:0`);
      await prisma.notification.upsert({
        where: { id: sid(`notif:mention:${workspace.id}:${member.id}`) },
        update: {},
        create: {
          id: sid(`notif:mention:${workspace.id}:${member.id}`),
          userId: member.id,
          type: 'mention',
          payload: {
            messageId: mentionMsgId,
            channelId: sid(`channel:${workspace.id}:general`),
            workspaceId: workspace.id,
            fromUserId: admin.id,
            fromDisplayName: 'Platform Admin',
            preview: 'Hey team! You were mentioned in #general.',
          },
          isRead: false,
        },
      });

      // Reply notification
      const replyMsgId = sid(`msg:${sid(`channel:${workspace.id}:dev`)}:5`);
      await prisma.notification.upsert({
        where: { id: sid(`notif:reply:${workspace.id}:${member.id}`) },
        update: {},
        create: {
          id: sid(`notif:reply:${workspace.id}:${member.id}`),
          userId: member.id,
          type: 'reply',
          payload: {
            messageId: replyMsgId,
            channelId: sid(`channel:${workspace.id}:dev`),
            workspaceId: workspace.id,
            fromUserId: admin.id,
            fromDisplayName: 'Platform Admin',
            preview: 'Someone replied to your message in #dev.',
          },
          isRead: false,
        },
      });
    }
  }

  console.log('\n✅  Seed complete!\n');
  console.log('Demo accounts:');
  console.log('  admin@example.com     / Admin1234!  (platform admin)');
  console.log('  user1@example.com     / User1234!   (Acme Corp)');
  console.log('  user6@example.com     / User1234!   (Startup Inc)');
  console.log('  user11@example.com    / User1234!   (Open Source)');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
