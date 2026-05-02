#!/usr/bin/env node
/**
 * SATEX Phase 5: Weekly Progress Report Generator
 *
 * Usage:
 *   npx ts-node scripts/generate-weekly-report.ts [week]
 *   npm run report:weekly
 *
 * Generates:
 *   - Weekly standup from template
 *   - Burndown chart
 *   - Gate status
 *   - Risk register update
 *
 * Requirements:
 *   - PROGRESS_TRACKING.json (source of truth)
 *   - WEEKLY_STANDUP_TEMPLATE.md (template)
 *   - GitHub Actions environment (for CI metrics)
 */

import * as fs from 'fs';
import * as path from 'path';

interface Task {
  id: string;
  name: string;
  hours: number;
  owner: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' | 'QUEUED';
  acceptanceCriteria: string[];
  files?: string[];
}

interface Category {
  id: string;
  name: string;
  totalHours: number;
  owner: string;
  status: string;
  tasks: Task[];
}

interface ProgressData {
  projectName: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  statusSnapshot: {
    hoursCompleted: number;
    hoursRemaining: number;
    percentComplete: number;
  };
  categories: Category[];
  weeklyBurndown: Array<{
    week: number;
    plannedHours: number;
    actualHours: number;
    percentComplete: number;
  }>;
}

function getWeekNumber(): number {
  const startDate = new Date('2026-05-01');
  const now = new Date();
  const diffMs = now.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

function loadProgressData(): ProgressData {
  const filePath = path.join(
    __dirname,
    '..',
    '00-PROJECT-ROOT',
    'PROGRESS_TRACKING.json'
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `PROGRESS_TRACKING.json not found at ${filePath}\n` +
      'Run this script from the project root directory.'
    );
  }

  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data);
}

function calculateCategoryMetrics(category: Category): {
  totalHours: number;
  completedHours: number;
  percentComplete: number;
  tasksTotal: number;
  tasksDone: number;
} {
  const tasks = category.tasks || [];
  const totalHours = category.totalHours;

  let completedHours = 0;
  let tasksDone = 0;

  for (const task of tasks) {
    if (task.status === 'DONE') {
      completedHours += task.hours;
      tasksDone += 1;
    }
  }

  return {
    totalHours,
    completedHours,
    percentComplete: Math.round((completedHours / totalHours) * 100),
    tasksTotal: tasks.length,
    tasksDone,
  };
}

