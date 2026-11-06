import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

export default async function setup(config) {
  const origin = new URL(config.projects[0].use.baseURL);
  const projectId = process.env.MARTINI_TEST_PROJECT ?? 'demo-martini-mt';
  if (!['127.0.0.1', 'localhost'].includes(origin.hostname) || !/^demo-[a-z0-9-]+$/.test(projectId)) {
    throw new Error('Browser tests require a local server and a demo emulator project.');
  }
  // The app explicitly uses the default database instance, including its suffix.
  const environment = await initializeTestEnvironment({
    projectId: `${projectId}-default-rtdb`,
    database: { host: '127.0.0.1', port: 9000, rules: await readFile(new URL('../database.rules.json', import.meta.url), 'utf8') },
  });
  await environment.cleanup();
}
