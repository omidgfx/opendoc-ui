/** Post-build start choices and deployment notes. */
import {note, section, success, ui, warning} from './ui.mjs';
import {npmCmd, readEnv, runCmd, sanitizeEnv, spawnChild} from './env.mjs';
import {trackChild} from './lifecycle.mjs';
import {pollHealthz} from './docker.mjs';
import {ROOT} from './paths.mjs';

export async function startChoice(prompter, config, dockerInfo) {
    const {select} = prompter;
    section('Start');
    const choices = [];
    if (config.profile !== 'static' && dockerInfo.available && dockerInfo.compose) {
        choices.push({value: 'docker', label: 'Docker container', hint: 'docker compose up --build -d'});
    }
    choices.push({
        value: 'preview',
        label: 'Local preview',
        hint: 'npm run preview · serves dist/ (local preview only, not a production server)',
    });
    choices.push({value: 'dev', label: 'Dev server', hint: 'npm run dev · port 3000 with HMR'});
    if (config.aiGateway.enabled) {
        choices.push({value: 'gateway', label: 'AI gateway only', hint: 'npm run ai-gateway'});
    }
    choices.push({value: 'none', label: 'No — show deployment notes'});
    const choice = await select('Build finished successfully. Start it now?', choices, {defaultIndex: 0});
    if (choice === 'none') {
        showDeploymentNotes(config, dockerInfo);
        return;
    }
    if (choice === 'docker') {
        console.log(ui.dim('   Starting Docker container (first build may take a while)…'));
        const code = await runCmd('docker', ['compose', 'up', '--build', '-d']);
        if (code === 0) {
            const healthy = await pollHealthz(config.docker.port);
            if (healthy) success(`OpenDoc UI is healthy at http://localhost:${config.docker.port}`);
            else
                warning(
                    `Compose started, but /healthz did not respond on port ${config.docker.port} yet. Check: docker compose ps`,
                );
            note('stop it with: docker compose down');
        }
        return;
    }
    if (choice === 'preview' || choice === 'dev') {
        await runCmd(npmCmd(), ['run', choice]);
        return;
    }
    if (choice === 'gateway') {
        console.log(ui.dim(`   Starting AI gateway on http://localhost:${config.aiGateway.port}…`));
        const gateway = spawnChild(npmCmd(), ['run', 'ai-gateway'], {
            stdio: 'inherit',
            env: sanitizeEnv({...process.env, ...readEnv()}),
            cwd: ROOT,
        });
        trackChild(gateway);
        await new Promise(resolve => gateway.on('close', resolve));
    }
}

export function showDeploymentNotes(config, dockerInfo) {
    section('Deployment notes');
    console.log(
        `   dist/            ${ui.bold('static output')} — serve it from any static host (nginx, Netlify, S3…).`,
    );
    console.log(
        `                   base path "${config.basePath}"${config.basePath !== '/' ? ' (GitHub Pages project sites use /<repo>/).' : ''}`,
    );
    console.log(`   config           Mode 1 public/config.json · Mode 2 window.INITIAL_CONFIG · Mode 3 local-only.`);
    console.log(
        `   load-from-url    ${config.loadFromUrl ? 'enabled' : 'disabled'}${config.downloaderTemplate ? ` via ${config.downloaderTemplate}` : ''}`,
    );
    console.log(
        `   ai gateway       ${config.aiGateway.enabled ? `http://localhost:${config.aiGateway.port} (npm run ai-gateway)` : 'not configured (browser-direct provider mode)'}`,
    );
    if (config.profile !== 'static' && dockerInfo.available) {
        console.log(`   docker           docker compose up --build -d → http://localhost:${config.docker.port}`);
        console.log(`                   health check: http://localhost:${config.docker.port}/healthz`);
    }
    if (config.aiGateway.enabled) {
        console.log(`   gateway token    ${ui.dim('kept in .env only — the gateway rejects requests without it')}`);
    }
}