function generateBurndownChart(data: ProgressData): string {
  const weeks = data.weeklyBurndown || [];
  const lines: string[] = [];

  lines.push('### 📊 WEEKLY BURNDOWN');
  lines.push('');
  lines.push('```');
  lines.push('Week | Planned | Actual | % Done | Status');
  lines.push('-----|---------|--------|--------|--------');

  for (const week of weeks) {
    const status =
      week.actualHours === 0 ? 'NOT_STARTED' :
      week.actualHours >= week.plannedHours * 0.95 ? '✅ ON_TRACK' :
      week.actualHours >= week.plannedHours * 0.80 ? '🟡 AT_RISK' :
      '🔴 BEHIND';

    const bar = '█'.repeat(Math.floor(week.percentComplete / 5));
    lines.push(
      `${week.week}    | ${week.plannedHours}h    | ${week.actualHours}h    | ${week.percentComplete}%  | ${status}`
    );
  }

  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

function generateCategoryStatus(data: ProgressData): string {
  const lines: string[] = [];

  lines.push('### 📋 CATEGORY STATUS');
  lines.push('');
  lines.push('| Category | Owner | Total | Done | % | Status |');
  lines.push('|----------|-------|-------|------|---|--------|');

  for (const category of data.categories) {
    const metrics = calculateCategoryMetrics(category);
    const statusEmoji =
      metrics.percentComplete === 100 ? '✅' :
      metrics.percentComplete > 0 ? '🟡' :
      '⬜';

    lines.push(
      `| **${category.id}. ${category.name}** | ` +
      `${category.owner} | ` +
      `${metrics.totalHours}h | ` +
      `${metrics.completedHours}h | ` +
      `${metrics.percentComplete}% | ` +
      `${statusEmoji} |`
    );
  }

  lines.push('');

  return lines.join('\n');
}

function generateGateStatus(data: ProgressData): string {
  const lines: string[] = [];

  lines.push('### 🎯 GO/NO-GO GATES');
  lines.push('');

  // Simplified gate status (would need to read from JSON)
  const gates = [
    { num: 1, name: 'Code Hardening', date: '2026-05-07', status: 'PENDING' },
    { num: 2, name: 'Testing Complete', date: '2026-05-21', status: 'PENDING' },
    { num: 3, name: 'Packaging Ready', date: '2026-05-28', status: 'PENDING' },
    { num: 4, name: 'Integrations Validated', date: '2026-06-11', status: 'PENDING' },
    { num: 5, name: 'Documentation Complete', date: '2026-06-18', status: 'PENDING' },
    { num: 6, name: 'RELEASE', date: '2026-06-30', status: 'PENDING' },
  ];

  lines.push('| Gate | Name | Target | Status |');
  lines.push('|------|------|--------|--------|');

  for (const gate of gates) {
    const statusEmoji = gate.status === 'PENDING' ? '⏳' : '✅';
    lines.push(
      `| ${gate.num} | ${gate.name} | ${gate.date} | ${statusEmoji} ${gate.status} |`
    );
  }

  lines.push('');

  return lines.join('\n');
}

function generateReport(weekNumber?: number): string {
  const data = loadProgressData();
  const week = weekNumber || getWeekNumber();
  const now = new Date();

  const lines: string[] = [];

  // Header
  lines.push(`# Weekly Standup Report — Week ${week} of 8`);
  lines.push(`**Project:** ${data.projectName}`);
  lines.push(`**Period:** May ${1 + (week - 1) * 7} – May ${7 + (week - 1) * 7}, 2026`);
  lines.push(`**Generated:** ${now.toISOString().split('T')[0]}`);
  lines.push('');

  // Overall metrics
  const totalCompleted = data.statusSnapshot.hoursCompleted;
  const totalRemaining = data.statusSnapshot.hoursRemaining;
  const totalPercent = Math.round(
    (totalCompleted / (totalCompleted + totalRemaining)) * 100
  );

  lines.push('### 📊 OVERALL PROGRESS');
  lines.push('');
  lines.push(`- **Total Hours:** ${totalCompleted}h / ${totalCompleted + totalRemaining}h (${totalPercent}%)`);
  lines.push(`- **Remaining:** ${totalRemaining}h`);
  lines.push(`- **Schedule Status:** 🟢 ON TRACK (or 🟡 AT RISK, 🔴 BEHIND)`);
  lines.push('');

  // Category status
  lines.push(generateCategoryStatus(data));

  // Burndown
  lines.push(generateBurndownChart(data));

  // Gate status
  lines.push(generateGateStatus(data));

  // Risk summary
  lines.push('### ⚠️ ACTIVE RISKS');
  lines.push('');
  lines.push('| Risk | Severity | Mitigation |');
  lines.push('|------|----------|-----------|');
  lines.push('| Example Risk | HIGH | Mitigation strategy |');
  lines.push('');

  // Next week outlook
  lines.push('### 📅 NEXT WEEK');
  lines.push('');
  lines.push('| Task | Owner | Estimate | Priority |');
  lines.push('|------|-------|----------|----------|');
  lines.push('| [Task] | [Owner] | [Hours] | [P1/P2/P3] |');
  lines.push('');

  // Footer
  lines.push('---');
  lines.push(`**Report Generated:** ${now.toISOString()}`);
  lines.push('**Source:** PROGRESS_TRACKING.json');
  lines.push('');

  return lines.join('\n');
}

// Main
function main() {
  const weekArg = process.argv[2];
  const week = weekArg ? parseInt(weekArg, 10) : undefined;

  try {
    const report = generateReport(week);

    // Output to console
    console.log(report);

    // Also save to file
    const outputDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const outputFile = path.join(outputDir, `weekly-report-${dateStr}.md`);

    fs.writeFileSync(outputFile, report, 'utf-8');
    console.error(`\n✅ Report saved to: ${outputFile}`);

  } catch (error) {
    console.error('❌ Error generating report:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { generateReport, loadProgressData, calculateCategoryMetrics };
