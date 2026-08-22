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

const mcp = await builder
    .addUvicornApp('mcp', './src/mcp', 'app.main:app')
    .withUv()
    .withHttpHealthCheck({ path: '/health' })
    .withComputeEnvironment(aca);

const agent = await builder
    .addUvicornApp('agent', './src/agent', 'app.main:app')
    .withUv()
    .withEnvironment('MCP_URL', mcp.getEndpoint('http'))
    .withEnvironment('COPILOT_GITHUB_TOKEN', copilotToken)
    .withReference(mcp)
    .waitFor(mcp)
    .withHttpHealthCheck({ path: '/health' })
    .withComputeEnvironment(aca);

await builder
    .addViteApp('web', './src/web')
    .withEnvironment('AGENT_UPSTREAM', agent.getEndpoint('http'))
    .withReference(agent)
    .waitFor(agent)
    .withComputeEnvironment(aca)
    .withExternalHttpEndpoints();

await builder.build().run();
