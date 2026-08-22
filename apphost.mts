import { createBuilder } from './.aspire/modules/aspire.mjs';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';

if (existsSync('.env')) loadEnvFile('.env');

const builder = await createBuilder();
const aca = await builder.addAzureContainerAppEnvironment('aca');

const copilotToken = await builder.addParameter('copilot-github-token', {
    value: process.env.COPILOT_GITHUB_TOKEN,
    secret: true,
});

// PRD 9 / TRD: scale-to-zero would cold-start-timeout a judge's first request,
// so min replicas is fixed here as code (IaC) instead of a manual az cli step.
const mcp = await builder
    .addUvicornApp('mcp', './src/mcp', 'app.main:app')
    .withUv()
    .withHttpHealthCheck({ path: '/health' })
    .withComputeEnvironment(aca)
    .publishAsAzureContainerApp(async (_infrastructure, containerApp) => {
        await containerApp.configureScale({ minReplicas: 1 });
    });

const agent = await builder
    .addUvicornApp('agent', './src/agent', 'app.main:app')
    .withUv()
    .withEnvironment('MCP_URL', mcp.getEndpoint('http'))
    .withEnvironment('COPILOT_GITHUB_TOKEN', copilotToken)
    .withReference(mcp)
    .waitFor(mcp)
    .withHttpHealthCheck({ path: '/health' })
    .withComputeEnvironment(aca)
    .publishAsAzureContainerApp(async (_infrastructure, containerApp) => {
        await containerApp.configureScale({ minReplicas: 1 });
    });

// Vite output is build-only, so web ships as an nginx container that serves the
// bundle and reverse-proxies /agent with SSE buffering disabled (same origin, no CORS).
await builder
    .addDockerfile('web', './src/web')
    .withHttpEndpoint({ targetPort: 8080 })
    .withEnvironment('AGENT_UPSTREAM', agent.getEndpoint('http'))
    .withReference(agent)
    .waitFor(agent)
    .withComputeEnvironment(aca)
    .withExternalHttpEndpoints()
    .publishAsAzureContainerApp(async (_infrastructure, containerApp) => {
        await containerApp.configureScale({ minReplicas: 1 });
    });

await builder.build().run();
