import { chromium } from 'playwright';
const OUT = '/private/var/folders/vw/bj0fkh2911j2kvf_5wbpww3h0000gn/T/opencode/shots';
const BASE = 'http://localhost:5174';
const questions = Array.from({ length: 3 }, (_, i) => ({
  question: `Section probe ${i + 1}: choose Alpha.`,
  options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  answer: 'Alpha',
}));
const paper = {
  topic: 'SSC CGL sectional mock',
  questions,
  sections: [
    {
      id: 'gi',
      name: 'General Intelligence',
      questionTypes: ['mcq'],
      marksPerQuestion: 2,
      negativeMarks: 0.5,
      instructions: 'Two marks for a correct answer; 0.5 is deducted for a wrong one.',
      questionCount: 2,
      questionIndexes: [0, 1],
    },
    {
      id: 'ga',
      name: 'General Awareness',
      questionTypes: ['mcq'],
      marksPerQuestion: 2,
      negativeMarks: 0.5,
      instructions: null,
      questionCount: 1,
      questionIndexes: [2],
    },
  ],
  examMeta: { examName: 'SSC CGL', durationMinutes: 3 },
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(BASE + '/', { waitUntil: 'load' });
const created = await page.evaluate(async (p) => {
  const res = await fetch('/api/test/db', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sql: 'INSERT INTO ai_test (test, topic, language, num_questions) VALUES ($1::jsonb, $2, $3, $4) RETURNING id',
      params: [JSON.stringify(p), p.topic, 'english', p.questions.length],
    }),
  });
  return res.json();
}, paper);
const id = created.rows?.[0]?.id;
await page.goto(`${BASE}/test?id=${id}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
const summary = await page.evaluate(() => ({
  marking: document.querySelector('.test-marking-row')?.textContent?.replace(/\s+/g, ' ').trim(),
  chips: [...document.querySelectorAll('.test-summary-meta .test-meta-chip')].map((c) => c.textContent.trim()),
}));
await page.screenshot({ path: `${OUT}/section-summary.png` });
await page.getByRole('button', { name: 'Start Test' }).click();
await page.waitForTimeout(700);
const section = await page.evaluate(() => ({
  banner: document.querySelector('.test-section-banner')?.textContent?.replace(/\s+/g, ' ').trim(),
  timer: document.querySelector('.test-timer')?.textContent.trim(),
}));
await page.screenshot({ path: `${OUT}/section-question.png` });
// Answer Q1 wrong, Q2 right, Q3 right.
const clickOption = async (label) => {
  await page.getByRole('radio', { name: label }).first().click().catch(async () => {
    await page.getByText(label, { exact: true }).first().click();
  });
};
await clickOption('Beta');
await page.getByRole('button', { name: 'Next' }).click();
await page.waitForTimeout(300);
await clickOption('Alpha');
await page.getByRole('button', { name: 'Next' }).click();
await page.waitForTimeout(300);
await clickOption('Alpha');
await page.getByRole('button', { name: 'Submit Test' }).click().catch(async () => {
  await page.getByRole('button', { name: /Submit/ }).first().click();
});
await page.waitForTimeout(500);
const sheet = page.locator('.review-sheet, [role="dialog"]');
if (await sheet.count()) {
  await page.getByRole('button', { name: /Submit/ }).last().click().catch(() => {});
}
await page.waitForURL(/results/, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1200);
const results = await page.evaluate(() => ({
  url: location.pathname + location.search,
  marks: [...document.querySelectorAll('.hero-compare, .hero-meta')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
}));
console.log(JSON.stringify({ id, summary, section, results }, null, 2));
await browser.close();
